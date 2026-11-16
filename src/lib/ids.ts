import type { El, Slide } from "./types";

export function uid(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(36).padStart(2, "0")).join("").slice(0, 12);
}

export function uuid(): string {
  return crypto.randomUUID();
}

/**
 * Copie des éléments en leur donnant de nouveaux identifiants. Les groupes
 * sont renommés de façon cohérente : deux copies d'un même bloc ne se
 * retrouvent jamais dans le même groupe.
 */
export function cloneEls(els: El[], dx = 0, dy = 0): El[] {
  const groups = new Map<string, string>();
  return els.map((el) => {
    let group = el.group;
    if (group) {
      if (!groups.has(group)) groups.set(group, uid());
      group = groups.get(group);
    }
    return { ...structuredClone(el), id: uid(), group, x: el.x + dx, y: el.y + dy };
  });
}

export function cloneSlide(slide: Slide): Slide {
  return { id: uid(), bg: { ...slide.bg }, els: cloneEls(slide.els) };
}

export function cloneSlides(slides: Slide[]): Slide[] {
  return slides.map(cloneSlide);
}
