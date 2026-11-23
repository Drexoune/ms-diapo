"use client";

import { create } from "zustand";
import { currentSlide, useEditor } from "./editor/store";
import type { Side } from "./tour-layout";

/**
 * Visite guidée.
 *
 * Elle commence sur l'accueil à la première connexion, continue dans
 * l'éditeur quand la personne l'ouvre, et se termine sur le bouton Aide.
 * Les gestes d'édition classiques (écrire, copier-coller…) n'y figurent pas :
 * elle montre ce qui est propre à l'app.
 *
 * L'avancement est gardé dans le navigateur : la visite reprend où elle en
 * était après un rechargement ou un changement de page.
 */

export type TourPage = "home" | "editor";

export interface TourCtx {
  name: string;
  isStaff: boolean;
}

export interface TourStep {
  id: string;
  page: TourPage;
  /** Élément à montrer (sélecteur CSS) ; sans cible, la bulle est centrée. */
  target?: string;
  side?: Side;
  title: (ctx: TourCtx) => string;
  body: string;
  /** Étape présente seulement dans certains cas. */
  when?: (ctx: TourCtx) => boolean;
  /** Prépare l'écran avant l'étape (et le remet en état après). */
  enter?: () => void;
  leave?: () => void;
  /** Bouton principal : clique sur cet élément. L'étape se termine quand l'éditeur s'ouvre. */
  opensEditor?: { label: string; click: string };
  /** Les clics passent à travers le projecteur. */
  interactive?: boolean;
  /** Libellé du bouton principal (sinon « Suivant », ou « Terminer » à la fin). */
  next?: string;
}

const firstName = (name: string) => {
  const n = name.trim().split(/\s+/)[0] ?? "";
  return n && !["Invité", "Mode", "Membre"].includes(n) ? n : "";
};

/** Sélectionne le plus grand texte de la diapo, pour faire apparaître la barre d'outils. */
function selectMainText() {
  const st = useEditor.getState();
  if (st.selection.length) return;
  const texts = currentSlide(st).els.filter((el) => el.type === "text");
  const main = texts.sort((a, b) => (b.type === "text" ? b.size : 0) - (a.type === "text" ? a.size : 0))[0];
  if (main) st.select([main.id]);
}

export const STEPS: TourStep[] = [
  {
    id: "welcome",
    page: "home",
    title: (ctx) => (firstName(ctx.name) ? `Bienvenue, ${firstName(ctx.name)} !` : "Bienvenue sur MS Diapos !"),
    body: "Je te montre l'essentiel en une minute. Tu pourras revoir cette visite à tout moment depuis le bouton Aide.",
    next: "C'est parti",
  },
  {
    id: "new-deck",
    page: "home",
    target: '[data-tour="new-deck"]',
    side: "bottom",
    title: () => "Commence une présentation",
    body: "Pars de zéro, ou d'une présentation modèle complète (formation, planning…) déjà aux couleurs de MS : tu n'as plus qu'à remplacer les textes.",
  },
  {
    id: "examples",
    page: "home",
    target: '[data-tour="examples"]',
    side: "bottom",
    title: () => "Les exemples",
    body: "D'anciennes présentations MS, à feuilleter page par page pour t'inspirer. Clique sur une couverture pour l'ouvrir.",
  },
  {
    id: "my-decks",
    page: "home",
    target: '[data-tour="my-decks"]',
    side: "top",
    title: () => "Tes présentations",
    body: "Tout ce que tu crées arrive ici et s'enregistre tout seul. Survole une présentation pour la dupliquer ou la supprimer.",
  },
  {
    id: "admin",
    page: "home",
    target: '[data-tour="admin"]',
    side: "bottom",
    when: (ctx) => ctx.isStaff,
    title: () => "Le panel admin",
    body: "Tu as le rôle staff : c'est ici que tu ajoutes des éléments à la bibliothèque, des modèles et des exemples, pour tout le monde.",
  },
  {
    id: "open-editor",
    page: "home",
    target: '[data-tour="new-deck"]',
    side: "bottom",
    interactive: true,
    title: () => "À toi de jouer",
    body: "Ouvre l'éditeur : « Partir de zéro », ou l'un des modèles. La visite continue de l'autre côté.",
    opensEditor: { label: "Créer ma présentation", click: '[data-testid="new-blank"]' },
  },
  {
    id: "slides",
    page: "editor",
    target: '[data-testid="slides-panel"]',
    side: "right",
    title: () => "Tes diapos",
    body: "Clique sur une miniature pour l'afficher, glisse-la pour changer l'ordre. Une nouvelle diapo reprend d'office ton logo MS et ta bulle de présentateur.",
  },
  {
    id: "library",
    page: "editor",
    target: '[data-testid="library"]',
    side: "top",
    title: () => "La bibliothèque MS",
    body: "Titres, étiquettes, cartes, stickers, fonds… Clique sur un élément pour l'ajouter, ou glisse-le où tu veux sur la diapo. La recherche fouille toutes les catégories.",
  },
  {
    id: "toolbar",
    page: "editor",
    target: '[data-testid="toolbar"]',
    side: "bottom",
    enter: selectMainText,
    leave: () => useEditor.getState().select([]),
    title: () => "La barre d'outils",
    body: "Elle apparaît quand tu sélectionnes un élément. « Contour » donne le look MS ; « Étiquette » pose un fond coloré. Pour un seul mot en jaune : sélectionne-le pendant que tu écris, puis choisis la couleur.",
  },
  {
    id: "inspiration",
    page: "editor",
    target: '[data-tour="inspiration"]',
    side: "left",
    title: () => "Modèles et exemples",
    body: "Ajoute une diapo toute prête (qui suis-je, objectifs, planning…) ou une présentation entière. Les exemples se feuillettent ici aussi, sans quitter l'éditeur.",
  },
  {
    id: "autosave",
    page: "editor",
    target: '[data-tour="doc-title"]',
    side: "bottom",
    title: () => "Rien à enregistrer",
    body: "Donne un nom à ta présentation. Chaque modification est sauvegardée automatiquement : le voyant passe à « Enregistré ».",
  },
  {
    id: "share",
    page: "editor",
    target: '[data-tour="share"]',
    side: "bottom",
    title: () => "Montre ton travail",
    body: "Télécharge en PDF ou en images, ou passe en plein écran avec « Présenter » : les flèches font défiler, Échap pour sortir.",
  },
  {
    id: "help",
    page: "editor",
    target: '[data-testid="open-help"]',
    side: "left",
    title: () => "Un doute ? L'aide",
    body: "Le bouton Aide rassemble les astuces et tous les raccourcis clavier. Tu peux aussi y relancer cette visite.",
    next: "Terminer",
  },
];

