"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { Loader2, RotateCcw } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { ElementsThumb } from "@/components/slide/SlideView";
import { useApp } from "@/lib/app";
import { fontDef } from "@/lib/fonts";
import { resolveAvatarInEls } from "@/lib/starter";
import { isBlankHtml, normalizeEditable, safeHtml } from "@/lib/text";
import type { El, TextEl } from "@/lib/types";

const errorText = (e: unknown) => (e instanceof Error ? e.message : "Une erreur est survenue");

/** Les éléments d'un bloc qui contiennent du texte, du haut vers le bas puis de gauche à droite. */
export function textsOf(els: El[] | null | undefined): TextEl[] {
  return (els ?? []).filter((e): e is TextEl => e.type === "text").sort((a, b) => a.y - b.y || a.x - b.x);
}

/**
 * Champ où l'on écrit le texte d'un élément, avec sa police, ses majuscules et
 * ses mots colorés. Le contenu est lu au fil de la frappe, ramené au format
 * des diapos (lignes et mots colorés seulement).
 */
function TextField({ el, onChange, index }: { el: TextEl; onChange: (html: string) => void; index: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const f = fontDef(el.font);

  // Contenu posé une seule fois : ensuite, c'est la frappe qui le fait vivre.
  useLayoutEffect(() => {
    if (ref.current) ref.current.innerHTML = safeHtml(el.html);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      ref={ref}
      contentEditable
      suppressContentEditableWarning
      spellCheck={false}
      role="textbox"
      aria-multiline="true"
      aria-label={`Texte ${index + 1}`}
      data-testid="asset-text-field"
      className="tx min-h-[52px] w-full rounded-[12px] border-[2.5px] border-ink bg-[#2b2620] px-4 py-3 outline-none focus:shadow-[0_0_0_3px_#ffcc55]"
      style={{
        fontFamily: `'${f.family}', sans-serif`,
        fontWeight: f.weight,
        fontStretch: f.stretch,
        fontSize: 22,
        lineHeight: 1.15,
        letterSpacing: `${f.ls}em`,
        color: el.color === "#000000" || el.color === "#111111" ? "#ffffff" : el.color,
        textTransform: el.upper ? "uppercase" : "none",
        textAlign: "left",
        whiteSpace: "pre-wrap",
      }}
      onInput={(e) => onChange(normalizeEditable(e.currentTarget))}
      onPaste={(e) => {
        // Du texte brut seulement : pas de mise en forme venue d'ailleurs.
        e.preventDefault();
        document.execCommand("insertText", false, e.clipboardData.getData("text/plain"));
      }}
    />
  );
}

/**
 * Réécrire les textes d'un élément de la bibliothèque. L'aperçu suit la
 * frappe ; la mise en forme (police, couleurs, contour, position) ne change
 * pas.
 */
export function TextsModal({
  name,
  elements,
  canRestore,
  onSave,
  onClose,
}: {
  name: string;
  elements: El[];
  /** Élément du pack de départ déjà réécrit : on peut revenir aux textes d'origine. */
  canRestore: boolean;
  onSave: (elements: El[] | null) => Promise<void>;
  onClose: () => void;
}) {
  const { toast, profile } = useApp();
  const [els, setEls] = useState<El[]>(elements);
  const [busy, setBusy] = useState(false);
  const texts = textsOf(els);
  const blank = texts.some((t) => isBlankHtml(t.html));

  const setHtml = (id: string, html: string) => setEls((list) => list.map((e) => (e.id === id && e.type === "text" ? { ...e, html: html || "<div><br></div>" } : e)));

  const save = async (value: El[] | null) => {
    setBusy(true);
    try {
      await onSave(value);
      toast(value ? "Textes enregistrés : la bibliothèque est à jour pour tout le monde" : "Textes d'origine rétablis", "ok");
      onClose();
    } catch (e) {
      toast(errorText(e), "error");
      setBusy(false);
    }
  };

  return (
    <Modal
      title={`Textes : ${name}`}
      onClose={onClose}
      width={720}
      footer={
        <>
          {canRestore && (
            <button className="nb-btn sm mr-auto" onClick={() => save(null)} disabled={busy} data-testid="asset-texts-restore">
              <RotateCcw size={14} strokeWidth={2.8} />
              Revenir aux textes d&apos;origine
            </button>
          )}
          <button className="nb-btn" onClick={onClose} disabled={busy}>
            Annuler
          </button>
          <button className="nb-btn sun" onClick={() => save(els)} disabled={busy || blank} data-testid="asset-texts-save">
            {busy && <Loader2 size={16} className="spin" />}
            Enregistrer
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="flex justify-center overflow-hidden rounded-[14px] border-[2.5px] border-ink" style={{ background: "radial-gradient(circle at 50% 45%, #ffecc4, #ffcf8a)" }} data-testid="asset-texts-preview">
          <ElementsThumb els={resolveAvatarInEls(els, profile?.avatarUrl ?? null)} width={660} height={200} />
        </div>
        <p className="text-[13px] font-semibold text-muted">
          Écris directement dans les champs : l&apos;aperçu suit. Entrée passe à la ligne. Les couleurs, la police et la place de chaque texte ne changent pas.
        </p>
        {texts.map((t, i) => (
          <label key={t.id} className="flex flex-col gap-1.5">
            <span className="text-[13px] font-extrabold">{texts.length > 1 ? `Texte ${i + 1}` : "Texte"}</span>
            <TextField el={t} index={i} onChange={(html) => setHtml(t.id, html)} />
          </label>
        ))}
        {blank && <p className="text-[13px] font-bold text-[#c92a2a]">Un texte vide disparaîtrait du bloc : écris au moins un mot dans chaque champ.</p>}
      </div>
    </Modal>
  );
}
