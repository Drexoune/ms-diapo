"use client";

import { create } from "zustand";
import { applyMeasure, bbox, union, upgradeEls, type Guide } from "../geometry";
import { cloneEls, cloneSlide, uid } from "../ids";
import { isBlankHtml } from "../text";
import { SLIDE_H, SLIDE_W, type Background, type El, type Slide } from "../types";

/**
 * État de l'éditeur.
 *
 * Les diapos sont immuables : chaque modification produit de nouveaux objets
 * pour ce qui change et réutilise le reste. L'historique n'a donc qu'à
 * conserver des références, et les miniatures ne se redessinent que pour la
 * diapo réellement modifiée.
 */

interface Snapshot {
  slides: Slide[];
  current: number;
}

export type SaveState = "saved" | "dirty" | "saving" | "error";
export type AlignHow = "left" | "center" | "right" | "top" | "middle" | "bottom";
export type ZOrder = "front" | "back" | "forward" | "backward";

const HISTORY_LIMIT = 120;
const COALESCE_MS = 900;

/** Fond utilisé pour une présentation vierge. */
export const DEFAULT_BG: Background = { kind: "image", src: "/library/fonds/creme-croix.svg" };

const OPENING_BG = "/library/fonds/or-croix.svg";

export function blankSlide(bg: Background = DEFAULT_BG): Slide {
  return { id: uid(), bg: { ...bg }, els: [] };
}

interface EditorState {
  title: string;
  slides: Slide[];
  current: number;
  selection: string[];
  editingId: string | null;
  past: Snapshot[];
  future: Snapshot[];
  /** Incrémenté à chaque changement de contenu ; l'enregistrement automatique s'y abonne. */
  revision: number;
  savedRevision: number;
  saveState: SaveState;
  /** 1 = la diapo tient entière dans la zone de travail. */
  zoom: number;
  guides: Guide[];

  load: (doc: { title: string; slides: Slide[] }) => void;
  setTitle: (title: string) => void;
  setZoom: (zoom: number) => void;
  setGuides: (guides: Guide[]) => void;
  markSaving: () => number;
  markSaved: (revision: number) => void;
  markError: () => void;

  undo: () => void;
  redo: () => void;
  beginGesture: () => void;
  endGesture: () => void;

  goTo: (index: number) => void;
  addSlide: (slide?: Slide, at?: number) => void;
  addSlides: (slides: Slide[], at?: number) => void;
  duplicateSlide: (index: number) => void;
  deleteSlide: (index: number) => void;
  moveSlide: (from: number, to: number) => void;
  setBackground: (bg: Background, all?: boolean) => void;

  select: (ids: string[]) => void;
  toggleSelect: (ids: string[]) => void;
  selectAll: () => void;
  startEditing: (id: string) => void;
  stopEditing: () => void;

  addEls: (els: El[]) => void;
  /** Modifie des éléments de la diapo courante. `history: false` pendant un geste. */
  updateEls: (ids: string[], fn: (el: El) => El, opts?: { history?: boolean; coalesce?: string }) => void;
  /**
   * Taille mesurée d'un texte (hauteur ; largeur s'il suit son contenu). Son
   * groupe suit (voir `applyMeasure`). N'entre pas dans l'historique.
   */
  setMeasured: (id: string, h: number, w?: number) => void;
  removeEls: (ids: string[]) => void;
  duplicateEls: (ids: string[]) => void;
  reorder: (ids: string[], how: ZOrder) => void;
  group: (ids: string[]) => void;
  ungroup: (ids: string[]) => void;
  align: (ids: string[], how: AlignHow) => void;
  nudge: (ids: string[], dx: number, dy: number) => void;
  copy: () => void;
  cut: () => void;
  paste: () => void;
}

/* Hors état réactif : passerelle vers le DOM du texte en cours d'édition, presse-papiers, geste en cours. */
let readEditingHtml: (() => string | null) | null = null;
export function setEditingReader(fn: (() => string | null) | null) {
  readEditingHtml = fn;
}

let clipboard: El[] = [];
let pasteCount = 0;
let gestureStart: Snapshot | null = null;
let lastCoalesce: { key: string; at: number } | null = null;

export function currentSlide(s: Pick<EditorState, "slides" | "current">): Slide {
  return s.slides[s.current] ?? s.slides[0];
}

/** Étend une sélection à tous les membres des groupes touchés. */
export function expandGroups(slide: Slide, ids: string[]): string[] {
  const set = new Set(ids);
  const groups = new Set<string>();
  for (const el of slide.els) if (set.has(el.id) && el.group) groups.add(el.group);
  if (!groups.size) return ids;
  for (const el of slide.els) if (el.group && groups.has(el.group)) set.add(el.id);
  return slide.els.filter((el) => set.has(el.id)).map((el) => el.id);
}

