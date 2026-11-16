"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CircleHelp, Lightbulb, Loader2, Minus, Plus, ShieldCheck } from "lucide-react";
import { SaveElementsModal, SaveTemplateModal, UploadAssetsModal } from "@/components/admin/forms";
import { Modal } from "@/components/ui/Modal";
import { Canvas, markFresh } from "./Canvas";
import { HelpModal } from "./HelpModal";
import { LibraryPanel } from "./LibraryPanel";
import { PresentMode } from "./PresentMode";
import { SlidesPanel } from "./SlidesPanel";
import { TemplatesModal } from "./TemplatesModal";
import { Toolbar } from "./Toolbar";
import { TopBar } from "./TopBar";
import { useApp } from "@/lib/app";
import { data } from "@/lib/backend";
import { currentSlide, hasClipboard, useEditor } from "@/lib/editor/store";
import { exportPdf, exportPng, exportZip } from "@/lib/export";
import { makeImage, makeShape, makeText, placeAt } from "@/lib/factory";
import { bbox, type Pt } from "@/lib/geometry";
import { cloneEls, cloneSlides } from "@/lib/ids";
import { imageSize } from "@/lib/images";
import { resolveAvatarInSlides, tokenizeAvatarInSlides } from "@/lib/starter";
import { SLIDE_H, SLIDE_W, type Asset, type AssetCategory, type El, type ShapeKind, type Slide, type Template } from "@/lib/types";

const CLIPBOARD_MARK = "ms-diapos:elements";
const errorText = (e: unknown) => (e instanceof Error ? e.message : "Une erreur est survenue");

type Dialog =
  | { kind: "templates" }
  | { kind: "help" }
  | { kind: "upload"; category: AssetCategory }
  | { kind: "save-els"; els: El[] }
  | { kind: "save-template"; scope: "slide" | "deck"; slides: Slide[] }
  | { kind: "export"; done: number; total: number; label: string }
  | null;

