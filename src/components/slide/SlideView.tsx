"use client";

import { memo, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { fontDef } from "@/lib/fonts";
import { normalizeEditable, safeHtml } from "@/lib/text";
import { SLIDE_H, SLIDE_W, type Background, type El, type ImageEl, type ShapeEl, type Slide, type TextEl } from "@/lib/types";

/**
 * Rendu d'une diapo. C'est l'unique endroit où une diapo est dessinée :
 * l'éditeur, les miniatures, le mode présentation et l'export passent tous
 * par ce composant, ce qui garantit qu'ils montrent la même chose.
 */

/** Ombre dure façon MS Creators : vers le bas-gauche. */
const boxShadow = (len: number) => (len > 0 ? `${-len}px ${len}px 0 #000` : undefined);
const textShadow = (len: number) => (len > 0 ? `drop-shadow(${-len * 0.7}px ${len}px 0 #000)` : undefined);

function frameStyle(el: El, autoHeight: boolean): CSSProperties {
  return {
    left: el.x,
    top: el.y,
    width: el.w,
    height: autoHeight ? undefined : el.h,
    transform: el.rot ? `rotate(${el.rot}deg)` : undefined,
    opacity: el.opacity ?? 1,
  };
}

export function textStyle(el: TextEl): CSSProperties {
  const f = fontDef(el.font);
  return {
    fontFamily: `'${f.family}', sans-serif`,
    fontWeight: f.weight,
    fontStretch: f.stretch,
    fontSize: el.size,
    lineHeight: el.lh,
    letterSpacing: `${f.ls}em`,
    wordSpacing: `${f.ws}em`,
    color: el.color,
    textAlign: el.align,
    textTransform: el.upper ? "uppercase" : "none",
    WebkitTextStroke: el.stroke > 0 ? `${el.stroke * 2}px ${el.strokeColor}` : undefined,
    filter: textShadow(el.shadow),
    // Variables lues par les puces de liste (pseudo-éléments).
    ["--lh" as string]: el.lh,
    ["--bullet-fill" as string]: el.color,
    ["--bullet-stroke" as string]: el.stroke > 0 ? el.strokeColor : el.color,
    ["--bullet-border" as string]: el.stroke > 0 ? `${Math.max(2, el.stroke * 0.9)}px` : "0px",
  };
}

interface EditHooks {
  /** Identifiant du texte en cours d'édition, s'il y en a un. */
  editingId: string | null;
  /** Sélectionner tout le texte à l'entrée en édition (élément tout juste ajouté). */
  selectAllOnEdit: (id: string) => boolean;
  /** Point cliqué pour entrer en édition : le curseur s'y place. */
  editPoint: { x: number; y: number } | null;
  onMeasure: (id: string, h: number) => void;
  registerReader: (read: (() => string | null) | null) => void;
}

function TextView({ el, edit }: { el: TextEl; edit?: EditHooks }) {
  const frameRef = useRef<HTMLDivElement>(null);
  const txRef = useRef<HTMLDivElement>(null);
  const editing = !!edit && edit.editingId === el.id;
  const html = safeHtml(el.html);
  const auto = !el.fixedH;

  // Mesure de la hauteur réelle (le texte grandit avec son contenu).
  useLayoutEffect(() => {
    if (!edit) return;
    const node = frameRef.current;
    if (!node) return;
    const report = () => edit.onMeasure(el.id, node.offsetHeight);
    report();
    const ro = new ResizeObserver(report);
    ro.observe(node);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [el.id, !!edit]);

  // Entrée et sortie du mode édition.
  useEffect(() => {
    const node = txRef.current;
    if (!node || !edit) return;
    if (!editing) {
      // À la sortie, le DOM est réaligné sur le contenu enregistré.
      if (node.innerHTML !== html) node.innerHTML = html;
      return;
    }
    edit.registerReader(() => normalizeEditable(node));
    node.focus({ preventScroll: true });
    const sel = window.getSelection();
    if (sel) {
      let range: Range | null = null;
      if (!edit.selectAllOnEdit(el.id) && edit.editPoint) {
        const doc = document as Document & {
          caretRangeFromPoint?: (x: number, y: number) => Range | null;
          caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
        };
        if (doc.caretRangeFromPoint) {
          range = doc.caretRangeFromPoint(edit.editPoint.x, edit.editPoint.y);
        } else if (doc.caretPositionFromPoint) {
          const pos = doc.caretPositionFromPoint(edit.editPoint.x, edit.editPoint.y);
          if (pos) {
            range = document.createRange();
            range.setStart(pos.offsetNode, pos.offset);
            range.collapse(true);
          }
        }
        if (range && !node.contains(range.startContainer)) range = null;
      }
      if (!range) {
        range = document.createRange();
        range.selectNodeContents(node);
      }
      sel.removeAllRanges();
      sel.addRange(range);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing]);

  const box = el.box;
  const boxStyle: CSSProperties = box
    ? {
        background: box.fill,
        border: box.border > 0 ? `${box.border}px solid ${box.borderColor}` : undefined,
        borderRadius: box.radius,
        boxShadow: boxShadow(box.shadow),
        padding: `${box.padY}px ${box.padX}px`,
      }
    : {};

  return (
    <div ref={frameRef} className="el el-text" data-el-id={edit ? el.id : undefined} style={frameStyle(el, auto)}>
      <div className={"tx-box" + (auto ? "" : " tx-fixed")} style={boxStyle}>
        <div
          ref={txRef}
          className={"tx" + (el.list ? " tx-list" : "") + (editing ? " tx-editing" : "")}
          style={textStyle(el)}
          contentEditable={editing}
          suppressContentEditableWarning
          spellCheck={false}
          dangerouslySetInnerHTML={{ __html: html }}
        />
      </div>
    </div>
  );
}

function ShapeView({ el, live }: { el: ShapeEl; live: boolean }) {
  const id = live ? el.id : undefined;
  if (el.shape === "arrow") {
    const t = Math.max(2, el.border);
    const head = Math.min(el.w * 0.6, Math.max(18, t * 3.2));
    const cy = el.h / 2;
    return (
      <div className="el el-shape" data-el-id={id} style={frameStyle(el, false)}>
        <svg width={el.w} height={el.h} viewBox={`0 0 ${el.w} ${el.h}`} style={{ overflow: "visible", display: "block" }}>
          <line x1={t / 2} y1={cy} x2={el.w - head * 0.75} y2={cy} stroke={el.borderColor} strokeWidth={t} strokeLinecap="round" />
          <polygon
            points={`${el.w},${cy} ${el.w - head},${cy - head * 0.62} ${el.w - head},${cy + head * 0.62}`}
            fill={el.borderColor}
            stroke={el.borderColor}
            strokeWidth={t * 0.5}
            strokeLinejoin="round"
          />
        </svg>
      </div>
    );
  }
  return (
    <div
      className="el el-shape"
      data-el-id={id}
      style={{
        ...frameStyle(el, false),
        background: el.fill,
        border: el.border > 0 ? `${el.border}px solid ${el.borderColor}` : undefined,
        borderRadius: el.shape === "ellipse" ? "50%" : el.radius,
        boxShadow: boxShadow(el.shadow),
      }}
    />
  );
}

function ImageView({ el, live }: { el: ImageEl; live: boolean }) {
  return (
    <div
      className="el el-image"
      data-el-id={live ? el.id : undefined}
      style={{
        ...frameStyle(el, false),
        border: el.border > 0 ? `${el.border}px solid ${el.borderColor}` : undefined,
        borderRadius: el.radius,
        boxShadow: boxShadow(el.shadow),
        overflow: el.radius > 0 || el.border > 0 ? "hidden" : undefined,
        background: el.border > 0 ? el.borderColor : undefined,
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={el.src} alt="" draggable={false} style={{ width: "100%", height: "100%", objectFit: el.fit, display: "block" }} />
    </div>
  );
}

const ElementView = memo(function ElementView({ el, edit }: { el: El; edit?: EditHooks }) {
  if (el.type === "text") return <TextView el={el} edit={edit} />;
  // Seule la diapo en cours d'édition expose ses identifiants (les miniatures ne sont pas cliquables).
  if (el.type === "shape") return <ShapeView el={el} live={!!edit} />;
  return <ImageView el={el} live={!!edit} />;
});

export function BackgroundView({ bg }: { bg: Background }) {
  if (bg.kind === "color") return <div className="ms-bg" style={{ background: bg.color }} />;
  return (
    <div className="ms-bg">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={bg.src} alt="" draggable={false} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
    </div>
  );
}

/** La diapo à sa taille réelle (1920 × 1080), sans mise à l'échelle. */
export function SlideContent({ slide, edit }: { slide: Slide; edit?: EditHooks }) {
  return (
    <div className={"ms-slide" + (edit ? " ms-slide-edit" : "")} style={{ width: SLIDE_W, height: SLIDE_H }}>
      <BackgroundView bg={slide.bg} />
      {slide.els.map((el) => (
        <ElementView key={el.id} el={el} edit={edit} />
      ))}
    </div>
  );
}

/** Diapo non interactive mise à l'échelle pour tenir dans `width` pixels. */
export const SlideThumb = memo(function SlideThumb({ slide, width, className }: { slide: Slide; width: number; className?: string }) {
  const scale = width / SLIDE_W;
  return (
    <div className={"ms-thumb " + (className ?? "")} style={{ width, height: SLIDE_H * scale }}>
      <div style={{ transform: `scale(${scale})`, transformOrigin: "0 0", width: SLIDE_W, height: SLIDE_H }}>
        <SlideContent slide={slide} />
      </div>
    </div>
  );
});

/** Miniature qui occupe toute la largeur de son conteneur (cartes de taille variable). */
export function FluidThumb({ slide }: { slide: Slide }) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    const measure = () => setWidth(node.clientWidth);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(node);
    return () => ro.disconnect();
  }, []);
  return (
    <div ref={ref} style={{ width: "100%", aspectRatio: `${SLIDE_W} / ${SLIDE_H}`, overflow: "hidden" }}>
      {width > 0 && <SlideThumb slide={slide} width={width} />}
    </div>
  );
}

/** Aperçu d'un bloc d'éléments de bibliothèque, centré dans une vignette. */
export const ElementsThumb = memo(function ElementsThumb({ els, width, height }: { els: El[]; width: number; height: number }) {
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
  const pad = 26;
  const w = Math.max(1, x2 - x1) + pad * 2;
  const h = Math.max(1, y2 - y1) + pad * 2;
  const scale = Math.min(width / w, height / h, 0.5);
  return (
    <div style={{ width, height, position: "relative", overflow: "hidden" }}>
      <div
        className="ms-els"
        style={{
          position: "absolute",
          left: (width - w * scale) / 2,
          top: (height - h * scale) / 2,
          width: w,
          height: h,
          transform: `scale(${scale})`,
          transformOrigin: "0 0",
        }}
      >
        <div style={{ position: "absolute", left: pad - x1, top: pad - y1 }}>
          {els.map((el) => (
            <ElementView key={el.id} el={el} />
          ))}
        </div>
      </div>
    </div>
  );
});
