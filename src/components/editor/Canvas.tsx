"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { RotateCw } from "lucide-react";
import { SlideContent } from "@/components/slide/SlideView";
import { currentSlide, expandGroups, setEditingReader, useEditor } from "@/lib/editor/store";
import {
  HANDLES,
  angleFromCenter,
  bbox,
  center,
  intersects,
  normalizeRect,
  resizeRect,
  round1,
  scaleEl,
  scaleTextEffects,
  snapAngle,
  snapLines,
  snapMove,
  union,
  type Handle,
  type Pt,
  type Rect,
  type SnapLines,
} from "@/lib/geometry";
import { strokeFor } from "@/lib/factory";
import { SLIDE_H, SLIDE_W, type El } from "@/lib/types";

/** Éléments tout juste ajoutés : à la première édition, tout leur texte est sélectionné. */
const fresh = new Set<string>();
export function markFresh(ids: string[]) {
  for (const id of ids) fresh.add(id);
}

type Drag =
  | { kind: "move"; start: Pt; els: El[]; box: Rect; lines: SnapLines; moved: boolean; clickedId: string; wasSelected: boolean }
  | { kind: "resize"; start: Pt; els: El[]; handle: Handle; box: Rect; multi: boolean; moved: boolean }
  | { kind: "rotate"; el: El; startAngle: number; moved: boolean }
  | { kind: "marquee"; start: Pt; base: string[] };

const PAD = 30;
/** Bande réservée en haut à la barre d'outils, pour qu'elle ne recouvre jamais la diapo. */
const PAD_TOP = 66;
const DRAG_THRESHOLD = 3;
const SNAP_PX = 7;

export interface CanvasDropHandlers {
  onDropAsset: (assetId: string, at: Pt) => void;
  onDropFiles: (files: File[], at: Pt) => void;
}

