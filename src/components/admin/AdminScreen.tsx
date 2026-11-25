"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, BookOpen, Copy, FilePlus2, ImagePlus, Layers, Loader2, Pencil, Presentation, RotateCcw, ShieldAlert, Trash2, Type } from "lucide-react";
import { ExamplesAdmin } from "./ExamplesAdmin";
import { TextsModal, textsOf } from "./TextsModal";
import { CategorySelect, UploadAssetsModal, parseTags } from "./forms";
import { AssetThumb } from "@/components/editor/LibraryPanel";
import { Confirm, Modal } from "@/components/ui/Modal";
import { FluidThumb } from "@/components/slide/SlideView";
import { applyBuiltin, useApp } from "@/lib/app";
import { data } from "@/lib/backend";
import { cloneSlides } from "@/lib/ids";
import { STARTER_ASSETS, STARTER_TEMPLATES, firstSlide, resolveAvatarInSlides, tokenizeAvatarInSlides } from "@/lib/starter";
import { ASSET_CATEGORIES, TEMPLATE_CATEGORIES, type Asset, type AssetCategory, type DeckMeta, type Template } from "@/lib/types";

const errorText = (e: unknown) => (e instanceof Error ? e.message : "Une erreur est survenue");

/** Panel admin (staff) : gérer les éléments de bibliothèque et les modèles. */
export function AdminScreen() {
  const { profile, loading } = useApp();
  // Onglet demandé par l'adresse (retour de l'éditeur de modèles : /admin?onglet=modeles).
  const [tab, setTab] = useState<"assets" | "templates" | "examples">(() => {
    const onglet = typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("onglet");
    return onglet === "modeles" ? "templates" : onglet === "exemples" ? "examples" : "assets";
  });

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center gap-3 text-[18px] font-extrabold">
        <Loader2 className="spin" size={24} strokeWidth={3} /> Chargement…
      </div>
    );
  }

  if (!profile?.isStaff) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 p-6 text-center" data-testid="admin-denied">
        <ShieldAlert size={46} strokeWidth={2.2} />
        <h1 className="display text-[30px]">Réservé au staff</h1>
        <p className="max-w-md text-[16px] font-semibold text-muted">
          {profile?.staffStale
            ? "Ton rôle staff n'a pas été vérifié depuis plus de 7 jours. Déconnecte-toi puis reconnecte-toi avec Discord pour le confirmer."
            : profile
              ? "Ce panel est ouvert aux membres qui ont le rôle @staff sur le serveur Discord MS Creators. Si tu viens de l'obtenir, reconnecte-toi."
              : "Connecte-toi avec Discord pour continuer."}
        </p>
        <Link href="/" className="nb-btn sun">
          Retour à l&apos;accueil
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-full w-full max-w-[1280px] flex-col gap-5 px-5 py-6" data-testid="admin">
      <header className="flex flex-wrap items-center gap-4 rounded-[22px] border-[3px] border-ink bg-sun px-5 py-3 shadow-[4px_5px_0_#111]">
        <Link href="/" className="ic-btn" aria-label="Retour à l'accueil" title="Retour à l'accueil">
          <ArrowLeft size={20} strokeWidth={2.8} />
        </Link>
        <h1 className="display text-[26px]">Panel admin</h1>
        <div className="ml-auto flex gap-2">
          <button className={"chip " + (tab === "assets" ? "on" : "")} onClick={() => setTab("assets")} data-testid="admin-tab-assets">
            <ImagePlus size={15} strokeWidth={2.8} />
            Bibliothèque
          </button>
          <button className={"chip " + (tab === "templates" ? "on" : "")} onClick={() => setTab("templates")} data-testid="admin-tab-templates">
            <Layers size={15} strokeWidth={2.8} />
            Modèles
          </button>
          <button className={"chip " + (tab === "examples" ? "on" : "")} onClick={() => setTab("examples")} data-testid="admin-tab-examples">
            <BookOpen size={15} strokeWidth={2.8} />
            Exemples
          </button>
        </div>
      </header>
      {tab === "assets" ? <AssetsAdmin /> : tab === "templates" ? <TemplatesAdmin /> : <ExamplesAdmin />}
    </div>
  );
}

