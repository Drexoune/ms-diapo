"use client";

import { useState } from "react";
import { Loader2, Plus } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { AddExampleModal } from "./AddExampleModal";
import { ExampleCard } from "./ExampleCard";
import { ExampleViewer } from "./ExampleViewer";
import { useApp } from "@/lib/app";
import type { Example } from "@/lib/types";

/** Message pour le staff quand la rubrique n'est pas encore activée dans Supabase. */
export function ExamplesSetupNotice({ message }: { message: string }) {
  return (
    <p className="rounded-[14px] border-[2.5px] border-ink bg-[#ffd6d6] px-4 py-3 text-[14px] font-bold" role="alert" data-testid="examples-error">
      {message}
    </p>
  );
}

/** Rubrique « Exemples » de l'accueil. */
export function ExamplesSection() {
  const { examples, examplesError, profile } = useApp();
  const [open, setOpen] = useState<Example | null>(null);
  const [adding, setAdding] = useState(false);
  const isStaff = !!profile?.isStaff;

  return (
    <section data-tour="examples" data-testid="examples-section">
      <div className="mb-3 flex flex-wrap items-end gap-x-4 gap-y-1">
        <h2 className="display text-[24px]">Exemples</h2>
        <p className="pb-0.5 text-[14px] font-semibold text-muted">D&apos;anciennes présentations MS, à feuilleter pour t&apos;inspirer.</p>
        {isStaff && !examplesError && (
          <button className="nb-btn sm ml-auto" onClick={() => setAdding(true)} data-testid="examples-add">
            <Plus size={15} strokeWidth={3} />
            Ajouter un exemple
          </button>
        )}
      </div>

      {examples === null ? (
        <div className="flex items-center gap-3 py-6 text-[15px] font-extrabold">
          <Loader2 className="spin" size={20} strokeWidth={3} /> Chargement…
        </div>
      ) : examplesError && isStaff ? (
        <ExamplesSetupNotice message={examplesError} />
      ) : examples.length === 0 ? (
        <div className="rounded-[18px] border-[2.5px] border-dashed border-ink bg-white px-6 py-7 text-center">
          <p className="text-[16px] font-extrabold">Aucun exemple pour l&apos;instant.</p>
          <p className="mt-1 text-[14px] font-semibold text-muted">
            {isStaff ? "Dépose une ancienne présentation (PDF ou images) : tout le monde pourra la feuilleter." : "Le staff y déposera bientôt d'anciennes présentations."}
          </p>
        </div>
      ) : (
        <div className="scroll-thin flex gap-4 overflow-x-auto pb-3 pl-0.5 pt-0.5" data-testid="examples-row">
          {examples.map((ex) => (
            <ExampleCard key={ex.id} example={ex} width={256} onOpen={() => setOpen(ex)} />
          ))}
        </div>
      )}

      {open && <ExampleViewer example={open} onClose={() => setOpen(null)} />}
      {adding && <AddExampleModal onClose={() => setAdding(false)} />}
    </section>
  );
}

/**
 * Exemples depuis l'éditeur : la galerie, puis la visionneuse à sa place
 * (une seule fenêtre ouverte à la fois, Échap ferme celle qu'on voit).
 */
export function ExamplesModal({ onClose }: { onClose: () => void }) {
  const { examples, examplesError, profile } = useApp();
  const [open, setOpen] = useState<Example | null>(null);

  if (open) return <ExampleViewer example={open} onClose={() => setOpen(null)} />;

  return (
    <Modal title="Exemples" onClose={onClose} width={1040}>
      <p className="mb-4 text-[14px] font-semibold text-muted">D&apos;anciennes présentations MS, à feuilleter pour t&apos;inspirer. Ta présentation reste ouverte derrière.</p>
      {examples === null ? (
        <div className="flex items-center gap-3 py-8 text-[15px] font-extrabold">
          <Loader2 className="spin" size={20} strokeWidth={3} /> Chargement…
        </div>
      ) : examplesError && profile?.isStaff ? (
        <ExamplesSetupNotice message={examplesError} />
      ) : examples.length === 0 ? (
        <p className="py-10 text-center text-[15px] font-bold text-muted">Aucun exemple pour l&apos;instant.</p>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(230px,1fr))] gap-4" data-testid="examples-grid">
          {examples.map((ex) => (
            <ExampleCard key={ex.id} example={ex} onOpen={() => setOpen(ex)} />
          ))}
        </div>
      )}
    </Modal>
  );
}
