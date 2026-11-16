"use client";

import { Modal } from "@/components/ui/Modal";

const STEPS: [string, string][] = [
  ["Ajoute", "Clique sur un élément de la bibliothèque, ou glisse-le sur la diapo. Les boutons Texte, Forme et Image en ajoutent aussi."],
  ["Écris", "Double-clique sur un texte pour le modifier. Sélectionne quelques mots puis choisis une couleur pour les mettre en avant."],
  ["Place", "Fais glisser pour déplacer : des lignes roses t'aident à centrer et aligner. Tire un coin pour agrandir."],
  ["Montre", "« Présenter » passe en plein écran. « Télécharger » te donne un PDF ou des images."],
];

const KEYS: [string, string][] = [
  ["Double-clic", "Modifier un texte"],
  ["Suppr", "Supprimer la sélection"],
  ["Ctrl + Z / Ctrl + Maj + Z", "Annuler / rétablir"],
  ["Ctrl + C / Ctrl + V", "Copier / coller (colle aussi une image copiée)"],
  ["Ctrl + D", "Dupliquer"],
  ["Ctrl + G", "Grouper (Ctrl + Maj + G pour dégrouper)"],
  ["Flèches", "Déplacer d'un cran (avec Maj : de 10)"],
  ["Maj en glissant", "Déplacer bien droit · garder les proportions"],
  ["Alt en glissant", "Désactiver l'aimantation"],
  ["Ctrl + A", "Tout sélectionner"],
  ["Échap", "Désélectionner"],
];

export function HelpModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal title="Aide" onClose={onClose} width={760}>
      <div className="grid gap-3 sm:grid-cols-2">
        {STEPS.map(([title, text], i) => (
          <div key={title} className="rounded-[14px] border-[2.5px] border-ink bg-[#fff7e6] p-3.5">
            <div className="display mb-1 text-[17px]">
              {i + 1}. {title}
            </div>
            <p className="text-[14px] font-semibold leading-snug">{text}</p>
          </div>
        ))}
      </div>
      <h3 className="display mb-2 mt-6 text-[17px]">Raccourcis</h3>
      <div className="grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
        {KEYS.map(([k, v]) => (
          <div key={k} className="flex items-baseline justify-between gap-3 border-b border-line py-1 text-[14px]">
            <span className="font-semibold">{v}</span>
            <kbd className="whitespace-nowrap rounded-md border-2 border-ink bg-white px-1.5 py-0.5 text-[12px] font-extrabold">{k}</kbd>
          </div>
        ))}
      </div>
      <p className="mt-5 text-[13px] font-semibold text-muted">
        Astuce : dans le menu « ··· » d&apos;un élément, « Reprendre sur les nouvelles diapos » le recopie automatiquement (pratique pour le logo et ta bulle).
      </p>
    </Modal>
  );
}