function replaceSlide(slides: Slide[], index: number, slide: Slide): Slide[] {
  const next = slides.slice();
  next[index] = slide;
  return next;
}

export const useEditor = create<EditorState>((set, get) => {
  /** Applique un changement de contenu, avec ou sans entrée d'historique. */
  const commit = (
    change: Partial<Pick<EditorState, "slides" | "current" | "selection" | "title">>,
    opts: { history?: boolean; coalesce?: string } = {},
  ) => {
    const s = get();
    const history = opts.history ?? true;
    let past = s.past;
    let future = s.future;
    if (history && (change.slides || change.current !== undefined)) {
      const now = Date.now();
      const merge =
        opts.coalesce && lastCoalesce && lastCoalesce.key === opts.coalesce && now - lastCoalesce.at < COALESCE_MS;
      lastCoalesce = opts.coalesce ? { key: opts.coalesce, at: now } : null;
      if (!merge) {
        past = [...s.past, { slides: s.slides, current: s.current }].slice(-HISTORY_LIMIT);
      }
      future = [];
    }
    const contentChanged = (change.slides && change.slides !== s.slides) || (change.title !== undefined && change.title !== s.title);
    set({
      ...change,
      past,
      future,
      revision: contentChanged ? s.revision + 1 : s.revision,
      saveState: contentChanged ? "dirty" : s.saveState,
    });
  };

  const updateCurrent = (fn: (slide: Slide) => Slide, opts?: { history?: boolean; coalesce?: string }, extra: Partial<EditorState> = {}) => {
    const s = get();
    const slide = currentSlide(s);
    const next = fn(slide);
    if (next === slide && !Object.keys(extra).length) return;
    commit({ slides: replaceSlide(s.slides, s.current, next), ...extra }, opts);
  };

  return {
    title: "",
    slides: [blankSlide()],
    current: 0,
    selection: [],
    editingId: null,
    past: [],
    future: [],
    revision: 0,
    savedRevision: 0,
    saveState: "saved",
    zoom: 1,
    guides: [],

    load: (doc) => {
      readEditingHtml = null;
      gestureStart = null;
      lastCoalesce = null;
      set({
        title: doc.title,
        slides: doc.slides.length ? doc.slides.map((sl) => ({ ...sl, els: upgradeEls(sl.els) })) : [blankSlide()],
        current: 0,
        selection: [],
        editingId: null,
        past: [],
        future: [],
        revision: 0,
        savedRevision: 0,
        saveState: "saved",
        zoom: 1,
        guides: [],
      });
    },

    setTitle: (title) => commit({ title }, { history: false }),
    setZoom: (zoom) => set({ zoom: Math.min(4, Math.max(0.25, zoom)) }),
    setGuides: (guides) => set({ guides }),

    markSaving: () => {
      set({ saveState: "saving" });
      return get().revision;
    },
    markSaved: (revision) => {
      const s = get();
      set({ savedRevision: revision, saveState: s.revision === revision ? "saved" : "dirty" });
    },
    markError: () => set({ saveState: "error" }),

    undo: () => {
      get().stopEditing();
      const s = get();
      const prev = s.past[s.past.length - 1];
      if (!prev) return;
      lastCoalesce = null;
      set({
        slides: prev.slides,
        current: Math.min(prev.current, prev.slides.length - 1),
        past: s.past.slice(0, -1),
        future: [...s.future, { slides: s.slides, current: s.current }],
        selection: [],
        revision: s.revision + 1,
        saveState: "dirty",
      });
    },

    redo: () => {
      get().stopEditing();
      const s = get();
      const next = s.future[s.future.length - 1];
      if (!next) return;
      lastCoalesce = null;
      set({
        slides: next.slides,
        current: Math.min(next.current, next.slides.length - 1),
        future: s.future.slice(0, -1),
        past: [...s.past, { slides: s.slides, current: s.current }],
        selection: [],
        revision: s.revision + 1,
        saveState: "dirty",
      });
    },

    beginGesture: () => {
      const s = get();
      gestureStart = { slides: s.slides, current: s.current };
    },

    endGesture: () => {
      const s = get();
      const start = gestureStart;
      gestureStart = null;
      if (!start || start.slides === s.slides) return;
      lastCoalesce = null;
      set({ past: [...s.past, start].slice(-HISTORY_LIMIT), future: [] });
    },

    goTo: (index) => {
      get().stopEditing();
      const s = get();
      const current = Math.min(s.slides.length - 1, Math.max(0, index));
      if (current !== s.current) set({ current, selection: [], guides: [] });
    },

    addSlide: (slide, at) => {
      get().stopEditing();
      const s = get();
      const base = currentSlide(s);
      // Une diapo vierge reprend le fond et les éléments « repris sur chaque diapo » (logo, avatar).
      // Exception de la charte : le fond doré est réservé à la diapo d'ouverture, la suite passe en crème.
      const bg = base.bg.kind === "image" && base.bg.src === OPENING_BG ? DEFAULT_BG : base.bg;
      const next = slide ?? { id: uid(), bg: { ...bg }, els: cloneEls(base.els.filter((el) => el.keep)) };
      const index = at ?? s.current + 1;
      const slides = [...s.slides.slice(0, index), next, ...s.slides.slice(index)];
      commit({ slides, current: index, selection: [] });
    },

    addSlides: (added, at) => {
      if (!added.length) return;
      get().stopEditing();
      const s = get();
      const index = at ?? s.current + 1;
      const slides = [...s.slides.slice(0, index), ...added, ...s.slides.slice(index)];
      commit({ slides, current: index, selection: [] });
    },

    duplicateSlide: (index) => {
      get().stopEditing();
      const s = get();
      const src = s.slides[index];
      if (!src) return;
      const slides = [...s.slides.slice(0, index + 1), cloneSlide(src), ...s.slides.slice(index + 1)];
      commit({ slides, current: index + 1, selection: [] });
    },

    deleteSlide: (index) => {
      get().stopEditing();
      const s = get();
      if (s.slides.length <= 1) {
        // On ne laisse jamais une présentation sans diapo : la dernière est vidée.
        commit({ slides: [{ ...s.slides[0], els: s.slides[0].els.filter((el) => el.keep) }], current: 0, selection: [] });
        return;
      }
      const slides = s.slides.filter((_, i) => i !== index);
      const current = index < s.current ? s.current - 1 : Math.min(s.current, slides.length - 1);
      commit({ slides, current, selection: [] });
    },

    moveSlide: (from, to) => {
      const s = get();
      if (from === to || from < 0 || to < 0 || from >= s.slides.length || to >= s.slides.length) return;
      get().stopEditing();
      const slides = s.slides.slice();
      const [moved] = slides.splice(from, 1);
      slides.splice(to, 0, moved);
      const currentId = s.slides[s.current].id;
      commit({ slides, current: slides.findIndex((sl) => sl.id === currentId) });
    },

    setBackground: (bg, all) => {
      const s = get();
      if (all) {
        commit({ slides: s.slides.map((sl) => ({ ...sl, bg: { ...bg } })) });
      } else {
        updateCurrent((sl) => ({ ...sl, bg: { ...bg } }), { coalesce: "bg" });
      }
    },

    select: (ids) => {
      const s = get();
      if (s.editingId && !(ids.length === 1 && ids[0] === s.editingId)) get().stopEditing();
      const slide = currentSlide(get());
      set({ selection: expandGroups(slide, ids) });
    },

    toggleSelect: (ids) => {
      get().stopEditing();
      const s = get();
      const slide = currentSlide(s);
      const target = expandGroups(slide, ids);
      const allIn = target.every((id) => s.selection.includes(id));
      const selection = allIn ? s.selection.filter((id) => !target.includes(id)) : [...new Set([...s.selection, ...target])];
      set({ selection });
    },

    selectAll: () => {
      get().stopEditing();
      set({ selection: currentSlide(get()).els.map((el) => el.id) });
    },

    startEditing: (id) => {
      const s = get();
      if (s.editingId === id) return;
      if (s.editingId) get().stopEditing();
      const el = currentSlide(get()).els.find((e) => e.id === id);
      if (!el || el.type !== "text") return;
      set({ editingId: id, selection: [id] });
    },

    stopEditing: () => {
      const s = get();
      const id = s.editingId;
      if (!id) return;
      const html = readEditingHtml ? readEditingHtml() : null;
      readEditingHtml = null;
      set({ editingId: null });
      if (html === null) return;
      const slide = currentSlide(get());
      const el = slide.els.find((e) => e.id === id);
      if (!el || el.type !== "text") return;
      if (isBlankHtml(html) && !el.box) {
        // Un texte vidé disparaît : pas d'élément invisible qui traîne sur la diapo.
        updateCurrent((sl) => ({ ...sl, els: sl.els.filter((e) => e.id !== id) }), undefined, { selection: [] });
      } else if (html !== el.html) {
        updateCurrent((sl) => ({ ...sl, els: sl.els.map((e) => (e.id === id ? { ...e, html } : e)) }));
      }
    },

    addEls: (input) => {
      if (!input.length) return;
      const els = upgradeEls(input);
      get().stopEditing();
      updateCurrent((sl) => ({ ...sl, els: [...sl.els, ...els] }), undefined, { selection: els.map((e) => e.id) });
    },

    updateEls: (ids, fn, opts) => {
      if (!ids.length) return;
      const set_ = new Set(ids);
      updateCurrent((sl) => {
        let changed = false;
        const els = sl.els.map((el) => {
          if (!set_.has(el.id)) return el;
          const next = fn(el);
          if (next !== el) changed = true;
          return next;
        });
        return changed ? { ...sl, els } : sl;
      }, opts);
    },

    setMeasured: (id, h, w) => {
      const s = get();
      const slide = currentSlide(s);
      const els = applyMeasure(slide.els, id, h, w);
      if (!els) return;
      set({ slides: replaceSlide(s.slides, s.current, { ...slide, els }) });
    },

    removeEls: (ids) => {
      if (!ids.length) return;
      const s = get();
      if (s.editingId) set({ editingId: null });
      readEditingHtml = null;
      const set_ = new Set(ids);
      updateCurrent((sl) => ({ ...sl, els: sl.els.filter((el) => !set_.has(el.id)) }), undefined, { selection: [] });
    },

    duplicateEls: (ids) => {
      if (!ids.length) return;
      get().stopEditing();
      const slide = currentSlide(get());
      const copies = cloneEls(
        slide.els.filter((el) => ids.includes(el.id)),
        40,
        40,
      );
      updateCurrent((sl) => ({ ...sl, els: [...sl.els, ...copies] }), undefined, { selection: copies.map((e) => e.id) });
    },

    reorder: (ids, how) => {
      if (!ids.length) return;
      const set_ = new Set(ids);
      updateCurrent((sl) => {
        const picked = sl.els.filter((el) => set_.has(el.id));
        const rest = sl.els.filter((el) => !set_.has(el.id));
        if (how === "front") return { ...sl, els: [...rest, ...picked] };
        if (how === "back") return { ...sl, els: [...picked, ...rest] };
        const els = sl.els.slice();
        if (how === "forward") {
          for (let i = els.length - 2; i >= 0; i--) {
            if (set_.has(els[i].id) && !set_.has(els[i + 1].id)) [els[i], els[i + 1]] = [els[i + 1], els[i]];
          }
        } else {
          for (let i = 1; i < els.length; i++) {
            if (set_.has(els[i].id) && !set_.has(els[i - 1].id)) [els[i], els[i - 1]] = [els[i - 1], els[i]];
          }
        }
        return { ...sl, els };
      });
    },

    group: (ids) => {
      if (ids.length < 2) return;
      const g = uid();
      get().updateEls(ids, (el) => ({ ...el, group: g }));
    },

    ungroup: (ids) => {
      get().updateEls(ids, (el) => (el.group ? { ...el, group: undefined } : el));
    },

    align: (ids, how) => {
      const slide = currentSlide(get());
      const els = slide.els.filter((el) => ids.includes(el.id));
      const box = union(els.map(bbox));
      if (!box) return;
      // La sélection s'aligne d'un bloc par rapport à la diapo.
      let dx = 0;
      let dy = 0;
      if (how === "left") dx = -box.x;
      if (how === "center") dx = SLIDE_W / 2 - (box.x + box.w / 2);
      if (how === "right") dx = SLIDE_W - (box.x + box.w);
      if (how === "top") dy = -box.y;
      if (how === "middle") dy = SLIDE_H / 2 - (box.y + box.h / 2);
      if (how === "bottom") dy = SLIDE_H - (box.y + box.h);
      if (!dx && !dy) return;
      get().updateEls(ids, (el) => ({ ...el, x: el.x + dx, y: el.y + dy }));
    },

    nudge: (ids, dx, dy) => {
      get().updateEls(ids, (el) => ({ ...el, x: el.x + dx, y: el.y + dy }), { coalesce: "nudge" });
    },

    copy: () => {
      const s = get();
      const slide = currentSlide(s);
      const els = slide.els.filter((el) => s.selection.includes(el.id));
      if (!els.length) return;
      clipboard = structuredClone(els);
      pasteCount = 0;
    },

    cut: () => {
      const s = get();
      if (!s.selection.length) return;
      get().copy();
      get().removeEls(s.selection);
    },

    paste: () => {
      if (!clipboard.length) return;
      pasteCount += 1;
      get().addEls(cloneEls(clipboard, 40 * pasteCount, 40 * pasteCount));
    },
  };
});

export function hasClipboard(): boolean {
  return clipboard.length > 0;
}