const BY_ID = new Map(STEPS.map((s) => [s.id, s]));
export const stepById = (id: string | undefined) => (id ? BY_ID.get(id) : undefined);

/** Étapes d'une visite : complète (première connexion, ou depuis l'accueil) ou éditeur seul (depuis l'aide). */
export function tourStepIds(kind: "full" | "editor", ctx: TourCtx): string[] {
  return STEPS.filter((s) => (kind === "full" || s.page === "editor") && (!s.when || s.when(ctx))).map((s) => s.id);
}

/* ───────────── État ───────────── */

const KEY = "msd:tour";

interface Saved {
  steps: string[];
  index: number;
}

function load(): Saved | null {
  if (typeof window === "undefined") return null;
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || "null") as Saved | null;
    return v && Array.isArray(v.steps) && v.steps.every((id) => BY_ID.has(id)) && v.index >= 0 && v.index < v.steps.length ? v : null;
  } catch {
    return null;
  }
}

function save(v: Saved | null) {
  try {
    if (v) localStorage.setItem(KEY, JSON.stringify(v));
    else localStorage.removeItem(KEY);
  } catch {
    /* sans stockage, la visite ne reprendra simplement pas après un rechargement */
  }
}

interface TourState {
  /** Étapes de la visite en cours ; `null` quand il n'y en a pas. */
  steps: string[] | null;
  index: number;
  start: (steps: string[]) => void;
  next: () => void;
  prev: () => void;
  stop: () => void;
}

const initial = load();

export const useTour = create<TourState>((set, get) => ({
  steps: initial?.steps ?? null,
  index: initial?.index ?? 0,
  start: (steps) => {
    if (!steps.length) return;
    save({ steps, index: 0 });
    set({ steps, index: 0 });
  },
  next: () => {
    const { steps, index } = get();
    if (!steps) return;
    if (index >= steps.length - 1) return get().stop();
    save({ steps, index: index + 1 });
    set({ index: index + 1 });
  },
  prev: () => {
    const { steps, index } = get();
    if (!steps || index === 0) return;
    save({ steps, index: index - 1 });
    set({ index: index - 1 });
  },
  stop: () => {
    save(null);
    set({ steps: null, index: 0 });
  },
}));

export function startTour(kind: "full" | "editor", ctx: TourCtx) {
  useTour.getState().start(tourStepIds(kind, ctx));
}