export function EditorScreen({ docKind, docId }: { docKind: "deck" | "template"; docId: string }) {
  const router = useRouter();
  const { profile, loading, assets, toast } = useApp();
  const [status, setStatus] = useState<"loading" | "ready" | "missing">("loading");
  const [dialog, setDialog] = useState<Dialog>(null);
  const [presenting, setPresenting] = useState<number | null>(null);
  const [category, setCategory] = useState<AssetCategory>("titres");
  const [bgForAll, setBgForAll] = useState(false);
  const flush = useRef<() => Promise<void>>(async () => {});
  const zoom = useEditor((s) => s.zoom);
  const hasSelection = useEditor((s) => s.selection.length > 0);
  const slideCount = useEditor((s) => s.slides.length);

  const avatar = profile?.avatarUrl ?? null;
  const isStaff = !!profile?.isStaff;

  /* ───────────── Chargement ───────────── */

  useEffect(() => {
    if (loading) return;
    if (!profile) {
      router.replace("/");
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const doc =
          docKind === "deck"
            ? await data.getDeck(docId)
            : await data.getTemplate(docId).then((t) => (t ? { title: t.name, slides: resolveAvatarInSlides(t.slides, avatar) } : null));
        if (cancelled) return;
        if (!doc) {
          setStatus("missing");
          return;
        }
        useEditor.getState().load({ title: doc.title, slides: doc.slides });
        setStatus("ready");
      } catch (e) {
        if (!cancelled) {
          toast(errorText(e), "error");
          setStatus("missing");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // Le profil ne doit pas relancer le chargement à chaque rafraîchissement de session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docKind, docId, loading, !!profile]);

  /* ───────────── Enregistrement automatique ───────────── */

  useEffect(() => {
    if (status !== "ready") return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let saving = false;
    let again = false;

    const run = async () => {
      if (saving) {
        again = true;
        return;
      }
      const s = useEditor.getState();
      if (s.revision === s.savedRevision) return;
      saving = true;
      const rev = s.markSaving();
      try {
        const title = s.title.trim() || "Sans titre";
        if (docKind === "deck") await data.saveDeck(docId, { title, slides: s.slides });
        else await data.updateTemplate(docId, { name: title, slides: tokenizeAvatarInSlides(s.slides, avatar) });
        useEditor.getState().markSaved(rev);
      } catch (e) {
        useEditor.getState().markError();
        toast(errorText(e), "error");
      } finally {
        saving = false;
        if (again) {
          again = false;
          schedule(300);
        }
      }
    };
    const schedule = (ms: number) => {
      clearTimeout(timer);
      timer = setTimeout(run, ms);
    };
    flush.current = run;
    const unsub = useEditor.subscribe((s, prev) => {
      if (s.revision !== prev.revision) schedule(900);
    });
    const onHide = () => {
      if (document.visibilityState === "hidden") run();
    };
    const onUnload = (e: BeforeUnloadEvent) => {
      const s = useEditor.getState();
      if (s.revision !== s.savedRevision) {
        run();
        e.preventDefault();
      }
    };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("beforeunload", onUnload);
    return () => {
      unsub();
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("beforeunload", onUnload);
      useEditor.getState().stopEditing();
      run();
    };
  }, [status, docKind, docId, avatar, toast]);

  /* ───────────── Ajouts ───────────── */

  /** Centre de la diapo, décalé si un élément s'y trouve déjà : un ajout ne se pose jamais pile sur un autre. */
  const centerOf = (): Pt => {
    const els = currentSlide(useEditor.getState()).els;
    const p = { x: SLIDE_W / 2, y: SLIDE_H / 2 };
    for (let i = 0; i < 8; i++) {
      const taken = els.some((el) => Math.abs(el.x + el.w / 2 - p.x) < 24 && Math.abs(el.y + el.h / 2 - p.y) < 24);
      if (!taken) break;
      p.x += 44;
      p.y += 44;
    }
    return p;
  };

  const addText = useCallback(() => {
    const [el] = placeAt([makeText({ text: "Ton texte", size: 80, w: 1100 })], centerOf());
    markFresh([el.id]);
    const st = useEditor.getState();
    st.addEls([el]);
    // On écrit tout de suite : le texte d'exemple est sélectionné, la frappe le remplace.
    st.startEditing(el.id);
  }, []);

  const addShape = useCallback((shape: ShapeKind) => {
    useEditor.getState().addEls(placeAt([makeShape(shape)], centerOf()));
  }, []);

  const uploadOne = useCallback(
    async (file: File) => {
      const up = await data.uploadImage(file, "user");
      return up;
    },
    [],
  );

  const addImages = useCallback(
    async (files: File[], at?: Pt) => {
      const images = files.filter((f) => f.type.startsWith("image/"));
      if (!images.length) return;
      toast(images.length > 1 ? `Envoi de ${images.length} images…` : "Envoi de l'image…");
      const added: El[] = [];
      for (const [i, file] of images.entries()) {
        try {
          const up = await uploadOne(file);
          const el = makeImage(up.url, up);
          const p = at ?? centerOf();
          added.push(...placeAt([el], { x: p.x + i * 40, y: p.y + i * 40 }));
        } catch (e) {
          toast(errorText(e), "error");
        }
      }
      if (added.length) useEditor.getState().addEls(added);
    },
    [toast, uploadOne],
  );

  const replaceImage = useCallback(
    async (id: string, file: File) => {
      try {
        toast("Envoi de l'image…");
        const up = await uploadOne(file);
        useEditor.getState().updateEls([id], (el) => (el.type === "image" ? { ...el, src: up.url } : el));
      } catch (e) {
        toast(errorText(e), "error");
      }
    },
    [toast, uploadOne],
  );

  const insertAsset = useCallback(
    async (asset: Asset, at?: Pt) => {
      const st = useEditor.getState();
      if (asset.kind === "image" && asset.url) {
        if (asset.category === "fonds") {
          st.setBackground({ kind: "image", src: asset.url }, bgForAll);
          return;
        }
        let size = { width: asset.width ?? 0, height: asset.height ?? 0 };
        if (!size.width || !size.height) size = await imageSize(asset.url).catch(() => ({ width: 400, height: 400 }));
        // Un sticker arrive à une taille de sticker, pas en plein écran.
        const cap = asset.category === "stickers" ? 260 / Math.max(size.width, size.height) : 1;
        const k = Math.min(1, cap);
        const el = makeImage(asset.url, { width: size.width * k, height: size.height * k }, { fit: "contain" });
        st.addEls(placeAt([el], at ?? centerOf()));
        return;
      }
      if (asset.elements?.length) {
        const els = placeAt(cloneEls(asset.elements), at ?? centerOf());
        markFresh(els.filter((e) => e.type === "text").map((e) => e.id));
        st.addEls(els);
      }
    },
    [bgForAll],
  );

  const onDropAsset = useCallback(
    (assetId: string, at: Pt) => {
      const asset = assets.find((a) => a.id === assetId);
      if (asset) insertAsset(asset, at);
    },
    [assets, insertAsset],
  );

  const onDropFiles = useCallback(
    (files: File[], at: Pt) => {
      // Un fichier lâché sur une image existante la remplace (pratique pour les cadres photo).
      if (files.length === 1) {
        const slide = currentSlide(useEditor.getState());
        const target = [...slide.els].reverse().find((el) => {
          if (el.type !== "image") return false;
          const b = bbox(el);
          return at.x >= b.x && at.x <= b.x + b.w && at.y >= b.y && at.y <= b.y + b.h;
        });
        if (target) {
          replaceImage(target.id, files[0]);
          return;
        }
      }
      addImages(files, at);
    },
    [addImages, replaceImage],
  );

  const pickTemplate = useCallback(
    (t: Template) => {
      useEditor.getState().addSlides(cloneSlides(t.slides));
      setDialog(null);
      toast(t.kind === "deck" ? `${t.slides.length} diapos ajoutées` : `Diapo « ${t.name} » ajoutée`, "ok");
    },
    [toast],
  );

  /* ───────────── Export, présentation ───────────── */

  const runExport = useCallback(
    async (kind: "pdf" | "png" | "zip") => {
      const st = useEditor.getState();
      st.stopEditing();
      const { title, slides, current } = useEditor.getState();
      const name = title.trim() || "Présentation";
      const total = kind === "png" ? 1 : slides.length;
      const label = kind === "pdf" ? "Création du PDF" : kind === "zip" ? "Création des images" : "Création de l'image";
      setDialog({ kind: "export", done: 0, total, label });
      const onProgress = (done: number, t: number) => setDialog({ kind: "export", done, total: t, label });
      try {
        if (kind === "pdf") await exportPdf(name, slides, onProgress);
        else if (kind === "zip") await exportZip(name, slides, onProgress);
        else await exportPng(name, slides[current], current);
        toast("Téléchargement lancé", "ok");
      } catch (e) {
        toast(`L'export a échoué : ${errorText(e)}`, "error");
      } finally {
        setDialog(null);
      }
    },
    [toast],
  );

  const present = useCallback(() => {
    const st = useEditor.getState();
    st.stopEditing();
    st.select([]);
    // Le plein écran doit être demandé dans le geste de l'utilisateur.
    document.documentElement.requestFullscreen?.().catch(() => undefined);
    setPresenting(useEditor.getState().current);
  }, []);

  const exitPresent = useCallback((index: number) => {
    if (document.fullscreenElement) document.exitFullscreen?.().catch(() => undefined);
    setPresenting(null);
    useEditor.getState().goTo(index);
  }, []);

  /* ───────────── Clavier et presse-papiers ───────────── */

  const blocked = presenting !== null || dialog !== null || status !== "ready";

  useEffect(() => {
    if (blocked) return;
    const inField = (t: EventTarget | null) => !!(t as HTMLElement | null)?.closest?.("input, textarea, select");

    const onKey = (e: KeyboardEvent) => {
      const st = useEditor.getState();
      if (st.editingId) {
        // Pendant la saisie, seul Échap est intercepté : le reste appartient au texte.
        if (e.key === "Escape") {
          e.preventDefault();
          st.stopEditing();
        }
        return;
      }
      if (inField(e.target)) return;
      const mod = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();
      const ids = st.selection;

      if (mod && key === "z") {
        e.preventDefault();
        if (e.shiftKey) st.redo();
        else st.undo();
      } else if (mod && key === "y") {
        e.preventDefault();
        st.redo();
      } else if (mod && key === "d") {
        e.preventDefault();
        st.duplicateEls(ids);
      } else if (mod && key === "a") {
        e.preventDefault();
        st.selectAll();
      } else if (mod && key === "g") {
        e.preventDefault();
        if (e.shiftKey) st.ungroup(ids);
        else st.group(ids);
      } else if (mod && key === "]") {
        e.preventDefault();
        st.reorder(ids, e.shiftKey ? "front" : "forward");
      } else if (mod && key === "[") {
        e.preventDefault();
        st.reorder(ids, e.shiftKey ? "back" : "backward");
      } else if (mod && key === "s") {
        // Tout est enregistré automatiquement : on enregistre tout de suite plutôt que d'ouvrir la boîte du navigateur.
        e.preventDefault();
        flush.current();
      } else if (key === "delete" || key === "backspace") {
        if (ids.length) {
          e.preventDefault();
          st.removeEls(ids);
        }
      } else if (key === "escape") {
        st.select([]);
      } else if (key === "enter" && ids.length === 1) {
        const el = currentSlide(st).els.find((x) => x.id === ids[0]);
        if (el?.type === "text") {
          e.preventDefault();
          st.startEditing(el.id);
        }
      } else if (key.startsWith("arrow") && !mod) {
        e.preventDefault();
        if (ids.length) {
          const step = e.shiftKey ? 10 : 1;
          st.nudge(ids, key === "arrowleft" ? -step : key === "arrowright" ? step : 0, key === "arrowup" ? -step : key === "arrowdown" ? step : 0);
        } else {
          st.goTo(st.current + (key === "arrowleft" || key === "arrowup" ? -1 : 1));
        }
      } else if (key === "pagedown") {
        e.preventDefault();
        st.goTo(st.current + 1);
      } else if (key === "pageup") {
        e.preventDefault();
        st.goTo(st.current - 1);
      }
    };

    const onCopy = (e: ClipboardEvent) => {
      const st = useEditor.getState();
      if (st.editingId || inField(e.target) || !st.selection.length) return;
      st.copy();
      // Marqueur dans le presse-papiers système : au collage, on saura que c'est notre copie la plus récente.
      e.clipboardData?.setData("text/plain", CLIPBOARD_MARK);
      e.preventDefault();
    };

    const onCut = (e: ClipboardEvent) => {
      const st = useEditor.getState();
      if (st.editingId || inField(e.target) || !st.selection.length) return;
      st.cut();
      e.clipboardData?.setData("text/plain", CLIPBOARD_MARK);
      e.preventDefault();
    };

    const onPaste = (e: ClipboardEvent) => {
      const st = useEditor.getState();
      const text = e.clipboardData?.getData("text/plain") ?? "";
      if (st.editingId) {
        // Dans un texte, on colle du texte brut : pas de mise en forme venue d'ailleurs.
        e.preventDefault();
        document.execCommand("insertText", false, text);
        return;
      }
      if (inField(e.target)) return;
      const files = Array.from(e.clipboardData?.files ?? []).filter((f) => f.type.startsWith("image/"));
      if (files.length) {
        e.preventDefault();
        addImages(files);
      } else if (text === CLIPBOARD_MARK && hasClipboard()) {
        e.preventDefault();
        st.paste();
      } else if (text.trim() && text !== CLIPBOARD_MARK) {
        e.preventDefault();
        const el = makeText({ text: text.trim().slice(0, 2000), size: 56, w: 1300 });
        st.addEls([el]);
      }
    };

    window.addEventListener("keydown", onKey);
    document.addEventListener("copy", onCopy);
    document.addEventListener("cut", onCut);
    document.addEventListener("paste", onPaste);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("copy", onCopy);
      document.removeEventListener("cut", onCut);
      document.removeEventListener("paste", onPaste);
    };
  }, [blocked, addImages]);

  /* ───────────── Rendu ───────────── */

  if (status === "loading" || loading) {
    return (
      <div className="flex h-full items-center justify-center gap-3 text-[18px] font-extrabold">
        <Loader2 className="spin" size={24} strokeWidth={3} />
        Ouverture…
      </div>
    );
  }

  if (status === "missing") {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 p-6 text-center">
        <h1 className="display text-[30px]">{docKind === "deck" ? "Présentation introuvable" : "Modèle introuvable"}</h1>
        <p className="max-w-md text-[16px] font-semibold text-muted">Elle a peut-être été supprimée, ou elle appartient à un autre compte.</p>
        <Link href="/" className="nb-btn sun">
          Retour à mes présentations
        </Link>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-[640px] min-w-[1180px] flex-col gap-3.5 p-3.5" data-testid="editor">
      <TopBar
        docLabel={docKind === "deck" ? "de ta présentation" : "du modèle"}
        onAddText={addText}
        onAddShape={addShape}
        onAddImages={(files) => addImages(files)}
        onShowBackgrounds={() => setCategory("fonds")}
        onExport={runExport}
        onPresent={present}
        onRetrySave={() => flush.current()}
      />

      <div className="flex min-h-0 flex-1 gap-3.5">
        <SlidesPanel />

        <div className="flex min-w-0 flex-1 flex-col gap-3.5">
          <div className="flex min-h-0 flex-1 gap-3.5">
            <main className="nb relative flex min-w-0 flex-1 flex-col overflow-hidden p-2">
              <div className="pointer-events-none absolute left-0 right-0 top-[14px] z-20 flex justify-center px-3">
                <div className="pointer-events-auto max-w-full">
                  <Toolbar
                    isStaff={isStaff}
                    onSaveToLibrary={() => {
                      const st = useEditor.getState();
                      const els = currentSlide(st).els.filter((el) => st.selection.includes(el.id));
                      if (els.length) setDialog({ kind: "save-els", els });
                    }}
                    onReplaceImage={(file) => {
                      const id = useEditor.getState().selection[0];
                      if (id) replaceImage(id, file);
                    }}
                  />
                </div>
              </div>
              <div className="min-h-0 flex-1">
                <Canvas onDropAsset={onDropAsset} onDropFiles={onDropFiles} />
              </div>
              <div className="flex items-center justify-center gap-2 px-3 pb-1 pt-2 text-[13px] font-bold text-muted">
                <Lightbulb size={15} strokeWidth={2.6} />
                {hasSelection
                  ? "Glisse pour déplacer · tire un coin pour agrandir · double-clique sur un texte pour l'écrire"
                  : "Double-clique sur un texte pour l'écrire · glisse un élément de la bibliothèque sur la diapo"}
              </div>
            </main>

            <aside className="flex w-[132px] flex-none flex-col gap-3.5">
              <button
                className="group flex flex-col items-center gap-1.5 rounded-[20px] border-[3px] border-ink bg-coral px-2 py-3.5 text-center shadow-[4px_5px_0_#111] transition-transform hover:-translate-x-px hover:-translate-y-px active:translate-x-0.5 active:translate-y-0.5"
                onClick={() => setDialog({ kind: "templates" })}
                data-testid="open-templates"
              >
                <span className="relative mb-1 h-[46px] w-[58px]">
                  <span className="absolute left-2 top-0 h-[36px] w-[50px] rotate-6 rounded-md border-[2.5px] border-ink bg-sun" />
                  <span className="absolute left-0 top-2 flex h-[36px] w-[50px] items-center justify-center rounded-md border-[2.5px] border-ink bg-white text-[13px] font-black">Aa</span>
                </span>
                <span className="display text-[17px]">Modèles</span>
                <span className="text-[12px] font-bold leading-tight">Pars d&apos;un modèle tout prêt</span>
              </button>

              <div className="nb flex flex-col items-center gap-2 !rounded-[18px] p-2.5">
                <span className="text-[12px] font-extrabold">Zoom</span>
                <div className="flex items-center gap-1">
                  <button className="flex h-8 w-8 items-center justify-center rounded-[9px] border-[2.5px] border-ink bg-white hover:bg-sun" onClick={() => useEditor.getState().setZoom(zoom - 0.25)} aria-label="Dézoomer">
                    <Minus size={15} strokeWidth={3.2} />
                  </button>
                  <span className="w-[42px] text-center text-[13px] font-extrabold tabular-nums" data-testid="zoom-value">
                    {Math.round(zoom * 100)} %
                  </span>
                  <button className="flex h-8 w-8 items-center justify-center rounded-[9px] border-[2.5px] border-ink bg-white hover:bg-sun" onClick={() => useEditor.getState().setZoom(zoom + 0.25)} aria-label="Zoomer">
                    <Plus size={15} strokeWidth={3.2} />
                  </button>
                </div>
                <button className="w-full rounded-[10px] border-[2.5px] border-ink bg-white py-1 text-[13px] font-extrabold hover:bg-sun" onClick={() => useEditor.getState().setZoom(1)}>
                  Ajuster
                </button>
              </div>

              <button className="nb flex items-center justify-center gap-2 !rounded-[16px] py-2.5 text-[14px] font-extrabold hover:bg-sun" onClick={() => setDialog({ kind: "help" })} data-testid="open-help">
                <CircleHelp size={17} strokeWidth={2.6} />
                Aide
              </button>

              {isStaff && (
                <Link href="/admin" className="nb flex items-center justify-center gap-2 !rounded-[16px] py-2.5 text-[14px] font-extrabold hover:bg-sun" title="Panel admin : bibliothèque et modèles">
                  <ShieldCheck size={17} strokeWidth={2.6} />
                  Admin
                </Link>
              )}
            </aside>
          </div>

          <LibraryPanel
            category={category}
            onCategory={setCategory}
            onInsert={(a) => insertAsset(a)}
            onAdd={(c) => setDialog({ kind: "upload", category: c })}
            bgForAll={bgForAll}
            onBgForAll={setBgForAll}
          />
        </div>
      </div>

      {dialog?.kind === "templates" && (
        <TemplatesModal
          onClose={() => setDialog(null)}
          onPick={pickTemplate}
          onSave={
            isStaff
              ? (scope) => {
                  const st = useEditor.getState();
                  st.stopEditing();
                  const s = useEditor.getState();
                  setDialog({ kind: "save-template", scope, slides: scope === "slide" ? [currentSlide(s)] : s.slides });
                }
              : undefined
          }
        />
      )}
      {dialog?.kind === "help" && <HelpModal onClose={() => setDialog(null)} />}
      {dialog?.kind === "upload" && <UploadAssetsModal category={dialog.category} onClose={() => setDialog(null)} />}
      {dialog?.kind === "save-els" && <SaveElementsModal els={dialog.els} onClose={() => setDialog(null)} />}
      {dialog?.kind === "save-template" && <SaveTemplateModal slides={dialog.slides} kind={dialog.scope} onClose={() => setDialog(null)} />}
      {dialog?.kind === "export" && (
        <Modal title={dialog.label} onClose={() => undefined} width={420}>
          <div className="flex flex-col items-center gap-4 py-3">
            <Loader2 className="spin" size={34} strokeWidth={3} />
            <div className="text-[16px] font-extrabold" data-testid="export-progress">
              {dialog.total > 1 ? `Diapo ${Math.min(dialog.done + 1, dialog.total)} sur ${dialog.total}` : "Un instant…"}
            </div>
            <div className="h-3.5 w-full overflow-hidden rounded-full border-[2.5px] border-ink bg-white">
              <div className="h-full bg-sun transition-[width]" style={{ width: `${(dialog.done / Math.max(1, dialog.total)) * 100}%` }} />
            </div>
          </div>
        </Modal>
      )}

      {presenting !== null && <PresentMode slides={useEditor.getState().slides} start={Math.min(presenting, slideCount - 1)} onExit={exitPresent} />}
    </div>
  );
}
