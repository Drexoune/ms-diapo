/**
 * Placement de la bulle de la visite guidée autour de l'élément montré.
 * Fonction pure, testée à part (tests/unit/tour-layout.test.ts).
 */

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type Side = "top" | "bottom" | "left" | "right";

export interface Placement {
  x: number;
  y: number;
  /** Côté de l'élément où se trouve la bulle ; `center` quand il n'y a rien à montrer. */
  side: Side | "center";
  /** Position de la flèche le long du bord de la bulle (px), pointée vers l'élément. */
  arrow: number;
}

const OPPOSITE: Record<Side, Side> = { top: "bottom", bottom: "top", left: "right", right: "left" };
export const GAP = 18;
export const MARGIN = 12;
const ARROW_PAD = 26;

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

/**
 * Essaie d'abord le côté demandé, puis l'opposé, puis les deux autres ; garde
 * le premier où la bulle tient entière dans la fenêtre. Si aucun ne convient
 * (élément immense), la bulle se pose sur l'élément, en bas à droite.
 */
export function placeBubble(target: Box | null, bubble: { w: number; h: number }, viewport: { w: number; h: number }, preferred: Side = "bottom"): Placement {
  const maxX = viewport.w - MARGIN - bubble.w;
  const maxY = viewport.h - MARGIN - bubble.h;
  if (!target) {
    return { x: Math.max(MARGIN, (viewport.w - bubble.w) / 2), y: Math.max(MARGIN, (viewport.h - bubble.h) / 2), side: "center", arrow: 0 };
  }
  const cx = target.x + target.w / 2;
  const cy = target.y + target.h / 2;
  const order: Side[] = [preferred, OPPOSITE[preferred], ...(["bottom", "top", "right", "left"] as Side[]).filter((s) => s !== preferred && s !== OPPOSITE[preferred])];

  for (const side of order) {
    let x: number;
    let y: number;
    if (side === "bottom" || side === "top") {
      y = side === "bottom" ? target.y + target.h + GAP : target.y - GAP - bubble.h;
      if (y < MARGIN || y > maxY) continue;
      x = clamp(cx - bubble.w / 2, MARGIN, Math.max(MARGIN, maxX));
      return { x, y, side, arrow: clamp(cx - x, ARROW_PAD, bubble.w - ARROW_PAD) };
    }
    x = side === "right" ? target.x + target.w + GAP : target.x - GAP - bubble.w;
    if (x < MARGIN || x > maxX) continue;
    y = clamp(cy - bubble.h / 2, MARGIN, Math.max(MARGIN, maxY));
    return { x, y, side, arrow: clamp(cy - y, ARROW_PAD, bubble.h - ARROW_PAD) };
  }

  // Aucune place autour : sur l'élément lui-même, sans flèche.
  return {
    x: clamp(target.x + target.w - bubble.w - GAP, MARGIN, Math.max(MARGIN, maxX)),
    y: clamp(target.y + target.h - bubble.h - GAP, MARGIN, Math.max(MARGIN, maxY)),
    side: "center",
    arrow: 0,
  };
}

/** Agrandit un rectangle de `pad` pixels de chaque côté, sans sortir de la fenêtre. */
export function padBox(b: Box, pad: number, viewport: { w: number; h: number }): Box {
  const x = Math.max(4, b.x - pad);
  const y = Math.max(4, b.y - pad);
  return { x, y, w: Math.min(viewport.w - 4, b.x + b.w + pad) - x, h: Math.min(viewport.h - 4, b.y + b.h + pad) - y };
}
