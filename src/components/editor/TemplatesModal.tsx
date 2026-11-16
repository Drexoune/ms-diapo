"use client";

import { useState } from "react";
import { BookmarkPlus, Layers, Presentation } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { SlideThumb } from "@/components/slide/SlideView";
import { useApp } from "@/lib/app";
import { TEMPLATE_CATEGORIES, type Template, type TemplateCategory } from "@/lib/types";

/**
 * Galerie de modèles. Un clic sur une diapo l'ajoute après la diapo
 * courante ; un clic sur une présentation ajoute toutes ses diapos.
 */
export function TemplatesModal({
  onClose,
  onPick,
  onSave,
  pickLabel,
}: {
  onClose: () => void;
  onPick: (template: Template) => void;
  /** Staff : enregistrer la diapo courante ou toute la présentation comme modèle. */
  onSave?: (kind: "slide" | "deck") => void;
  pickLabel?: string;
}) {
  const { templates } = useApp();
  const [tab, setTab] = useState<"slide" | "deck">("slide");
  const [category, setCategory] = useState<TemplateCategory | "all">("all");

  const list = templates.filter((t) => t.kind === tab && (tab === "deck" || category === "all" || t.category === category));

  return (
    <Modal title="Modèles" onClose={onClose} width={1040}>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <button className={"chip " + (tab === "slide" ? "on" : "")} onClick={() => setTab("slide")}>
          <Layers size={15} strokeWidth={2.8} />
          Diapos
        </button>
        <button className={"chip " + (tab === "deck" ? "on" : "")} onClick={() => setTab("deck")} data-testid="tab-decks">
          <Presentation size={15} strokeWidth={2.8} />
          Présentations complètes
        </button>
        {tab === "slide" && (
          <>
            <span className="mx-1 h-6 w-[2px] bg-line" />
            <button className={"chip " + (category === "all" ? "on" : "")} onClick={() => setCategory("all")}>
              Tout
            </button>
            {TEMPLATE_CATEGORIES.map((c) => (
              <button key={c.id} className={"chip " + (category === c.id ? "on" : "")} onClick={() => setCategory(c.id)}>
                {c.label}
              </button>
            ))}
          </>
        )}
        {onSave && (
          <div className="ml-auto flex gap-2">
            <button className="nb-btn sm" onClick={() => onSave("slide")} title="Enregistrer la diapo affichée comme modèle (staff)" data-testid="save-slide-template">
              <BookmarkPlus size={15} strokeWidth={2.8} />
              Cette diapo → modèle
            </button>
            <button className="nb-btn sm" onClick={() => onSave("deck")} title="Enregistrer toute la présentation comme modèle (staff)">
              <BookmarkPlus size={15} strokeWidth={2.8} />
              Toute la présentation → modèle
            </button>
          </div>
        )}
      </div>

      {tab === "slide" ? (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(228px,1fr))] gap-4" data-testid="template-grid">
          {list.map((t) => (
            <button
              key={t.id}
              className="group flex flex-col rounded-[14px] border-[2.5px] border-ink bg-white p-2 text-left shadow-[3px_3px_0_#111] transition-transform hover:-translate-y-0.5"
              onClick={() => onPick(t)}
              title={pickLabel ?? `Ajouter la diapo « ${t.name} »`}
              data-template-id={t.id}
            >
              <span className="block overflow-hidden rounded-[9px] border-2 border-ink">
                <SlideThumb slide={t.slides[0]} width={208} />
              </span>
              <span className="mt-1.5 truncate px-0.5 text-[14px] font-extrabold">{t.name}</span>
            </button>
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-4" data-testid="template-decks">
          {list.map((t) => (
            <div key={t.id} className="rounded-[16px] border-[2.5px] border-ink bg-white p-3 shadow-[3px_3px_0_#111]">
              <div className="mb-2.5 flex items-center justify-between gap-3">
                <div>
                  <div className="text-[17px] font-extrabold">{t.name}</div>
                  <div className="text-[13px] font-semibold text-muted">{t.slides.length} diapos</div>
                </div>
                <button className="nb-btn sun sm" onClick={() => onPick(t)} data-template-id={t.id}>
                  {pickLabel ?? `Ajouter ces ${t.slides.length} diapos`}
                </button>
              </div>
              <div className="scroll-thin flex gap-2.5 overflow-x-auto pb-1">
                {t.slides.map((s) => (
                  <div key={s.id} className="flex-none overflow-hidden rounded-[8px] border-2 border-ink">
                    <SlideThumb slide={s} width={150} />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
      {!list.length && <p className="py-10 text-center text-[15px] font-bold text-muted">Aucun modèle ici pour l&apos;instant.</p>}
    </Modal>
  );
}
