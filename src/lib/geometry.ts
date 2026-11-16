import type { El } from "./types";

export interface Pt {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface RotRect extends Rect {
  rot: number;
}

export const rad = (deg: number) => (deg * Math.PI) / 180;

export function rotate(p: Pt, deg: number): Pt {
  const a = rad(deg);
  const c = Math.cos(a);
  const s = Math.sin(a);
  return { x: p.x * c - p.y * s, y: p.x * s + p.y * c };
}

export function center(r: Rect): Pt {
  return { x: r.x + r.w / 2, y: r.y + r.h / 2 };
}

/** Les quatre coins d'un rectangle tourné, dans le repère de la diapo. */
export function corners(r: RotRect): Pt[] {
  const c = center(r);
  return [
    { x: -r.w / 2, y: -r.h / 2 },
    { x: r.w / 2, y: -r.h / 2 },
    { x: r.w / 2, y: r.h / 2 },
    { x: -r.w / 2, y: r.h / 2 },
  ].map((p) => {
    const q = rotate(p, r.rot);
    return { x: c.x + q.x, y: c.y + q.y };
  });
}

/** Boîte englobante alignée sur les axes d'un rectangle éventuellement tourné. */
export function bbox(r: RotRect): Rect {
  if (!r.rot) return { x: r.x, y: r.y, w: r.w, h: r.h };
  const cs = corners(r);
  const xs = cs.map((p) => p.x);
  const ys = cs.map((p) => p.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}

export function union(rects: Rect[]): Rect | null {
  if (!rects.length) return null;
  let x1 = Infinity;
  let y1 = Infinity;
  let x2 = -Infinity;
  let y2 = -Infinity;
  for (const r of rects) {
    x1 = Math.min(x1, r.x);
    y1 = Math.min(y1, r.y);
    x2 = Math.max(x2, r.x + r.w);
    y2 = Math.max(y2, r.y + r.h);
  }
  return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
}

export function intersects(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

export function normalizeRect(a: Pt, b: Pt): Rect {
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    w: Math.abs(a.x - b.x),
    h: Math.abs(a.y - b.y),
  };
}

/* ───────────── Redimensionnement ───────────── */

/** Poignée : direction dans le repère local de l'élément (−1, 0 ou 1 sur chaque axe). */
export interface Handle {
  hx: -1 | 0 | 1;
  hy: -1 | 0 | 1;
}

export const HANDLES: Record<string, Handle> = {
  nw: { hx: -1, hy: -1 },
  n: { hx: 0, hy: -1 },
  ne: { hx: 1, hy: -1 },
  e: { hx: 1, hy: 0 },
  se: { hx: 1, hy: 1 },
  s: { hx: 0, hy: 1 },
  sw: { hx: -1, hy: 1 },
  w: { hx: -1, hy: 0 },
};

export interface ResizeOpts {
  /** Conserver les proportions de départ. */
  keepRatio?: boolean;
  minW?: number;
  minH?: number;
}

/**
 * Redimensionne un rectangle (éventuellement tourné) en tirant une poignée
 * de `delta` (déplacement du pointeur dans le repère de la diapo). Le côté
 * ou le coin opposé à la poignée reste fixe à l'écran, quelle que soit la
 * rotation.
 */
export function resizeRect(start: RotRect, handle: Handle, delta: Pt, opts: ResizeOpts = {}): RotRect {
  const { hx, hy } = handle;
  const minW = opts.minW ?? 8;
  const minH = opts.minH ?? 8;
  const local = rotate(delta, -start.rot);

  let w = start.w + hx * local.x;
  let h = start.h + hy * local.y;

  if (opts.keepRatio && start.w > 0 && start.h > 0) {
    const ratio = start.w / start.h;
    if (hx !== 0 && hy !== 0) {
      // Coin : on suit l'axe qui a le plus bougé.
      const sw = w / start.w;
      const sh = h / start.h;
      const s = Math.abs(sw - 1) > Math.abs(sh - 1) ? sw : sh;
      w = start.w * s;
      h = start.h * s;
    } else if (hx !== 0) {
      h = w / ratio;
    } else {
      w = h * ratio;
    }
  }

  w = Math.max(minW, w);
  h = Math.max(minH, h);

  // Point d'ancrage (opposé à la poignée), exprimé par rapport au centre de départ.
  const c0 = center(start);
  const anchorLocal = { x: (-hx * start.w) / 2, y: (-hy * start.h) / 2 };
  const anchorWorld = rotate(anchorLocal, start.rot);
  const ax = c0.x + anchorWorld.x;
  const ay = c0.y + anchorWorld.y;
  // Nouveau centre : l'ancre plus la demi-taille dans la direction de la poignée.
  const toCenter = rotate({ x: (hx * w) / 2, y: (hy * h) / 2 }, start.rot);
  const cx = ax + toCenter.x;
  const cy = ay + toCenter.y;

  return { x: cx - w / 2, y: cy - h / 2, w, h, rot: start.rot };
}

/**
 * Met à l'échelle un élément autour d'un point fixe (redimensionnement d'une
 * sélection multiple, ou d'un texte par un coin). Les épaisseurs suivent pour
 * que l'aspect reste identique.
 */
export function scaleEl(el: El, anchor: Pt, s: number): El {
  const c = center(el);
  const w = el.w * s;
  const h = el.h * s;
  const cx = anchor.x + (c.x - anchor.x) * s;
  const cy = anchor.y + (c.y - anchor.y) * s;
  const base = { ...el, x: cx - w / 2, y: cy - h / 2, w, h };
  if (base.type === "text") {
    return {
      ...base,
      size: Math.max(6, base.size * s),
      stroke: base.stroke * s,
      shadow: base.shadow * s,
      box: base.box
        ? {
            ...base.box,
            radius: base.box.radius * s,
            border: base.box.border * s,
            shadow: base.box.shadow * s,
            padX: base.box.padX * s,
            padY: base.box.padY * s,
          }
        : base.box,
    };
  }
  return {
    ...base,
    radius: base.radius >= 9999 ? base.radius : base.radius * s,
    border: base.border * s,
    shadow: base.shadow * s,
  };
}

/* ───────────── Magnétisme ───────────── */

export interface Guide {
  axis: "x" | "y";
  /** Position de la ligne sur son axe. */
  pos: number;
}

export interface SnapLines {
  xs: number[];
  ys: number[];
}

/** Lignes d'accroche : bords et centre de la diapo, bords et centres des autres éléments. */
export function snapLines(slideW: number, slideH: number, others: Rect[]): SnapLines {
  const xs = [0, slideW / 2, slideW];
  const ys = [0, slideH / 2, slideH];
  for (const r of others) {
    xs.push(r.x, r.x + r.w / 2, r.x + r.w);
    ys.push(r.y, r.y + r.h / 2, r.y + r.h);
  }
  return { xs, ys };
}

function nearest(values: number[], targets: number[], threshold: number): { d: number; pos: number } | null {
  let best: { d: number; pos: number } | null = null;
  for (const v of values) {
    for (const t of targets) {
      const d = t - v;
      if (Math.abs(d) <= threshold && (!best || Math.abs(d) < Math.abs(best.d))) best = { d, pos: t };
    }
  }
  return best;
}

/**
 * Corrige un déplacement pour aimanter la boîte déplacée sur la ligne la plus
 * proche de chaque axe. Renvoie le décalage à ajouter et les guides à afficher.
 */
export function snapMove(moving: Rect, lines: SnapLines, threshold: number): { dx: number; dy: number; guides: Guide[] } {
  const guides: Guide[] = [];
  const sx = nearest([moving.x, moving.x + moving.w / 2, moving.x + moving.w], lines.xs, threshold);
  const sy = nearest([moving.y, moving.y + moving.h / 2, moving.y + moving.h], lines.ys, threshold);
  if (sx) guides.push({ axis: "x", pos: sx.pos });
  if (sy) guides.push({ axis: "y", pos: sy.pos });
  return { dx: sx?.d ?? 0, dy: sy?.d ?? 0, guides };
}

/** Angle (degrés, 0 = vers le haut) entre le centre et un point, pour la poignée de rotation. */
export function angleFromCenter(c: Pt, p: Pt): number {
  return (Math.atan2(p.y - c.y, p.x - c.x) * 180) / Math.PI + 90;
}

export function snapAngle(deg: number, step: number | null): number {
  let a = ((deg % 360) + 360) % 360;
  if (step) {
    a = Math.round(a / step) * step;
  } else {
    // Accroche douce sur les angles droits.
    for (const t of [0, 90, 180, 270, 360]) if (Math.abs(a - t) < 3) a = t;
  }
  a = a % 360;
  return a > 180 ? a - 360 : a;
}

export const round1 = (n: number) => Math.round(n * 10) / 10;
