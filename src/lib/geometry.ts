import type { El, SoftShadow, TextEl } from "./types";

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
const scaleSoft = (g: SoftShadow | null | undefined, s: number) => (g ? { ...g, y: g.y * s, blur: g.blur * s } : g);

/** Épaisseurs et ombres d'un texte (et de son étiquette) mises à l'échelle `s`. */
export function scaleTextEffects<T extends TextEl>(el: T, s: number, round: (n: number) => number = (n) => n): T {
  return {
    ...el,
    stroke: round(el.stroke * s),
    shadow: round(el.shadow * s),
    glow: scaleSoft(el.glow, s),
    dy: el.dy ? el.dy * s : el.dy,
    minH: el.minH != null ? el.minH * s : el.minH,
    minW: el.minW != null ? el.minW * s : el.minW,
    box: el.box
      ? {
          ...el.box,
          radius: round(el.box.radius * s),
          border: round(el.box.border * s),
          shadow: round(el.box.shadow * s),
          padX: round(el.box.padX * s),
          padY: round(el.box.padY * s),
          soft: scaleSoft(el.box.soft, s),
        }
      : el.box,
  };
}

export function scaleEl(el: El, anchor: Pt, s: number): El {
  const c = center(el);
  const w = el.w * s;
  const h = el.h * s;
  const cx = anchor.x + (c.x - anchor.x) * s;
  const cy = anchor.y + (c.y - anchor.y) * s;
  const base = { ...el, x: cx - w / 2, y: cy - h / 2, w, h };
  if (base.type === "text") return { ...scaleTextEffects(base, s), size: Math.max(6, base.size * s) };
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

/* ───────────── Mesure des textes ───────────── */

/** En dessous, un écart de hauteur est un arrondi : on ne déplace rien autour. */
const REFLOW_MIN = 1.5;

/**
 * Applique la taille mesurée d'un texte (hauteur, et largeur s'il suit son
 * contenu). Quand la hauteur change, le reste de son groupe suit :
 *  - une forme qui contient le texte (fond de carte, marche de podium)
 *    s'allonge d'autant ;
 *  - les éléments placés sous le texte, dans sa colonne, descendent d'autant.
 * Les écarts s'appliquent dans les deux sens : en raccourcissant le texte,
 * on retrouve la mise en page d'origine.
 * Renvoie `null` si rien ne change.
 */
export function applyMeasure(els: El[], id: string, h: number, w?: number): El[] | null {
  const el = els.find((e) => e.id === id);
  if (!el || el.type !== "text") return null;
  let next: TextEl = el;
  if (Math.abs(el.h - h) >= 0.5) {
    next = { ...next, h, ...(el.fixedH && el.minH == null ? { minH: el.h } : {}) };
  }
  if (w != null && el.hug && Math.abs(el.w - w) >= 0.5) {
    const dw = w - el.w;
    const dx = el.align === "center" ? dw / 2 : el.align === "right" ? dw : 0;
    next = { ...next, w, x: el.x - dx, ...(el.minW == null ? { minW: el.w } : {}) };
  }
  if (next === el) return null;

  const dh = next.h - el.h;
  const reflow = !!el.group && Math.abs(dh) >= REFLOW_MIN;
  const bottom = el.y + el.h;
  const tol = 1;
  return els.map((e) => {
    if (e.id === id) return next;
    if (!reflow || e.group !== el.group) return e;
    const overlapsX = e.x < el.x + el.w - tol && e.x + e.w > el.x + tol;
    const contains =
      e.type === "shape" && e.shape !== "arrow" && e.x <= el.x + tol && e.x + e.w >= el.x + el.w - tol && e.y <= el.y + tol && e.y + e.h >= bottom - tol;
    if (contains) return { ...e, h: Math.max(12, e.h + dh) };
    if (overlapsX && e.y >= bottom - tol) return { ...e, y: e.y + dh };
    return e;
  });
}

/** Marge intérieure d'un badge de chaque côté du texte, au-delà de sa largeur d'origine. */
export const BADGE_PAD_X = 18;

/**
 * Badges posés avant qu'ils suivent leur texte (police MS Étiquette + dégradé) :
 * on leur donne la largeur qui suit le contenu, avec une marge intérieure.
 * Leur aspect ne change pas tant que le texte tient dans le cadre d'origine.
 */
export function upgradeEls(els: El[]): El[] {
  let changed = false;
  const out = els.map((e) => {
    if (e.type !== "text" || e.hug != null || e.font !== "etiquette" || !e.fill || !e.box) return e;
    changed = true;
    return { ...e, hug: true, box: { ...e.box, padX: Math.max(e.box.padX, BADGE_PAD_X * (e.size / 62)) } };
  });
  return changed ? out : els;
}
