import { uid } from "./ids";
import { textToHtml } from "./text";
import { SLIDE_H, SLIDE_W, type BoxStyle, type El, type ImageEl, type ShapeEl, type ShapeKind, type TextEl } from "./types";

/**
 * Fabriques d'éléments avec les réglages de la charte MS Creators
 * (mesurés sur les diapos d'exemple) : texte blanc, contour noir épais,
 * ombre dure vers le bas-gauche, cartes à bordure noire.
 */

export const INK = "#000000";

/** Contour et ombre proportionnels à la taille du texte. */
export const strokeFor = (size: number) => Math.round(size * 0.072 * 10) / 10;
export const shadowFor = (size: number) => Math.round(size * 0.078 * 10) / 10;

export const PALETTE = {
  white: "#ffffff",
  ink: "#111111",
  yellow: "#ffd23f",
  orange: "#f5a742",
  peach: "#fbc57e",
  cream: "#ffe8cc",
  pink: "#ffd6d6",
  coral: "#fe6f6b",
  green: "#c8f5d2",
  forest: "#0b5d1e",
  blue: "#bfe0ff",
  lilac: "#dcd3ff",
  gray: "#e6e6e6",
  dark: "#2e2e2e",
} as const;

/** Dégradé doré des étiquettes de nom. */
export const GOLD_FILL = "linear-gradient(180deg, #a98f2a 0%, #8f7718 100%)";
export const GOLD_TEXT = "#f7dc72";

export interface TextInit extends Partial<Omit<TextEl, "type" | "html" | "id">> {
  text?: string;
  html?: string;
  /** Contour et ombre de la charte (par défaut : oui). */
  outlined?: boolean;
}

export function makeText(init: TextInit = {}): TextEl {
  const { text, html, outlined = true, ...rest } = init;
  const size = rest.size ?? 96;
  const w = rest.w ?? 1200;
  const lh = rest.lh ?? 1.04;
  const content = html ?? textToHtml(text ?? "Ton texte");
  const lines = Math.max(1, content.split("</div>").length - 1);
  const padY = rest.box?.padY ?? 0;
  const border = rest.box?.border ?? 0;
  const h = rest.h ?? Math.round(lines * size * lh + (padY + border) * 2);
  return {
    type: "text",
    id: uid(),
    x: Math.round((SLIDE_W - w) / 2),
    y: Math.round((SLIDE_H - h) / 2),
    rot: 0,
    font: "titre",
    color: "#ffffff",
    align: "center",
    upper: true,
    stroke: outlined ? strokeFor(size) : 0,
    strokeColor: INK,
    shadow: outlined ? shadowFor(size) : 0,
    list: false,
    box: null,
    ...rest,
    w,
    h,
    size,
    lh,
    html: content,
  };
}

export function makeBox(init: Partial<BoxStyle> = {}): BoxStyle {
  return { fill: "#ffffff", radius: 12, border: 8, borderColor: INK, shadow: 10, padX: 28, padY: 16, ...init };
}

export function makeShape(shape: ShapeKind, init: Partial<Omit<ShapeEl, "type" | "shape" | "id">> = {}): ShapeEl {
  const w = init.w ?? (shape === "arrow" ? 220 : 520);
  const h = init.h ?? (shape === "arrow" ? 60 : shape === "ellipse" ? 520 : 320);
  return {
    type: "shape",
    id: uid(),
    shape,
    x: Math.round((SLIDE_W - w) / 2),
    y: Math.round((SLIDE_H - h) / 2),
    rot: 0,
    fill: "#ffffff",
    radius: shape === "rect" ? 12 : 0,
    border: shape === "arrow" ? 7 : 8,
    borderColor: INK,
    shadow: shape === "arrow" ? 0 : 10,
    ...init,
    w,
    h,
  };
}

export function makeImage(src: string, natural: { width: number; height: number }, init: Partial<Omit<ImageEl, "type" | "src" | "id">> = {}): ImageEl {
  // Taille initiale : la plus grande qui tient dans 45 % de la diapo, sans jamais agrandir.
  const max = Math.min(1, (SLIDE_W * 0.45) / natural.width, (SLIDE_H * 0.6) / natural.height);
  const w = init.w ?? Math.max(24, Math.round(natural.width * max));
  const h = init.h ?? Math.max(24, Math.round(natural.height * max));
  return {
    type: "image",
    id: uid(),
    src,
    x: Math.round((SLIDE_W - w) / 2),
    y: Math.round((SLIDE_H - h) / 2),
    rot: 0,
    fit: "cover",
    radius: 0,
    border: 0,
    borderColor: INK,
    shadow: 0,
    ...init,
    w,
    h,
  };
}

/** Recentre un bloc d'éléments autour d'un point de la diapo (dépôt depuis la bibliothèque). */
export function placeAt(els: El[], at: { x: number; y: number }): El[] {
  if (!els.length) return els;
  let x1 = Infinity;
  let y1 = Infinity;
  let x2 = -Infinity;
  let y2 = -Infinity;
  for (const el of els) {
    x1 = Math.min(x1, el.x);
    y1 = Math.min(y1, el.y);
    x2 = Math.max(x2, el.x + el.w);
    y2 = Math.max(y2, el.y + el.h);
  }
  const w = x2 - x1;
  const h = y2 - y1;
  // Le bloc reste entièrement visible quand il est plus petit que la diapo.
  let left = at.x - w / 2;
  let top = at.y - h / 2;
  if (w <= SLIDE_W) left = Math.min(SLIDE_W - w, Math.max(0, left));
  if (h <= SLIDE_H) top = Math.min(SLIDE_H - h, Math.max(0, top));
  const dx = Math.round(left - x1);
  const dy = Math.round(top - y1);
  return els.map((el) => ({ ...el, x: el.x + dx, y: el.y + dy }));
}