export function Canvas({ onDropAsset, onDropFiles }: CanvasDropHandlers) {
  const areaRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);
  /** Point du double-clic qui a ouvert l'édition : le curseur de texte s'y place. */
  const [editPoint, setEditPoint] = useState<Pt | null>(null);
  const [fit, setFit] = useState(0.4);
  const [marquee, setMarquee] = useState<Rect | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const [dropping, setDropping] = useState(false);

  const slide = useEditor((s) => currentSlide(s));
  const selection = useEditor((s) => s.selection);
  const editingId = useEditor((s) => s.editingId);
  const guides = useEditor((s) => s.guides);
  const zoom = useEditor((s) => s.zoom);
  const scale = fit * zoom;

  // Échelle à laquelle la diapo tient entière dans la zone de travail.
  useLayoutEffect(() => {
    const area = areaRef.current;
    if (!area) return;
    const measure = () => {
      const w = area.clientWidth - PAD * 2;
      const h = area.clientHeight - PAD - PAD_TOP;
      setFit(Math.max(0.1, Math.min(w / SLIDE_W, h / SLIDE_H)));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(area);
    return () => ro.disconnect();
  }, []);

  const toSlide = useCallback(
    (e: { clientX: number; clientY: number }): Pt => {
      const r = innerRef.current!.getBoundingClientRect();
      return { x: (e.clientX - r.left) / scale, y: (e.clientY - r.top) / scale };
    },
    [scale],
  );

  const selectedEls = useMemo(() => slide.els.filter((el) => selection.includes(el.id)), [slide, selection]);
  const selBox = useMemo(() => union(selectedEls.map(bbox)), [selectedEls]);

  const edit = useMemo(
    () => ({
      editingId,
      selectAllOnEdit: (id: string) => {
        const was = fresh.has(id);
        fresh.delete(id);
        return was;
      },
      editPoint,
      onMeasure: (id: string, h: number, w?: number) => useEditor.getState().setMeasured(id, h, w),
      registerReader: setEditingReader,
    }),
    [editingId, editPoint],
  );

  /* ───────────── Gestes ───────────── */

  const elIdFrom = (target: EventTarget | null): string | null => {
    const node = (target as HTMLElement | null)?.closest?.("[data-el-id]") as HTMLElement | null;
    return node?.dataset.elId ?? null;
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    const st = useEditor.getState();
    const id = elIdFrom(e.target);
    // Dans le texte en cours d'édition, la souris sert à placer le curseur.
    if (st.editingId && id === st.editingId) return;
    const p = toSlide(e);
    setHover(null);

    if (!id) {
      st.stopEditing();
      const additive = e.shiftKey || e.metaKey || e.ctrlKey;
      if (!additive) st.select([]);
      drag.current = { kind: "marquee", start: p, base: additive ? useEditor.getState().selection : [] };
      return;
    }

    e.preventDefault();
    (document.activeElement as HTMLElement | null)?.blur?.();
    const additive = e.shiftKey || e.metaKey || e.ctrlKey;
    if (additive) {
      st.toggleSelect([id]);
      return;
    }
    const wasSelected = st.selection.includes(id);
    if (!wasSelected) st.select([id]);
    const now = useEditor.getState();
    const sl = currentSlide(now);
    const els = sl.els.filter((el) => now.selection.includes(el.id));
    const box = union(els.map(bbox));
    if (!box) return;
    const others = sl.els.filter((el) => !now.selection.includes(el.id)).map(bbox);
    drag.current = {
      kind: "move",
      start: p,
      els,
      box,
      lines: snapLines(SLIDE_W, SLIDE_H, others),
      moved: false,
      clickedId: id,
      wasSelected,
    };
  };

  const startResize = (e: React.PointerEvent, handle: Handle) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const st = useEditor.getState();
    st.stopEditing();
    const sl = currentSlide(useEditor.getState());
    const els = sl.els.filter((el) => st.selection.includes(el.id));
    const box = union(els.map(bbox));
    if (!box) return;
    drag.current = { kind: "resize", start: toSlide(e), els, handle, box, multi: els.length > 1, moved: false };
  };

  const startRotate = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const st = useEditor.getState();
    st.stopEditing();
    const el = currentSlide(useEditor.getState()).els.find((x) => x.id === st.selection[0]);
    if (!el) return;
    drag.current = { kind: "rotate", el, startAngle: angleFromCenter(center(el), toSlide(e)), moved: false };
  };

  const onHover = (e: React.PointerEvent) => {
    if (drag.current) return;
    const id = elIdFrom(e.target);
    if (id !== hover) setHover(id);
  };

  const onDragMove = (e: PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const st = useEditor.getState();
    const p = toSlide(e);

    if (d.kind === "marquee") {
      const rect = normalizeRect(d.start, p);
      setMarquee(rect);
      const sl = currentSlide(st);
      const hit = sl.els.filter((el) => intersects(bbox(el), rect)).map((el) => el.id);
      st.select([...new Set([...d.base, ...hit])]);
      return;
    }

    if (d.kind === "move") {
      let dx = p.x - d.start.x;
      let dy = p.y - d.start.y;
      if (!d.moved) {
        if (Math.hypot(dx, dy) * scale < DRAG_THRESHOLD) return;
        d.moved = true;
        st.beginGesture();
      }
      if (e.shiftKey) {
        // Maj : déplacement contraint à un axe.
        if (Math.abs(dx) > Math.abs(dy)) dy = 0;
        else dx = 0;
      }
      let shown: ReturnType<typeof snapMove>["guides"] = [];
      if (!e.altKey) {
        const snap = snapMove({ ...d.box, x: d.box.x + dx, y: d.box.y + dy }, d.lines, SNAP_PX / scale);
        dx += snap.dx;
        dy += snap.dy;
        shown = snap.guides;
      }
      const byId = new Map(d.els.map((el) => [el.id, el]));
      st.updateEls(
        d.els.map((el) => el.id),
        (el) => {
          const s0 = byId.get(el.id)!;
          return { ...el, x: round1(s0.x + dx), y: round1(s0.y + dy) };
        },
        { history: false },
      );
      st.setGuides(shown);
      return;
    }

    if (d.kind === "rotate") {
      if (!d.moved) {
        d.moved = true;
        st.beginGesture();
      }
      const a = angleFromCenter(center(d.el), p);
      const rot = snapAngle(d.el.rot + (a - d.startAngle), e.shiftKey ? 15 : null);
      st.updateEls([d.el.id], (el) => ({ ...el, rot }), { history: false });
      return;
    }

    // Redimensionnement.
    const delta = { x: p.x - d.start.x, y: p.y - d.start.y };
    if (!d.moved) {
      if (Math.hypot(delta.x, delta.y) * scale < DRAG_THRESHOLD) return;
      d.moved = true;
      st.beginGesture();
    }
    const { hx, hy } = d.handle;

    if (d.multi) {
      // Sélection multiple : mise à l'échelle uniforme autour du coin opposé.
      const anchor = { x: hx < 0 ? d.box.x + d.box.w : d.box.x, y: hy < 0 ? d.box.y + d.box.h : d.box.y };
      const sx = (hx * (p.x - anchor.x)) / d.box.w;
      const sy = (hy * (p.y - anchor.y)) / d.box.h;
      const s = Math.max(0.05, Math.max(sx, sy));
      const byId = new Map(d.els.map((el) => [el.id, el]));
      st.updateEls(
        d.els.map((el) => el.id),
        (el) => scaleEl(byId.get(el.id)!, anchor, s),
        { history: false },
      );
      return;
    }

    const s0 = d.els[0];
    if (s0.type === "text") {
      if (hx !== 0 && hy !== 0) {
        // Coin d'un texte : la taille des lettres suit.
        const r = resizeRect(s0, d.handle, delta, { keepRatio: true, minW: 40, minH: 10 });
        const s = r.w / s0.w;
        const size = Math.max(8, round1(s0.size * s));
        st.updateEls(
          [s0.id],
          (el) =>
            el.type === "text"
              ? {
                  ...el,
                  x: r.x,
                  y: r.y,
                  w: r.w,
                  h: s0.fixedH ? r.h : el.h,
                  size,
                  ...(({ stroke, shadow, glow, dy, box, minH, minW }) => ({ stroke, shadow, glow, dy, box, minH, minW }))(scaleTextEffects(s0, s, round1)),
                }
              : el,
          { history: false },
        );
      } else if (hx !== 0) {
        // Côté gauche/droit : la largeur change, le texte se réorganise.
        const r = resizeRect(s0, d.handle, delta, { minW: 60, minH: 10 });
        // Un texte qui suit son contenu prend cette largeur comme minimum.
        st.updateEls([s0.id], (el) => ({ ...el, x: r.x, y: r.y, w: r.w, ...(el.type === "text" && el.hug ? { minW: r.w } : {}) }), { history: false });
      } else {
        // Haut/bas : hauteur fixée, texte centré dedans.
        const r = resizeRect(s0, d.handle, delta, { minW: 60, minH: 20 });
        st.updateEls([s0.id], (el) => (el.type === "text" ? { ...el, x: r.x, y: r.y, h: r.h, minH: r.h, fixedH: true } : el), { history: false });
      }
      return;
    }

    // Une image garde ses proportions par un coin ; Maj inverse ce comportement.
    const isCorner = hx !== 0 && hy !== 0;
    const keepRatio = s0.type === "image" ? isCorner !== e.shiftKey : e.shiftKey;
    const r = resizeRect(s0, d.handle, delta, { keepRatio, minW: 12, minH: 12 });
    st.updateEls([s0.id], (el) => ({ ...el, x: round1(r.x), y: round1(r.y), w: round1(r.w), h: round1(r.h) }), { history: false });
  };

  const onDragEnd = () => {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    const st = useEditor.getState();
    if (d.kind === "marquee") {
      setMarquee(null);
      return;
    }
    if (d.moved) {
      st.endGesture();
      st.setGuides([]);
    } else if (d.kind === "move" && d.wasSelected && st.selection.length > 1) {
      // Clic simple sur un élément d'une sélection multiple : on ne garde que lui (et son groupe).
      const sl = currentSlide(st);
      const only = expandGroups(sl, [d.clickedId]);
      if (only.length < st.selection.length) st.select([d.clickedId]);
    }
  };

  // Les gestes se suivent au niveau de la fenêtre : ils continuent quand le pointeur sort de la diapo.
  const moveRef = useRef(onDragMove);
  const endRef = useRef(onDragEnd);
  useEffect(() => {
    moveRef.current = onDragMove;
    endRef.current = onDragEnd;
  });
  useEffect(() => {
    const move = (e: PointerEvent) => moveRef.current(e);
    const end = () => endRef.current();
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
    };
  }, []);

  const onDoubleClick = (e: React.MouseEvent) => {
    const id = elIdFrom(document.elementFromPoint(e.clientX, e.clientY));
    if (!id) return;
    const st = useEditor.getState();
    if (st.editingId === id) return;
    const el = currentSlide(st).els.find((x) => x.id === id);
    if (!el) return;
    if (el.type === "text") {
      setEditPoint({ x: e.clientX, y: e.clientY });
      st.startEditing(id);
    } else if (el.group) {
      // Double-clic dans un groupe : on attrape l'élément seul.
      useEditor.setState({ selection: [id] });
    }
  };


  /* ───────────── Dépôt (bibliothèque, fichiers) ───────────── */

  const onDragOver = (e: React.DragEvent) => {
    const types = Array.from(e.dataTransfer.types);
    if (types.includes("application/x-ms-asset") || types.includes("Files")) {
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
      if (!dropping) setDropping(true);
    }
  };

  const onDrop = (e: React.DragEvent) => {
    setDropping(false);
    const at = toSlide(e);
    const assetId = e.dataTransfer.getData("application/x-ms-asset");
    if (assetId) {
      e.preventDefault();
      onDropAsset(assetId, at);
      return;
    }
    const files = Array.from(e.dataTransfer.files).filter((f) => f.type.startsWith("image/"));
    if (files.length) {
      e.preventDefault();
      onDropFiles(files, at);
    }
  };

  /* ───────────── Rendu ───────────── */

  const single = selectedEls.length === 1 ? selectedEls[0] : null;
  const hoverEl = hover && !selection.includes(hover) ? slide.els.find((el) => el.id === hover) : null;
  const stageW = SLIDE_W * scale;
  const stageH = SLIDE_H * scale;

  return (
    <div
      ref={areaRef}
      className="dots scroll-thin relative h-full w-full overflow-auto rounded-[18px]"
      onDragOver={onDragOver}
      onDragLeave={() => setDropping(false)}
      onDrop={onDrop}
      data-testid="canvas-area"
    >
      <div
        className="flex min-h-full min-w-full items-center justify-center"
        style={{
          padding: `${PAD_TOP}px ${PAD}px ${PAD}px`,
          width: zoom > 1 ? stageW + PAD * 2 : undefined,
          height: zoom > 1 ? stageH + PAD + PAD_TOP : undefined,
        }}
      >
        <div
          data-testid="stage"
          className={"relative flex-none rounded-[6px] border-[3px] border-ink bg-white " + (dropping ? "ring-4 ring-blue" : "")}
          style={{ width: stageW + 6, height: stageH + 6, boxShadow: "5px 6px 0 #111", touchAction: "none" }}
          onPointerDown={onPointerDown}
          onPointerMove={onHover}
          onPointerLeave={() => setHover(null)}
          onDoubleClick={onDoubleClick}
        >
          <div ref={innerRef} data-testid="slide-box" style={{ width: stageW, height: stageH, overflow: "hidden", position: "relative" }}>
            <div style={{ transform: `scale(${scale})`, transformOrigin: "0 0", width: SLIDE_W, height: SLIDE_H }}>
              <SlideContent slide={slide} edit={edit} />
            </div>
          </div>

          {/* Surcouche en pixels écran : contours, poignées, guides. */}
          <div className="pointer-events-none absolute left-0 top-0" style={{ width: stageW, height: stageH }}>
            {hoverEl && <Outline el={hoverEl} scale={scale} color="rgba(59,91,219,.55)" />}
            {selectedEls.length > 1 && selectedEls.map((el) => <Outline key={el.id} el={el} scale={scale} color="rgba(59,91,219,.7)" />)}
            {guides.map((g, i) =>
              g.axis === "x" ? (
                <div key={i} className="absolute top-0 h-full w-px bg-coral" style={{ left: g.pos * scale }} />
              ) : (
                <div key={i} className="absolute left-0 h-px w-full bg-coral" style={{ top: g.pos * scale }} />
              ),
            )}
            {marquee && (
              <div
                className="absolute border border-blue bg-blue/10"
                style={{ left: marquee.x * scale, top: marquee.y * scale, width: marquee.w * scale, height: marquee.h * scale }}
              />
            )}
            {single && <SingleBox el={single} scale={scale} editing={editingId === single.id} onResize={startResize} onRotate={startRotate} />}
            {!single && selBox && selectedEls.length > 1 && <MultiBox box={selBox} scale={scale} onResize={startResize} />}
          </div>
        </div>
      </div>
    </div>
  );
}

