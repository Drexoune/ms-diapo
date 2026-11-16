/**
 * Modèle de données des présentations.
 *
 * Toutes les coordonnées sont exprimées dans le repère de la diapo
 * (1920 × 1080), jamais en pixels écran : le rendu applique une mise à
 * l'échelle unique, ce qui garantit que l'éditeur, les miniatures, le mode
 * présentation et l'export affichent exactement la même chose.
 */

export const SLIDE_W = 1920;
export const SLIDE_H = 1080;

export type FontId =
  | "titre"
  | "unbounded"
  | "bowlby"
  | "passion"
  | "anton"
  | "marker"
  | "texte";

export interface BaseEl {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  /** Rotation en degrés, autour du centre. */
  rot: number;
  /** Identifiant de groupe : les éléments d'un même groupe se sélectionnent ensemble. */
  group?: string;
  /** Repris automatiquement sur chaque nouvelle diapo (logo, avatar…). */
  keep?: boolean;
  opacity?: number;
}

/** Fond d'étiquette derrière un texte (bordure épaisse + ombre dure, façon MS). */
export interface BoxStyle {
  /** Couleur CSS ou dégradé. */
  fill: string;
  radius: number;
  border: number;
  borderColor: string;
  /** Longueur de l'ombre dure (vers le bas-gauche). 0 = aucune. */
  shadow: number;
  padX: number;
  padY: number;
}

export interface TextEl extends BaseEl {
  type: "text";
  /** HTML normalisé : une suite de <div>ligne</div>, avec des <span style="color:…"> pour les mots colorés. */
  html: string;
  font: FontId;
  size: number;
  color: string;
  align: "left" | "center" | "right";
  upper: boolean;
  /** Interligne (multiplicateur). */
  lh: number;
  /** Épaisseur visible du contour, en px diapo. 0 = pas de contour. */
  stroke: number;
  strokeColor: string;
  /** Longueur de l'ombre dure du texte. 0 = aucune. */
  shadow: number;
  /** Affiche une puce devant chaque ligne. */
  list: boolean;
  box?: BoxStyle | null;
  /** Hauteur fixée à la main (texte centré verticalement) ; sinon la hauteur suit le contenu. */
  fixedH?: boolean;
}

export type ShapeKind = "rect" | "ellipse" | "arrow";

export interface ShapeEl extends BaseEl {
  type: "shape";
  shape: ShapeKind;
  fill: string;
  radius: number;
  border: number;
  borderColor: string;
  shadow: number;
}

export interface ImageEl extends BaseEl {
  type: "image";
  src: string;
  fit: "cover" | "contain";
  /** 9999 = cercle. */
  radius: number;
  border: number;
  borderColor: string;
  shadow: number;
}

export type El = TextEl | ShapeEl | ImageEl;

export type Background =
  | { kind: "color"; color: string }
  | { kind: "image"; src: string };

export interface Slide {
  id: string;
  bg: Background;
  els: El[];
}

export interface Deck {
  id: string;
  title: string;
  slides: Slide[];
  updatedAt: string;
}

export interface DeckMeta {
  id: string;
  title: string;
  updatedAt: string;
  /** Première diapo, pour la miniature. */
  cover: Slide | null;
  slideCount: number;
}

/* ───────────── Bibliothèque ───────────── */

export const ASSET_CATEGORIES = [
  { id: "titres", label: "Titres" },
  { id: "etiquettes", label: "Étiquettes" },
  { id: "listes", label: "Listes" },
  { id: "cartes", label: "Cartes" },
  { id: "photos", label: "Photos" },
  { id: "stickers", label: "Stickers" },
  { id: "fonds", label: "Fonds" },
] as const;

export type AssetCategory = (typeof ASSET_CATEGORIES)[number]["id"];

/**
 * Un élément de bibliothèque est soit une image (sticker, photo, fond),
 * soit un bloc composé d'éléments de diapo réutilisables.
 */
export interface Asset {
  id: string;
  category: AssetCategory;
  name: string;
  tags: string[];
  kind: "image" | "elements";
  /** kind = image */
  url?: string | null;
  width?: number | null;
  height?: number | null;
  /** kind = elements : éléments positionnés par rapport au coin haut-gauche du bloc. */
  elements?: El[] | null;
  sort: number;
  /** Fourni avec l'application (pack de départ) plutôt qu'ajouté par le staff. */
  builtin?: boolean;
}

export const TEMPLATE_CATEGORIES = [
  { id: "ouverture", label: "Ouverture" },
  { id: "contenu", label: "Contenu" },
  { id: "cartes", label: "Cartes" },
  { id: "planning", label: "Planning" },
  { id: "fin", label: "Fin" },
] as const;

export type TemplateCategory = (typeof TEMPLATE_CATEGORIES)[number]["id"];

export interface Template {
  id: string;
  /** slide = une diapo à insérer ; deck = une présentation complète. */
  kind: "slide" | "deck";
  name: string;
  category: TemplateCategory;
  slides: Slide[];
  sort: number;
  builtin?: boolean;
}

export interface Profile {
  id: string;
  name: string;
  avatarUrl: string | null;
  isStaff: boolean;
  /** Le rôle staff n'a pas été revérifié récemment : une reconnexion est nécessaire. */
  staffStale?: boolean;
}