/** Renommer un élément ou un modèle : du pack de départ (nom remplacé) ou ajouté par le staff. */
function RenameModal({ title, current, original, onSave, onClose }: { title: string; current: string; original?: string; onSave: (name: string | null) => Promise<void>; onClose: () => void }) {
  const { toast } = useApp();
  const [name, setName] = useState(current);
  const [busy, setBusy] = useState(false);
  const save = async (value: string | null) => {
    setBusy(true);
    try {
      await onSave(value);
      onClose();
    } catch (e) {
      toast(errorText(e), "error");
      setBusy(false);
    }
  };
  return (
    <Modal
      title={title}
      onClose={onClose}
      width={460}
      footer={
        <>
          <button className="nb-btn" onClick={onClose}>
            Annuler
          </button>
          <button className="nb-btn sun" disabled={!name.trim() || busy} onClick={() => save(original !== undefined && name.trim() === original ? null : name.trim())} data-testid="rename-save">
            Enregistrer
          </button>
        </>
      }
    >
      <label className="flex flex-col gap-1.5 text-[13px] font-extrabold">
        Nouveau nom
        <input
          className="nb-input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && name.trim() && !busy && save(original !== undefined && name.trim() === original ? null : name.trim())}
          maxLength={80}
          autoFocus
          data-testid="rename-input"
        />
      </label>
      {original !== undefined && current !== original && (
        <button className="mt-3 text-[13px] font-bold text-muted underline hover:text-ink" onClick={() => save(null)} disabled={busy}>
          Revenir au nom d&apos;origine : « {original} »
        </button>
      )}
    </Modal>
  );
}

/** Éléments du pack de départ supprimés : récupérables, au cas où. */
function DeletedBuiltins({ items, kind }: { items: { id: string; name: string }[]; kind: string }) {
  const { reloadLibrary, toast } = useApp();
  if (!items.length) return null;
  return (
    <details className="rounded-[14px] border-[2.5px] border-dashed border-ink bg-white px-4 py-3" data-testid="deleted-builtins">
      <summary className="cursor-pointer text-[14px] font-extrabold">
        {items.length} {kind} du pack de départ supprimé{items.length > 1 ? "s" : ""} — restaurer
      </summary>
      <div className="mt-3 flex flex-wrap gap-2">
        {items.map((it) => (
          <button
            key={it.id}
            className="nb-btn sm"
            onClick={async () => {
              try {
                await data.setHidden(it.id, false);
                await reloadLibrary();
                toast(`« ${it.name} » est de retour`, "ok");
              } catch (e) {
                toast(errorText(e), "error");
              }
            }}
            data-restore={it.id}
          >
            <RotateCcw size={14} strokeWidth={2.8} />
            {it.name}
          </button>
        ))}
      </div>
    </details>
  );
}

/* ───────────── Éléments de bibliothèque ───────────── */