function Outline({ el, scale, color }: { el: El; scale: number; color: string }) {
  return (
    <div
      className="absolute"
      style={{
        left: el.x * scale,
        top: el.y * scale,
        width: el.w * scale,
        height: el.h * scale,
        transform: el.rot ? `rotate(${el.rot}deg)` : undefined,
        outline: `1.5px solid ${color}`,
      }}
    />
  );
}

const HANDLE_CLASS = "pointer-events-auto absolute h-[13px] w-[13px] rounded-[3px] border-2 border-blue bg-white";

const CURSORS: Record<string, string> = {
  nw: "nwse-resize",
  se: "nwse-resize",
  ne: "nesw-resize",
  sw: "nesw-resize",
  n: "ns-resize",
  s: "ns-resize",
  e: "ew-resize",
  w: "ew-resize",
};

function handlePos(name: string): React.CSSProperties {
  const h = HANDLES[name];
  return {
    left: `calc(${((h.hx + 1) / 2) * 100}% - 6.5px)`,
    top: `calc(${((h.hy + 1) / 2) * 100}% - 6.5px)`,
    cursor: CURSORS[name],
  };
}

function SingleBox({
  el,
  scale,
  editing,
  onResize,
  onRotate,
}: {
  el: El;
  scale: number;
  editing: boolean;
  onResize: (e: React.PointerEvent, handle: Handle) => void;
  onRotate: (e: React.PointerEvent) => void;
}) {
  const w = el.w * scale;
  const h = el.h * scale;
  // Sur un petit élément, seules les poignées de coin restent pour ne pas le masquer.
  const names = editing ? [] : w < 46 || h < 46 ? ["nw", "ne", "se", "sw"] : el.type === "shape" && el.shape === "arrow" ? ["e", "w", "n", "s"] : Object.keys(HANDLES);
  return (
    <div
      className="absolute"
      data-testid="selection-box"
      style={{
        left: el.x * scale,
        top: el.y * scale,
        width: w,
        height: h,
        transform: el.rot ? `rotate(${el.rot}deg)` : undefined,
        outline: `2px solid var(--blue)`,
        outlineOffset: editing ? 3 : 0,
      }}
    >
      {names.map((n) => (
        <div key={n} data-handle={n} className={HANDLE_CLASS} style={handlePos(n)} onPointerDown={(e) => onResize(e, HANDLES[n])} />
      ))}
      {!editing && (
        <div
          data-handle="rotate"
          className="pointer-events-auto absolute flex h-[22px] w-[22px] items-center justify-center rounded-full border-2 border-blue bg-white text-blue"
          style={{ left: "calc(50% - 11px)", top: -34, cursor: "grab" }}
          onPointerDown={onRotate}
          title="Faire pivoter"
        >
          <RotateCw size={12} strokeWidth={3} />
        </div>
      )}
    </div>
  );
}

