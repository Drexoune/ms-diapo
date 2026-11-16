"use client";

import { useRef, useState } from "react";
import { ImagePlus, Loader2, X } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { ElementsThumb, SlideThumb } from "@/components/slide/SlideView";
import { useApp } from "@/lib/app";
import { data } from "@/lib/backend";
import { cloneEls, cloneSlides } from "@/lib/ids";
import { tokenizeAvatarInEls, tokenizeAvatarInSlides } from "@/lib/starter";
import { ASSET_CATEGORIES, TEMPLATE_CATEGORIES, type AssetCategory, type El, type Slide, type TemplateCategory } from "@/lib/types";

/** Formulaires du staff : ajout d'éléments à la bibliothèque et de modèles. */

const errorText = (e: unknown) => (e instanceof Error ? e.message : "Une erreur est survenue");

export const parseTags = (s: string) =>
  s
    .split(",")
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean)
    .slice(0, 12);

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[13px] font-extrabold">{label}</span>
      {children}
      {hint && <span className="text-[12px] font-semibold text-muted">{hint}</span>}
    </label>
  );
}

export function CategorySelect({ value, onChange }: { value: AssetCategory; onChange: (c: AssetCategory) => void }) {
  return (
    <select className="nb-input" value={value} onChange={(e) => onChange(e.target.value as AssetCategory)}>
      {ASSET_CATEGORIES.map((c) => (
        <option key={c.id} value={c.id}>
          {c.label}
        </option>
      ))}
    </select>
  );
}

