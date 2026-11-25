"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, LayoutTemplate, Loader2 } from "lucide-react";
import { useApp } from "@/lib/app";
import { data } from "@/lib/backend";
import { useEditor } from "@/lib/editor/store";
import { TEMPLATE_CATEGORIES, type Template, type TemplateCategory } from "@/lib/types";

const errorText = (e: unknown) => (e instanceof Error ? e.message : "Une erreur est survenue");

/**
 * Bandeau de l'éditeur quand le staff modifie un modèle : type, catégorie,
 * et retour au panel admin. Le contenu (diapos, nom) s'enregistre tout seul,
 * comme une présentation.
 */
export function TemplateBar({
  meta,
  onMetaChange,
  onFlush,
}: {
  meta: Pick<Template, "id" | "kind" | "category">;
  onMetaChange: (patch: Partial<Pick<Template, "kind" | "category">>) => void;
  onFlush: () => Promise<void>;
}) {
  const router = useRouter();
  const { reloadLibrary, toast } = useApp();
  const slideCount = useEditor((s) => s.slides.length);
  const [leaving, setLeaving] = useState(false);

  const change = async (patch: Partial<Pick<Template, "kind" | "category">>) => {
    const before = { kind: meta.kind, category: meta.category };
    onMetaChange(patch);
    try {
      await data.updateTemplate(meta.id, patch);
      await reloadLibrary();
    } catch (e) {
      onMetaChange(before);
      toast(errorText(e), "error");
    }
  };

  const done = async () => {
    setLeaving(true);
    await onFlush();
    await reloadLibrary();
    router.push("/admin?onglet=modeles");
  };

  const select = "h-[34px] rounded-[10px] border-[2.5px] border-ink bg-white px-2 text-[14px] font-extrabold";

  return (
    <div className="flex flex-none flex-wrap items-center gap-3 rounded-[18px] border-[3px] border-ink bg-[#d9c8ff] px-3.5 py-2 shadow-[3px_4px_0_#111]" data-testid="template-bar">
      <span className="flex items-center gap-2 text-[15px] font-extrabold">
        <LayoutTemplate size={18} strokeWidth={2.8} />
        Modèle — chaque modification est visible par tout le monde
      </span>
      <label className="flex items-center gap-1.5 text-[13px] font-extrabold">
        Type
        <select className={select} value={meta.kind} onChange={(e) => change({ kind: e.target.value as Template["kind"] })} data-testid="template-kind">
          <option value="slide">Une diapo</option>
          <option value="deck">Une présentation</option>
        </select>
      </label>
      {meta.kind === "slide" && (
        <label className="flex items-center gap-1.5 text-[13px] font-extrabold">
          Catégorie
          <select className={select} value={meta.category} onChange={(e) => change({ category: e.target.value as TemplateCategory })} data-testid="template-category">
            {TEMPLATE_CATEGORIES.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </label>
      )}
      {meta.kind === "slide" && slideCount > 1 && (
        <span className="text-[13px] font-bold" data-testid="template-multi-hint">
          Ce modèle de diapo ajoutera ses {slideCount} diapos d&apos;un coup.
        </span>
      )}
      <button className="nb-btn sun sm ml-auto" onClick={done} disabled={leaving} data-testid="template-done">
        {leaving ? <Loader2 size={15} className="spin" /> : <Check size={15} strokeWidth={3} />}
        Terminer
      </button>
    </div>
  );
}