function MultiBox({ box, scale, onResize }: { box: Rect; scale: number; onResize: (e: React.PointerEvent, handle: Handle) => void }) {
  return (
    <div
      className="absolute"
      data-testid="selection-box"
      style={{ left: box.x * scale, top: box.y * scale, width: box.w * scale, height: box.h * scale, outline: "2px dashed var(--blue)" }}
    >
      {["nw", "ne", "se", "sw"].map((n) => (
        <div key={n} data-handle={n} className={HANDLE_CLASS} style={handlePos(n)} onPointerDown={(e) => onResize(e, HANDLES[n])} />
      ))}
    </div>
  );
}

/** Applique une taille de police en gardant contour et ombre proportionnés. */
export function resizeFont(el: El, size: number): El {
  if (el.type !== "text") return el;
  const s = size / el.size;
  return {
    ...el,
    size,
    stroke: el.stroke > 0 ? Math.max(1, round1(el.stroke * s)) : 0,
    shadow: el.shadow > 0 ? Math.max(1, round1(el.shadow * s)) : 0,
    glow: el.glow ? { ...el.glow, y: round1(el.glow.y * s), blur: round1(el.glow.blur * s) } : el.glow,
    dy: el.dy ? round1(el.dy * s) : el.dy,
  };
}

export { strokeFor };