/** Envoi d'une ou plusieurs images dans la bibliothèque. */
export function UploadAssetsModal({ category: initial, onClose }: { category: AssetCategory; onClose: () => void }) {
  const { reloadLibrary, toast } = useApp();
  const [category, setCategory] = useState<AssetCategory>(["stickers", "photos", "fonds"].includes(initial) ? initial : "stickers");
  const [files, setFiles] = useState<{ file: File; name: string; preview: string }[]>([]);
  const [tags, setTags] = useState("");
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const add = (list: FileList | File[]) => {
    const next = Array.from(list)
      .filter((f) => f.type.startsWith("image/"))
      .map((file) => ({
        file,
        name: file.name
          .replace(/\.[a-z0-9]+$/i, "")
          .replace(/[-_]+/g, " ")
          .trim(),
        preview: URL.createObjectURL(file),
      }));
    setFiles((f) => [...f, ...next]);
  };

  const submit = async () => {
    setBusy(true);
    let done = 0;
    try {
      for (const f of files) {
        const up = await data.uploadImage(f.file, "library");
        await data.createAsset({ category, name: f.name || "Sans nom", tags: parseTags(tags), kind: "image", url: up.url, width: up.width, height: up.height });
        done += 1;
      }
      toast(done > 1 ? `${done} images ajoutées à la bibliothèque` : "Image ajoutée à la bibliothèque", "ok");
      await reloadLibrary();
      onClose();
    } catch (e) {
      toast(errorText(e), "error");
      if (done) await reloadLibrary();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title="Ajouter des images"
      onClose={onClose}
      width={620}
      footer={
        <>
          <button className="nb-btn" onClick={onClose}>
            Annuler
          </button>
          <button className="nb-btn sun" disabled={!files.length || busy} onClick={submit} data-testid="upload-submit">
            {busy && <Loader2 size={16} className="spin" />}
            Ajouter {files.length > 1 ? `${files.length} images` : "à la bibliothèque"}
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <button
          className="flex flex-col items-center justify-center gap-2 rounded-[16px] border-[2.5px] border-dashed border-ink bg-[#fff7e6] px-4 py-7 text-center hover:bg-sun"
          onClick={() => input.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            add(e.dataTransfer.files);
          }}
        >
          <ImagePlus size={30} strokeWidth={2.4} />
          <span className="text-[16px] font-extrabold">Choisis des images ou glisse-les ici</span>
          <span className="text-[13px] font-semibold text-muted">PNG, JPG, WebP, GIF ou SVG · 12 Mo maximum · fond transparent conseillé pour les stickers</span>
        </button>
        <input
          ref={input}
          type="file"
          multiple
          accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
          className="hidden"
          data-testid="upload-input"
          onChange={(e) => {
            if (e.target.files) add(e.target.files);
            e.target.value = "";
          }}
        />
        {files.length > 0 && (
          <div className="flex flex-col gap-2">
            {files.map((f, i) => (
              <div key={f.preview} className="flex items-center gap-3 rounded-[12px] border-2 border-ink bg-white p-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={f.preview} alt="" className="h-12 w-12 flex-none rounded-md bg-[#ffecc4] object-contain" />
                <input
                  className="nb-input !py-1.5"
                  value={f.name}
                  onChange={(e) => setFiles((list) => list.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))}
                  aria-label="Nom de l'élément"
                />
                <button className="ic-btn" onClick={() => setFiles((list) => list.filter((_, j) => j !== i))} aria-label="Retirer">
                  <X size={18} strokeWidth={2.6} />
                </button>
              </div>
            ))}
          </div>
        )}
        <div className="grid grid-cols-2 gap-4">
          <Field label="Catégorie">
            <CategorySelect value={category} onChange={setCategory} />
          </Field>
          <Field label="Mots-clés" hint="Séparés par des virgules, pour la recherche">
            <input className="nb-input" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="logo, étoile, déco" />
          </Field>
        </div>
      </div>
    </Modal>
  );
}

/** Enregistre un bloc d'éléments de diapo comme élément de bibliothèque. */
export function SaveElementsModal({ els, onClose }: { els: El[]; onClose: () => void }) {
  const { reloadLibrary, toast, profile } = useApp();
  const guess: AssetCategory = els.every((e) => e.type === "image") ? "photos" : els.length === 1 && els[0].type === "text" ? (els[0].box ? "etiquettes" : "titres") : "cartes";
  const [name, setName] = useState("");
  const [category, setCategory] = useState<AssetCategory>(guess);
  const [tags, setTags] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    try {
      const x0 = Math.min(...els.map((e) => e.x));
      const y0 = Math.min(...els.map((e) => e.y));
      const elements = tokenizeAvatarInEls(cloneEls(els, -x0, -y0), profile?.avatarUrl ?? null);
      await data.createAsset({ category, name: name.trim(), tags: parseTags(tags), kind: "elements", elements });
      toast("Élément ajouté à la bibliothèque", "ok");
      await reloadLibrary();
      onClose();
    } catch (e) {
      toast(errorText(e), "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title="Ajouter à la bibliothèque"
      onClose={onClose}
      width={560}
      footer={
        <>
          <button className="nb-btn" onClick={onClose}>
            Annuler
          </button>
          <button className="nb-btn sun" disabled={!name.trim() || busy} onClick={submit} data-testid="save-asset-submit">
            {busy && <Loader2 size={16} className="spin" />}
            Ajouter
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="flex justify-center overflow-hidden rounded-[14px] border-[2.5px] border-ink" style={{ background: "radial-gradient(circle at 50% 45%, #ffecc4, #ffcf8a)" }}>
          <ElementsThumb els={els} width={500} height={190} />
        </div>
        <Field label="Nom">
          <input className="nb-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex. Carte événement" autoFocus data-testid="save-asset-name" />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Catégorie">
            <CategorySelect value={category} onChange={setCategory} />
          </Field>
          <Field label="Mots-clés" hint="Séparés par des virgules">
            <input className="nb-input" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="carte, planning" />
          </Field>
        </div>
      </div>
    </Modal>
  );
}

/** Enregistre une diapo (ou toute une présentation) comme modèle. */
export function SaveTemplateModal({ slides, kind, onClose }: { slides: Slide[]; kind: "slide" | "deck"; onClose: () => void }) {
  const { reloadLibrary, toast, profile } = useApp();
  const [name, setName] = useState("");
  const [category, setCategory] = useState<TemplateCategory>("contenu");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    try {
      await data.createTemplate({
        kind,
        name: name.trim(),
        category: kind === "deck" ? "ouverture" : category,
        slides: tokenizeAvatarInSlides(cloneSlides(slides), profile?.avatarUrl ?? null),
      });
      toast(kind === "deck" ? "Présentation enregistrée comme modèle" : "Diapo enregistrée comme modèle", "ok");
      await reloadLibrary();
      onClose();
    } catch (e) {
      toast(errorText(e), "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title={kind === "deck" ? "Nouveau modèle de présentation" : "Nouveau modèle de diapo"}
      onClose={onClose}
      width={560}
      footer={
        <>
          <button className="nb-btn" onClick={onClose}>
            Annuler
          </button>
          <button className="nb-btn sun" disabled={!name.trim() || busy} onClick={submit} data-testid="save-template-submit">
            {busy && <Loader2 size={16} className="spin" />}
            Enregistrer le modèle
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="scroll-thin flex gap-3 overflow-x-auto pb-1">
          {slides.slice(0, 12).map((s) => (
            <div key={s.id} className="flex-none overflow-hidden rounded-[10px] border-[2.5px] border-ink">
              <SlideThumb slide={s} width={kind === "deck" ? 150 : 500} />
            </div>
          ))}
        </div>
        <Field label="Nom du modèle">
          <input className="nb-input" value={name} onChange={(e) => setName(e.target.value)} placeholder={kind === "deck" ? "Ex. Live du lundi" : "Ex. Annonce événement"} autoFocus data-testid="save-template-name" />
        </Field>
        {kind === "slide" && (
          <Field label="Catégorie">
            <select className="nb-input" value={category} onChange={(e) => setCategory(e.target.value as TemplateCategory)}>
              {TEMPLATE_CATEGORIES.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </Field>
        )}
        <p className="text-[13px] font-semibold text-muted">
          Tout le monde verra ce modèle dans « Modèles ». Ta bulle de présentateur est remplacée automatiquement par celle de la personne qui l&apos;utilise.
        </p>
      </div>
    </Modal>
  );
}
