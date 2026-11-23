"use client";

import { useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Eye, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { AddExampleModal } from "@/components/examples/AddExampleModal";
import { ExampleViewer, pagesLabel } from "@/components/examples/ExampleViewer";
import { ExamplesSetupNotice } from "@/components/examples/ExamplesSection";
import { Confirm, Modal } from "@/components/ui/Modal";
import { useApp } from "@/lib/app";
import { data, type ExamplePatch } from "@/lib/backend";
import { addExamplePages, isImage, isPdf, pageFiles, type ExampleSource, type PublishProgress } from "@/lib/examples";
import type { Example, ExamplePage } from "@/lib/types";

const errorText = (e: unknown) => (e instanceof Error ? e.message : "Une erreur est survenue");
const dateFr = (iso: string) => new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });

/** Onglet « Exemples » du panel admin. */
export function ExamplesAdmin() {
  const { examples, examplesError, reloadExamples, toast } = useApp();
  const [adding, setAdding] = useState(false);
  const [viewing, setViewing] = useState<Example | null>(null);
  const [editing, setEditing] = useState<Example | null>(null);
  const [toDelete, setToDelete] = useState<Example | null>(null);

  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <p className="flex-1 text-[14px] font-semibold">
          Les exemples sont d&apos;anciennes présentations, <b className="font-extrabold">consultables par tout le monde</b> depuis l&apos;accueil et l&apos;éditeur. Dépose un PDF, des
          images, ou une présentation faite ici.
        </p>
        <button className="nb-btn sun" onClick={() => setAdding(true)} disabled={!!examplesError} data-testid="admin-add-example">
          <Plus size={17} strokeWidth={3} />
          Ajouter un exemple
        </button>
      </div>

      {examplesError && <ExamplesSetupNotice message={examplesError} />}

      {examples === null ? (
        <div className="flex items-center gap-3 py-8 text-[15px] font-extrabold">
          <Loader2 className="spin" size={20} strokeWidth={3} /> Chargement…
        </div>
      ) : examples.length === 0 && !examplesError ? (
        <div className="rounded-[18px] border-[2.5px] border-dashed border-ink bg-white px-6 py-10 text-center text-[15px] font-bold text-muted">Aucun exemple pour l&apos;instant.</div>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-4" data-testid="admin-examples">
          {examples.map((ex) => (
            <div key={ex.id} className="flex flex-col rounded-[14px] border-[2.5px] border-ink bg-white p-2.5 shadow-[3px_3px_0_#111]" data-example-id={ex.id}>
              <button className="block overflow-hidden rounded-[9px] border-2 border-ink bg-[#ffecc4]" onClick={() => setViewing(ex)} title="Feuilleter">
                {ex.pages[0] && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={ex.pages[0].thumb} alt="" loading="lazy" className="block aspect-video w-full object-cover" />
                )}
              </button>
              <div className="mt-2 truncate text-[15px] font-extrabold">{ex.title}</div>
              <div className="mb-2 text-[12px] font-semibold text-muted">
                {[ex.author && `Présenté par ${ex.author}`, pagesLabel(ex.pages.length), ex.pdfUrl ? "PDF d'origine" : null, `ajouté le ${dateFr(ex.createdAt)}`].filter(Boolean).join(" · ")}
              </div>
              <div className="mt-auto flex flex-wrap gap-2">
                <button className="nb-btn sm" onClick={() => setViewing(ex)}>
                  <Eye size={14} strokeWidth={2.8} />
                  Voir
                </button>
                <button className="nb-btn sm" onClick={() => setEditing(ex)}>
                  <Pencil size={14} strokeWidth={2.8} />
                  Modifier
                </button>
                <button className="nb-btn sm" onClick={() => setToDelete(ex)} aria-label="Supprimer" title="Supprimer">
                  <Trash2 size={14} strokeWidth={2.8} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {adding && <AddExampleModal onClose={() => setAdding(false)} />}
      {viewing && <ExampleViewer example={viewing} onClose={() => setViewing(null)} />}
      {editing && <EditExampleModal example={editing} onClose={() => setEditing(null)} />}
      {toDelete && (
        <Confirm
          title="Supprimer cet exemple ?"
          message={
            <>
              « {toDelete.title} » et ses {pagesLabel(toDelete.pages.length)} disparaîtront pour tout le monde. Cette action ne peut pas être annulée.
            </>
          }
          confirmLabel="Supprimer"
          danger
          onConfirm={async () => {
            try {
              await data.deleteExample(toDelete.id);
              toast("Exemple supprimé");
              await reloadExamples();
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

function EditExampleModal({ example, onClose }: { example: Example; onClose: () => void }) {
  const { reloadExamples, toast } = useApp();
  const [title, setTitle] = useState(example.title);
  const [author, setAuthor] = useState(example.author);
  const [description, setDescription] = useState(example.description);
  const [pages, setPages] = useState<ExamplePage[]>(example.pages);
  // Pages ajoutées pendant cette modification : leurs fichiers sont déjà envoyés.
  const [added, setAdded] = useState<ExamplePage[]>([]);
  const [adding, setAdding] = useState<PublishProgress | null>(null);
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [dropAt, setDropAt] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const pagesChanged = pages.length !== example.pages.length || pages.some((p, i) => p.url !== example.pages[i]?.url);
  const locked = busy || !!adding;

  const move = (from: number, to: number) => {
    if (to < 0 || to >= pages.length || from === to) return;
    setPages((list) => {
      const next = list.slice();
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  };

  const addFiles = async (list: FileList) => {
    const files = Array.from(list);
    const pdf = files.find(isPdf);
    const images = files.filter(isImage);
    const source: ExampleSource | null = pdf ? { kind: "pdf", file: pdf } : images.length ? { kind: "images", files: images } : null;
    if (!source) return toast("Choisis un PDF, ou des images PNG, JPG ou WebP.", "error");
    setAdding({ phase: "pages", done: 0, total: 0 });
    try {
      const fresh = await addExamplePages(example.id, source, setAdding);
      setAdded((a) => [...a, ...fresh]);
      setPages((list) => [...list, ...fresh]);
      toast(`${pagesLabel(fresh.length)} ajoutée${fresh.length > 1 ? "s" : ""} à la fin`, "ok");
    } catch (e) {
      toast(errorText(e), "error");
    } finally {
      setAdding(null);
    }
  };

  const cancel = () => {
    if (locked) return;
    // Rien n'a été enregistré : les pages envoyées pour rien sont effacées.
    if (added.length) data.deleteExampleFiles(example.id, pageFiles(added)).catch(() => undefined);
    onClose();
  };

  const save = async () => {
    setBusy(true);
    try {
      const patch: ExamplePatch = { title: title.trim(), author: author.trim(), description: description.trim() };
      // Pages modifiées : le PDF d'origine ne correspond plus, le téléchargement sera fabriqué à partir des pages.
      if (pagesChanged) patch.pages = pages;
      if (pagesChanged && example.pdfUrl) patch.pdfUrl = null;
      await data.updateExample(example.id, patch);
      const kept = new Set(pages.map((p) => p.url));
      const orphans = [...example.pages, ...added].filter((p) => !kept.has(p.url));
      const files = pageFiles(orphans);
      if (pagesChanged && example.pdfUrl) files.push(example.pdfUrl);
      if (files.length) await data.deleteExampleFiles(example.id, files).catch(() => undefined);
      await reloadExamples();
      onClose();
    } catch (e) {
      toast(errorText(e), "error");
      setBusy(false);
    }
  };

  return (
    <Modal
      title="Modifier l'exemple"
      onClose={cancel}
      width={940}
      footer={
        <>
          {adding && (
            <span className="mr-auto flex items-center gap-2 text-[13px] font-extrabold" data-testid="example-adding">
              <Loader2 size={16} className="spin" strokeWidth={3} />
              {adding.total ? `Ajout des pages : ${adding.done} sur ${adding.total}` : "Lecture du fichier…"}
            </span>
          )}
          <button className="nb-btn" onClick={cancel} disabled={locked}>
            Annuler
          </button>
          <button className="nb-btn sun" disabled={!title.trim() || !pages.length || locked} onClick={save} data-testid="example-edit-save">
            {busy && <Loader2 size={16} className="spin" />}
            Enregistrer
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-[1.4fr_1fr_1.2fr] gap-3">
          <label className="flex flex-col gap-1.5 text-[13px] font-extrabold">
            Titre
            <input className="nb-input" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} data-testid="example-edit-title" />
          </label>
          <label className="flex flex-col gap-1.5 text-[13px] font-extrabold">
            Présenté par
            <input className="nb-input" value={author} onChange={(e) => setAuthor(e.target.value)} maxLength={80} />
          </label>
          <label className="flex flex-col gap-1.5 text-[13px] font-extrabold">
            En deux mots
            <input className="nb-input" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={600} />
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <h3 className="display text-[17px]">Pages</h3>
          <span className="text-[13px] font-bold text-muted">{pagesLabel(pages.length)} · glisse une page pour la déplacer · la première sert de couverture</span>
          <button className="nb-btn sm ml-auto" onClick={() => input.current?.click()} disabled={locked} data-testid="example-add-pages">
            <Plus size={15} strokeWidth={3} />
            Ajouter des pages
          </button>
          <input
            ref={input}
            type="file"
            multiple
            accept="application/pdf,.pdf,image/png,image/jpeg,image/webp"
            className="hidden"
            data-testid="example-add-input"
            onChange={(e) => {
              if (e.target.files?.length) addFiles(e.target.files);
              e.target.value = "";
            }}
          />
        </div>

        {pagesChanged && example.pdfUrl && (
          <p className="rounded-[12px] border-2 border-ink bg-[#fff1cf] px-3 py-2 text-[13px] font-bold">
            Les pages ont changé : le PDF d&apos;origine ne sera plus proposé, le téléchargement sera fabriqué à partir des pages.
          </p>
        )}

        <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-3" data-testid="example-pages">
          {pages.map((p, i) => (
            <div
              key={p.url}
              data-page-url={p.url}
              draggable={!locked}
              onDragStart={(e) => {
                setDragFrom(i);
                e.dataTransfer.effectAllowed = "move";
                e.dataTransfer.setData("text/plain", String(i));
              }}
              onDragOver={(e) => {
                if (dragFrom === null) return;
                e.preventDefault();
                if (dropAt !== i) setDropAt(i);
              }}
              onDrop={(e) => {
                e.preventDefault();
                if (dragFrom !== null) move(dragFrom, i);
                setDragFrom(null);
                setDropAt(null);
              }}
              onDragEnd={() => {
                setDragFrom(null);
                setDropAt(null);
              }}
              className={
                "group relative cursor-grab rounded-[10px] border-[2.5px] border-ink bg-white p-1.5 active:cursor-grabbing " +
                (dropAt === i && dragFrom !== null && dragFrom !== i ? "outline-dashed outline-[3px] outline-blue" : "") +
                (dragFrom === i ? " opacity-40" : "")
              }
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.thumb} alt={`Page ${i + 1}`} className="block w-full rounded-[6px] border-2 border-ink object-cover" style={{ aspectRatio: `${p.w} / ${p.h}` }} draggable={false} />
              <span className="absolute left-0.5 top-0.5 flex h-6 min-w-6 items-center justify-center rounded-full border-2 border-ink bg-sun px-1 text-[11px] font-black">{i + 1}</span>
              <div className="mt-1.5 flex items-center justify-between gap-1">
                <button className="ic-btn !h-7 !min-w-7 !px-1" onClick={() => move(i, i - 1)} disabled={i === 0 || locked} aria-label="Avancer la page" title="Avancer">
                  <ChevronLeft size={16} strokeWidth={3} />
                </button>
                <button
                  className="ic-btn !h-7 !min-w-7 !px-1 text-[#c92a2a]"
                  onClick={() => setPages((list) => list.filter((_, j) => j !== i))}
                  disabled={pages.length === 1 || locked}
                  aria-label={`Retirer la page ${i + 1}`}
                  title={pages.length === 1 ? "Un exemple garde au moins une page" : "Retirer la page"}
                  data-testid="example-page-remove"
                >
                  <Trash2 size={15} strokeWidth={2.8} />
                </button>
                <button className="ic-btn !h-7 !min-w-7 !px-1" onClick={() => move(i, i + 1)} disabled={i === pages.length - 1 || locked} aria-label="Reculer la page" title="Reculer">
                  <ChevronRight size={16} strokeWidth={3} />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </Modal>
  );
}
