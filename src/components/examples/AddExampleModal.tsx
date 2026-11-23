"use client";

import { useEffect, useRef, useState } from "react";
import { FileText, Images, Loader2, Presentation, Upload, X } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { FluidThumb } from "@/components/slide/SlideView";
import { pagesLabel } from "./ExampleViewer";
import { useApp } from "@/lib/app";
import { data } from "@/lib/backend";
import { MAX_PDF_BYTES, MAX_SOURCE_BYTES, countPdfPages, isImage, isPdf, publishExample, sortByName, titleFromFileName, type ExampleSource, type PublishProgress } from "@/lib/examples";
import type { DeckMeta } from "@/lib/types";

const errorText = (e: unknown) => (e instanceof Error ? e.message : "Une erreur est survenue");
const mb = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1).replace(".", ",")} Mo`;

type Picked = { kind: "pdf"; file: File; pages: number | null } | { kind: "images"; files: File[] } | null;

/** Dépôt d'un exemple par le staff : un PDF, des images, ou une présentation faite dans l'app. */
export function AddExampleModal({ onClose }: { onClose: () => void }) {
  const { reloadExamples, toast } = useApp();
  const [tab, setTab] = useState<"file" | "deck">("file");
  const [picked, setPicked] = useState<Picked>(null);
  const [decks, setDecks] = useState<DeckMeta[] | null>(null);
  const [deckId, setDeckId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("");
  const [description, setDescription] = useState("");
  const [progress, setProgress] = useState<PublishProgress | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const busy = progress !== null;

  useEffect(() => {
    if (tab !== "deck" || decks) return;
    let alive = true;
    data
      .listDecks()
      .then((d) => alive && setDecks(d))
      .catch(() => alive && setDecks([]));
    return () => {
      alive = false;
    };
  }, [tab, decks]);

  const choose = (list: FileList | File[]) => {
    const files = Array.from(list);
    const pdf = files.find(isPdf);
    if (pdf) {
      if (pdf.size > MAX_SOURCE_BYTES) return toast(`Ce PDF fait ${mb(pdf.size)} : 200 Mo au maximum.`, "error");
      setPicked({ kind: "pdf", file: pdf, pages: null });
      if (!title) setTitle(titleFromFileName(pdf.name));
      countPdfPages(pdf).then(
        (pages) => setPicked((p) => (p?.kind === "pdf" && p.file === pdf ? { ...p, pages } : p)),
        () => {
          toast("Ce fichier n'a pas pu être lu comme un PDF.", "error");
          setPicked(null);
        },
      );
      return;
    }
    const images = sortByName(files.filter(isImage));
    if (!images.length) return toast("Choisis un PDF, ou des images PNG, JPG ou WebP (une par diapo).", "error");
    setPicked({ kind: "images", files: images });
    if (!title) setTitle(titleFromFileName(images[0].name.replace(/[-_ ]*\d+(\.[a-z]+)$/i, "$1")));
  };

  const source = async (): Promise<ExampleSource | null> => {
    if (tab === "deck") {
      if (!deckId) return null;
      const deck = await data.getDeck(deckId);
      return deck ? { kind: "deck", slides: deck.slides } : null;
    }
    if (picked?.kind === "pdf") return { kind: "pdf", file: picked.file };
    if (picked?.kind === "images") return { kind: "images", files: picked.files };
    return null;
  };

  const ready = !!title.trim() && (tab === "deck" ? !!deckId : !!picked && (picked.kind !== "pdf" || picked.pages !== null));

  const submit = async () => {
    setProgress({ phase: "pages", done: 0, total: 0 });
    try {
      const src = await source();
      if (!src) throw new Error("Rien à publier.");
      await publishExample(src, { title, author, description }, setProgress);
      toast("Exemple publié : tout le monde peut le consulter", "ok");
      await reloadExamples();
      onClose();
    } catch (e) {
      toast(errorText(e), "error");
      setProgress(null);
    }
  };

  const progressText = !progress
    ? ""
    : progress.phase === "pdf"
      ? "Envoi du PDF d'origine…"
      : progress.phase === "save"
        ? "Enregistrement…"
        : progress.total
          ? `Préparation des pages : ${progress.done} sur ${progress.total}`
          : "Lecture du fichier…";
  const ratio = !progress ? 0 : progress.phase === "pages" ? (progress.total ? progress.done / progress.total : 0) * 0.92 : progress.phase === "pdf" ? 0.95 : 0.99;

  return (
    <Modal
      title="Ajouter un exemple"
      onClose={busy ? () => undefined : onClose}
      width={680}
      footer={
        busy ? (
          <div className="flex w-full items-center gap-3" data-testid="example-progress">
            <Loader2 size={18} className="spin flex-none" strokeWidth={3} />
            <div className="min-w-0 flex-1">
              <div className="mb-1 text-[13px] font-extrabold">{progressText}</div>
              <div className="h-3 overflow-hidden rounded-full border-2 border-ink bg-white">
                <div className="h-full bg-sun transition-[width]" style={{ width: `${Math.round(ratio * 100)}%` }} />
              </div>
            </div>
            <span className="flex-none text-[12px] font-bold text-muted">Garde cette page ouverte</span>
          </div>
        ) : (
          <>
            <button className="nb-btn" onClick={onClose}>
              Annuler
            </button>
            <button className="nb-btn sun" disabled={!ready} onClick={submit} data-testid="example-submit">
              <Upload size={16} strokeWidth={2.8} />
              Publier l&apos;exemple
            </button>
          </>
        )
      }
    >
      <fieldset disabled={busy} className="flex flex-col gap-4">
        <div className="flex gap-2">
          <button className={"chip " + (tab === "file" ? "on" : "")} onClick={() => setTab("file")}>
            <FileText size={15} strokeWidth={2.8} />
            Un fichier PDF ou des images
          </button>
          <button className={"chip " + (tab === "deck" ? "on" : "")} onClick={() => setTab("deck")} data-testid="example-tab-deck">
            <Presentation size={15} strokeWidth={2.8} />
            Une de mes présentations
          </button>
        </div>

        {tab === "file" ? (
          <>
            {!picked ? (
              <button
                className={
                  "flex flex-col items-center justify-center gap-2 rounded-[16px] border-[2.5px] border-dashed border-ink px-4 py-8 text-center transition-colors " +
                  (dragOver ? "bg-sun" : "bg-[#fff7e6] hover:bg-sun")
                }
                onClick={() => input.current?.click()}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOver(false);
                  choose(e.dataTransfer.files);
                }}
              >
                <Upload size={30} strokeWidth={2.4} />
                <span className="text-[16px] font-extrabold">Choisis un PDF ou des images, ou glisse-les ici</span>
                <span className="max-w-[460px] text-[13px] font-semibold text-muted">
                  Exporte ta présentation en PDF depuis Figma, Canva ou PowerPoint. Pour des images, une par diapo : elles seront rangées dans l&apos;ordre de leur nom.
                </span>
              </button>
            ) : (
              <div className="flex items-center gap-3 rounded-[14px] border-[2.5px] border-ink bg-white p-3" data-testid="example-picked">
                {picked.kind === "pdf" ? <FileText size={28} strokeWidth={2.2} className="flex-none" /> : <Images size={28} strokeWidth={2.2} className="flex-none" />}
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[15px] font-extrabold">{picked.kind === "pdf" ? picked.file.name : `${picked.files.length} image${picked.files.length > 1 ? "s" : ""}`}</div>
                  <div className="text-[13px] font-semibold text-muted">
                    {picked.kind === "pdf" ? (
                      <>
                        {picked.pages === null ? "Lecture…" : pagesLabel(picked.pages)} · {mb(picked.file.size)}
                        {picked.file.size > MAX_PDF_BYTES && " · trop lourd pour proposer le PDF d'origine : seules les pages seront publiées"}
                      </>
                    ) : (
                      <span className="block truncate">{picked.files.map((f) => f.name).join(", ")}</span>
                    )}
                  </div>
                </div>
                <button className="ic-btn" onClick={() => setPicked(null)} aria-label="Changer de fichier" title="Changer de fichier">
                  <X size={18} strokeWidth={2.8} />
                </button>
              </div>
            )}
            <input
              ref={input}
              type="file"
              multiple
              accept="application/pdf,.pdf,image/png,image/jpeg,image/webp"
              className="hidden"
              data-testid="example-input"
              onChange={(e) => {
                if (e.target.files?.length) choose(e.target.files);
                e.target.value = "";
              }}
            />
          </>
        ) : decks === null ? (
          <div className="flex items-center gap-3 py-6 text-[15px] font-extrabold">
            <Loader2 className="spin" size={20} strokeWidth={3} /> Chargement…
          </div>
        ) : decks.length === 0 ? (
          <p className="py-6 text-center text-[15px] font-bold text-muted">Tu n&apos;as pas encore de présentation dans l&apos;app.</p>
        ) : (
          <div className="scroll-thin grid max-h-[300px] grid-cols-[repeat(auto-fill,minmax(170px,1fr))] gap-3 overflow-y-auto p-1">
            {decks.map((d) => (
              <button
                key={d.id}
                className={"rounded-[12px] border-[2.5px] border-ink bg-white p-1.5 text-left " + (deckId === d.id ? "shadow-[0_0_0_4px_#ffcc55]" : "hover:bg-[#fff1cf]")}
                onClick={() => {
                  setDeckId(d.id);
                  if (!title || decks.some((x) => x.title === title)) setTitle(d.title);
                }}
                aria-pressed={deckId === d.id}
                data-pick-deck={d.id}
              >
                <span className="block overflow-hidden rounded-[8px] border-2 border-ink bg-[#ffecc4]">{d.cover ? <FluidThumb slide={d.cover} /> : <span className="block aspect-video" />}</span>
                <span className="mt-1 block truncate text-[13px] font-extrabold">{d.title || "Sans titre"}</span>
                <span className="block text-[12px] font-semibold text-muted">
                  {d.slideCount} diapo{d.slideCount > 1 ? "s" : ""}
                </span>
              </button>
            ))}
          </div>
        )}

        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-extrabold">Titre</span>
          <input className="nb-input" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} placeholder="Ex. Être créateur de contenu à la Mission locale" data-testid="example-title" />
        </label>
        <div className="grid grid-cols-[1fr_1.4fr] gap-4">
          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] font-extrabold">Présenté par (facultatif)</span>
            <input className="nb-input" value={author} onChange={(e) => setAuthor(e.target.value)} maxLength={80} placeholder="Ex. Stéphanie Pinault" data-testid="example-author" />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] font-extrabold">En deux mots (facultatif)</span>
            <input className="nb-input" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={600} placeholder="Ex. Atelier du 14 novembre" />
          </label>
        </div>
      </fieldset>
    </Modal>
  );
}