function AssetsAdmin() {
  const { customAssets, hidden, builtinNames, builtinContents, reloadLibrary, toast, profile } = useApp();
  const [category, setCategory] = useState<AssetCategory | "all">("all");
  const [upload, setUpload] = useState(false);
  const [editing, setEditing] = useState<Asset | null>(null);
  const [renaming, setRenaming] = useState<Asset | null>(null);
  const [writing, setWriting] = useState<Asset | null>(null);
  const [toDelete, setToDelete] = useState<Asset | null>(null);

  const named = (a: Asset) => applyBuiltin(a, builtinNames, builtinContents);
  const list = useMemo(() => {
    const all = [...customAssets, ...STARTER_ASSETS.filter((a) => !hidden.has(a.id)).map((a) => applyBuiltin(a, builtinNames, builtinContents))];
    return category === "all" ? all : all.filter((a) => a.category === category);
  }, [customAssets, category, hidden, builtinNames, builtinContents]);
  const deleted = STARTER_ASSETS.filter((a) => hidden.has(a.id)).map(named);

  const avatar = profile?.avatarUrl ?? null;

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <button className={"chip " + (category === "all" ? "on" : "")} onClick={() => setCategory("all")}>
          Tout
        </button>
        {ASSET_CATEGORIES.map((c) => (
          <button key={c.id} className={"chip " + (category === c.id ? "on" : "")} onClick={() => setCategory(c.id)}>
            {c.label}
          </button>
        ))}
        <button className="nb-btn sun ml-auto" onClick={() => setUpload(true)} data-testid="admin-upload">
          <ImagePlus size={17} strokeWidth={2.8} />
          Ajouter des images
        </button>
      </div>
      <p className="rounded-[14px] border-[2.5px] border-dashed border-ink bg-white px-4 py-2.5 text-[14px] font-semibold">
        <b className="font-extrabold">Pour ajouter un bloc</b> (carte, titre, étiquette…) : fabrique-le dans l&apos;éditeur, sélectionne-le, puis ouvre le menu « ··· » et choisis « Ajouter à la
        bibliothèque ».
      </p>

      <div className="grid grid-cols-[repeat(auto-fill,minmax(210px,1fr))] gap-4" data-testid="admin-assets">
        {list.map((a) => {
          const shown = a.kind === "elements" && a.elements ? { ...a, elements: a.elements.map((el) => (el.type === "image" && el.src === "{avatar}" ? { ...el, src: avatar || "/library/avatar-defaut.svg" } : el)) } : a;
          return (
            <div key={a.id} className="flex flex-col rounded-[14px] border-[2.5px] border-ink bg-white p-2.5 shadow-[3px_3px_0_#111]" data-asset-id={a.id}>
              <div className="overflow-hidden rounded-[9px] border-2 border-ink" style={{ background: "radial-gradient(circle at 50% 45%, #ffecc4, #ffcf8a)" }}>
                <div className="flex justify-center">
                  <AssetThumb asset={shown} width={186} height={112} />
                </div>
              </div>
              <div className="mt-2 truncate text-[14px] font-extrabold">{a.name}</div>
              <div className="mb-2 text-[12px] font-semibold text-muted">
                {ASSET_CATEGORIES.find((c) => c.id === a.category)?.label} · {a.builtin ? "pack de départ" : "ajouté par le staff"}
              </div>
              <div className="mt-auto flex flex-wrap gap-2">
                {textsOf(a.elements).length > 0 && (
                  <button className="nb-btn sm sun" onClick={() => setWriting(a)} title="Réécrire les textes de cet élément" data-testid="asset-texts">
                    <Type size={14} strokeWidth={2.8} />
                    Textes
                  </button>
                )}
                <button className="nb-btn sm" onClick={() => (a.builtin ? setRenaming(a) : setEditing(a))} data-testid="asset-rename">
                  <Pencil size={14} strokeWidth={2.8} />
                  Renommer
                </button>
                <button className="nb-btn sm" onClick={() => setToDelete(a)} data-testid="asset-delete">
                  <Trash2 size={14} strokeWidth={2.8} />
                  Supprimer
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <DeletedBuiltins items={deleted} kind="élément" />

      {upload && <UploadAssetsModal category={category === "all" ? "stickers" : category} onClose={() => setUpload(false)} />}
      {editing && <EditAssetModal asset={editing} onClose={() => setEditing(null)} />}
      {writing?.elements && (
        <TextsModal
          name={writing.name}
          elements={writing.elements}
          canRestore={!!writing.builtin && !!builtinContents[writing.id]}
          onSave={async (elements) => {
            if (writing.builtin) await data.setBuiltinContent(writing.id, elements);
            else await data.updateAsset(writing.id, { elements: elements ?? writing.elements });
            await reloadLibrary();
          }}
          onClose={() => setWriting(null)}
        />
      )}
      {renaming && (
        <RenameModal
          title="Renommer l'élément"
          current={renaming.name}
          original={STARTER_ASSETS.find((x) => x.id === renaming.id)?.name}
          onSave={async (name) => {
            await data.setBuiltinName(renaming.id, name);
            await reloadLibrary();
          }}
          onClose={() => setRenaming(null)}
        />
      )}
      {toDelete && (
        <Confirm
          title="Supprimer cet élément ?"
          message={<>« {toDelete.name} » disparaîtra de la bibliothèque pour tout le monde. Les diapos qui l&apos;utilisent déjà ne changent pas.</>}
          confirmLabel="Supprimer"
          danger
          onConfirm={async () => {
            try {
              if (toDelete.builtin) await data.setHidden(toDelete.id, true);
              else await data.deleteAsset(toDelete.id);
              toast("Élément supprimé");
              await reloadLibrary();
            } catch (e) {
              toast(errorText(e), "error");
            }
          }}
          onClose={() => setToDelete(null)}
        />
      )}
    </>
  );
}

function EditAssetModal({ asset, onClose }: { asset: Asset; onClose: () => void }) {
  const { reloadLibrary, toast } = useApp();
  const [name, setName] = useState(asset.name);
  const [category, setCategory] = useState(asset.category);
  const [tags, setTags] = useState(asset.tags.join(", "));
  const [busy, setBusy] = useState(false);
  return (
    <Modal
      title="Renommer l'élément"
      onClose={onClose}
      width={480}
      footer={
        <>
          <button className="nb-btn" onClick={onClose}>
            Annuler
          </button>
          <button
            className="nb-btn sun"
            disabled={!name.trim() || busy}
            onClick={async () => {
              setBusy(true);
              try {
                await data.updateAsset(asset.id, { name: name.trim(), category, tags: parseTags(tags) });
                await reloadLibrary();
                onClose();
              } catch (e) {
                toast(errorText(e), "error");
                setBusy(false);
              }
            }}
          >
            Enregistrer
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <label className="flex flex-col gap-1.5 text-[13px] font-extrabold">
          Nom
          <input className="nb-input" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </label>
        <label className="flex flex-col gap-1.5 text-[13px] font-extrabold">
          Catégorie
          <CategorySelect value={category} onChange={setCategory} />
        </label>
        <label className="flex flex-col gap-1.5 text-[13px] font-extrabold">
          Mots-clés (séparés par des virgules)
          <input className="nb-input" value={tags} onChange={(e) => setTags(e.target.value)} />
        </label>
      </div>
    </Modal>
  );
}

/* ───────────── Modèles ───────────── */

function TemplatesAdmin() {
  const router = useRouter();
  const { customTemplates, hidden, builtinNames, reloadLibrary, toast, profile } = useApp();
  const [busy, setBusy] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [toDelete, setToDelete] = useState<Template | null>(null);
  const [renaming, setRenaming] = useState<Template | null>(null);
  const [toCopy, setToCopy] = useState<Template | null>(null);
  const [kind, setKind] = useState<"all" | Template["kind"]>("all");
  const [query, setQuery] = useState("");
  const avatar = profile?.avatarUrl ?? null;

  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    try {
      await fn();
    } catch (e) {
      toast(errorText(e), "error");
    } finally {
      // Toujours relâché : la page garde son état quand on y revient depuis l'éditeur.
      setBusy(null);
    }
  };

  const create = (k: "slide" | "deck") =>
    run(k, async () => {
      const t = await data.createTemplate({
        kind: k,
        name: k === "slide" ? "Nouveau modèle de diapo" : "Nouveau modèle de présentation",
        category: k === "slide" ? "contenu" : "ouverture",
        slides: [firstSlide()],
      });
      await reloadLibrary();
      router.push(`/modele/${t.id}`);
    });

  /** Copie modifiable, à la même place. Les diapos gardent la bulle du présentateur sous forme de repère. */
  const copyOf = (t: Template, name: string) =>
    data.createTemplate({ kind: t.kind, name, category: t.category, slides: tokenizeAvatarInSlides(cloneSlides(t.slides), avatar), sort: t.sort });

  const edit = (t: Template) => {
    if (t.builtin) setToCopy(t);
    else router.push(`/modele/${t.id}`);
  };

  /** Modèle du pack : une copie le remplace pour tout le monde, l'original reste récupérable. */
  const replaceBuiltin = (t: Template) =>
    run(t.id, async () => {
      const copy = await copyOf(t, t.name);
      await data.setHidden(t.id, true);
      await reloadLibrary();
      router.push(`/modele/${copy.id}`);
    });

  const duplicate = (t: Template) =>
    run(`dup:${t.id}`, async () => {
      await copyOf(t, `${t.name} (copie)`.slice(0, 80));
      await reloadLibrary();
      toast(`« ${t.name} » dupliqué`, "ok");
    });

  const named = (t: Template) => (builtinNames[t.id] ? { ...t, name: builtinNames[t.id] } : t);
  // Même ordre que la galerie des modèles : une copie prend la place de l'original.
  const all = [...customTemplates, ...STARTER_TEMPLATES.filter((t) => !hidden.has(t.id)).map(named)].sort((a, b) => a.sort - b.sort);
  const q = query.trim().toLowerCase();
  const list = all.filter((t) => (kind === "all" || t.kind === kind) && (!q || t.name.toLowerCase().includes(q)));
  const deleted = STARTER_TEMPLATES.filter((t) => hidden.has(t.id)).map(named);

  return (
    <>
      <div className="flex flex-wrap items-center gap-2.5">
        <button className="nb-btn sun" onClick={() => create("slide")} disabled={!!busy} data-testid="admin-new-slide-template">
          {busy === "slide" ? <Loader2 size={17} className="spin" /> : <FilePlus2 size={17} strokeWidth={2.8} />}
          Nouveau modèle de diapo
        </button>
        <button className="nb-btn" onClick={() => create("deck")} disabled={!!busy} data-testid="admin-new-deck-template">
          {busy === "deck" ? <Loader2 size={17} className="spin" /> : <Presentation size={17} strokeWidth={2.8} />}
          Nouveau modèle de présentation
        </button>
        <button className="nb-btn" onClick={() => setImporting(true)} data-testid="admin-import">
          Depuis une de mes présentations…
        </button>
      </div>
      <p className="rounded-[14px] border-[2.5px] border-dashed border-ink bg-white px-4 py-2.5 text-[14px] font-semibold">
        « Modifier » ouvre le modèle dans l&apos;éditeur de diapos : on y ajoute, retire et réordonne les diapos, on change textes, images et fonds, et tout
        s&apos;enregistre pour tout le monde. Un modèle du pack de départ est d&apos;abord remplacé par une copie modifiable ; l&apos;original reste récupérable.
      </p>

      <div className="flex flex-wrap items-center gap-2">
        {(
          [
            ["all", "Tous"],
            ["slide", "Diapos"],
            ["deck", "Présentations"],
          ] as const
        ).map(([k, label]) => (
          <button key={k} className={"chip " + (kind === k ? "on" : "")} onClick={() => setKind(k)} data-testid={`templates-filter-${k}`}>
            {label}
          </button>
        ))}
        <div className="ml-auto w-[280px] max-w-full">
          <input className="nb-input h-[38px]" placeholder="Chercher un modèle" aria-label="Chercher un modèle" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
      </div>

      <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-4" data-testid="admin-templates">
        {list.map((t) => (
          <div key={t.id} className="flex flex-col rounded-[14px] border-[2.5px] border-ink bg-white p-2.5 shadow-[3px_3px_0_#111]" data-template-id={t.id}>
            <button className="relative overflow-hidden rounded-[9px] border-2 border-ink" onClick={() => edit(t)} title="Modifier dans l'éditeur" aria-label={`Modifier ${t.name}`}>
              <FluidThumb slide={resolveAvatarInSlides(t.slides.slice(0, 1), avatar)[0]} />
              {busy === t.id && (
                <span className="absolute inset-0 flex items-center justify-center bg-white/60">
                  <Loader2 className="spin" size={26} strokeWidth={3} />
                </span>
              )}
            </button>
            <div className="mt-2 truncate text-[15px] font-extrabold">{t.name}</div>
            <div className="mb-2 text-[12px] font-semibold text-muted">
              {t.kind === "deck" ? `Présentation · ${t.slides.length} diapos` : `Diapo · ${TEMPLATE_CATEGORIES.find((c) => c.id === t.category)?.label ?? ""}`} ·{" "}
              {t.builtin ? "pack de départ" : "modifié par le staff"}
            </div>
            <div className="mt-auto flex flex-wrap items-center gap-2">
              <button className="nb-btn sm sun" onClick={() => edit(t)} disabled={!!busy} data-testid="template-edit">
                <Layers size={14} strokeWidth={2.8} />
                Modifier
              </button>
              <button className="nb-btn sm" onClick={() => setRenaming(t)} aria-label="Renommer" title="Renommer" data-testid="template-rename">
                <Pencil size={14} strokeWidth={2.8} />
              </button>
              <button className="nb-btn sm" onClick={() => duplicate(t)} disabled={!!busy} aria-label="Dupliquer" title="Dupliquer" data-testid="template-duplicate">
                {busy === `dup:${t.id}` ? <Loader2 size={14} className="spin" /> : <Copy size={14} strokeWidth={2.8} />}
              </button>
              <button className="nb-btn sm" onClick={() => setToDelete(t)} aria-label="Supprimer" title="Supprimer" data-testid="template-delete">
                <Trash2 size={14} strokeWidth={2.8} />
              </button>
            </div>
          </div>
        ))}
        {list.length === 0 && <p className="col-span-full py-6 text-center text-[15px] font-bold text-muted">Aucun modèle ne correspond.</p>}
      </div>

      <DeletedBuiltins items={deleted} kind="modèle" />

      {importing && <ImportDeckModal onClose={() => setImporting(false)} />}
      {toCopy && (
        <Confirm
          title="Modifier un modèle du pack de départ"
          message={
            <>
              « {toCopy.name} » est fourni avec l&apos;application. Pour le modifier, une copie prend sa place, au même rang, pour tout le monde. L&apos;original
              reste récupérable en bas de cette page (« supprimés — restaurer »).
            </>
          }
          confirmLabel="Créer la copie et modifier"
          onConfirm={() => replaceBuiltin(toCopy)}
          onClose={() => setToCopy(null)}
        />
      )}
      {renaming && (
        <RenameModal
          title="Renommer le modèle"
          current={renaming.name}
          original={renaming.builtin ? STARTER_TEMPLATES.find((x) => x.id === renaming.id)?.name : undefined}
          onSave={async (name) => {
            if (renaming.builtin) await data.setBuiltinName(renaming.id, name);
            else await data.updateTemplate(renaming.id, { name: name ?? renaming.name });
            await reloadLibrary();
          }}
          onClose={() => setRenaming(null)}
        />
      )}
      {toDelete && (
        <Confirm
          title="Supprimer ce modèle ?"
          message={
            <>
              « {toDelete.name} » ne sera plus proposé. Les présentations déjà créées avec ce modèle ne changent pas.
              {toDelete.builtin ? " Il restera récupérable en bas de cette page." : " C'est définitif."}
            </>
          }
          confirmLabel="Supprimer"
          danger
          onConfirm={async () => {
            try {
              if (toDelete.builtin) await data.setHidden(toDelete.id, true);
              else await data.deleteTemplate(toDelete.id);
              toast("Modèle supprimé");
              await reloadLibrary();
            } catch (e) {
              toast(errorText(e), "error");
            }
          }}
          onClose={() => setToDelete(null)}
        />
      )}
    </>
  );
}

/** Crée un modèle à partir d'une présentation existante du membre du staff. */
function ImportDeckModal({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const { reloadLibrary, toast, profile } = useApp();
  const [decks, setDecks] = useState<DeckMeta[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    data
      .listDecks()
      .then(setDecks)
      .catch(() => setDecks([]));
  }, []);

  const pick = async (meta: DeckMeta) => {
    setBusy(meta.id);
    try {
      const deck = await data.getDeck(meta.id);
      if (!deck) throw new Error("Présentation introuvable");
      const t = await data.createTemplate({
        kind: "deck",
        name: deck.title,
        category: "ouverture",
        slides: tokenizeAvatarInSlides(cloneSlides(deck.slides), profile?.avatarUrl ?? null),
      });
      await reloadLibrary();
      toast("Modèle créé : tu peux l'ajuster avant de le laisser tel quel", "ok");
      router.push(`/modele/${t.id}`);
      // Fermée tout de suite : la page garde son état quand on y revient depuis l'éditeur.
      onClose();
    } catch (e) {
      toast(errorText(e), "error");
      setBusy(null);
    }
  };

  return (
    <Modal title="Choisir une présentation" onClose={onClose} width={760}>
      {decks === null ? (
        <div className="flex items-center gap-3 py-8 text-[15px] font-extrabold">
          <Loader2 className="spin" size={20} strokeWidth={3} /> Chargement…
        </div>
      ) : decks.length === 0 ? (
        <p className="py-8 text-center text-[15px] font-bold text-muted">Tu n&apos;as pas encore de présentation. Crées-en une depuis l&apos;accueil, puis reviens ici.</p>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(210px,1fr))] gap-4">
          {decks.map((d) => (
            <button key={d.id} className="rounded-[14px] border-[2.5px] border-ink bg-white p-2 text-left shadow-[3px_3px_0_#111] hover:-translate-y-0.5" onClick={() => pick(d)} disabled={!!busy}>
              <span className="relative block overflow-hidden rounded-[9px] border-2 border-ink bg-[#ffecc4]">
                {d.cover ? <FluidThumb slide={d.cover} /> : <span className="block aspect-video" />}
                {busy === d.id && (
                  <span className="absolute inset-0 flex items-center justify-center bg-white/60">
                    <Loader2 className="spin" size={26} strokeWidth={3} />
                  </span>
                )}
              </span>
              <span className="mt-1.5 block truncate text-[14px] font-extrabold">{d.title || "Sans titre"}</span>
              <span className="block text-[12px] font-semibold text-muted">{d.slideCount} diapos</span>
            </button>
          ))}
        </div>
      )}
    </Modal>
  );
}
