"use client";

import { useRef } from "react";
import {
  AlignCenter,
  AlignHorizontalJustifyCenter,
  AlignLeft,
  AlignRight,
  AlignVerticalJustifyCenter,
  ArrowDownToLine,
  ArrowUpToLine,
  BookmarkPlus,
  CaseUpper,
  ChevronDown,
  ChevronUp,
  Circle,
  Copy,
  Group,
  ImageUp,
  List,
  Minus,
  MoreHorizontal,
  Pin,
  Plus,
  Square,
  SquareRoundCorner,
  Tag,
  Trash2,
  Type,
  Ungroup,
} from "lucide-react";
import { Popover } from "@/components/ui/Popover";
import { ColorMenu } from "./ColorMenu";
import { resizeFont } from "./Canvas";
import { colorSelection, rememberSelection } from "@/lib/editor/richtext";
import { currentSlide, useEditor } from "@/lib/editor/store";
import { FONTS } from "@/lib/fonts";
import { makeBox, shadowFor, strokeFor } from "@/lib/factory";
import type { BoxStyle, El, FontId, ImageEl, ShapeEl, TextEl } from "@/lib/types";

const Sep = () => <div className="mx-1 h-7 w-[2px] flex-none rounded bg-line" />;

function IconBtn({ title, on, onClick, children, danger }: { title: string; on?: boolean; onClick: () => void; children: React.ReactNode; danger?: boolean }) {
  return (
    <button
      className={"ic-btn " + (on ? "on " : "") + (danger ? "text-[#c92a2a] " : "")}
      title={title}
      aria-label={title}
      aria-pressed={on}
      // Le bouton ne prend pas le focus : le texte en cours d'édition garde sa sélection.
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function MenuItem({ icon, label, onClick, on }: { icon: React.ReactNode; label: string; onClick: () => void; on?: boolean }) {
  return (
    <button className={"flex w-full items-center gap-2.5 rounded-[10px] px-2.5 py-2 text-left text-[14px] font-bold hover:bg-[#fff1cf] " + (on ? "bg-sun" : "")} onClick={onClick}>
      <span className="flex w-5 justify-center">{icon}</span>
      {label}
    </button>
  );
}

export function Toolbar({ isStaff, onSaveToLibrary, onReplaceImage }: { isStaff: boolean; onSaveToLibrary: () => void; onReplaceImage: (file: File) => void }) {
  const slide = useEditor((s) => currentSlide(s));
  const selection = useEditor((s) => s.selection);
  const fileRef = useRef<HTMLInputElement>(null);

  const els = slide.els.filter((el) => selection.includes(el.id));
  if (!els.length) return null;

  const st = () => useEditor.getState();
  const ids = els.map((e) => e.id);
  const texts = els.filter((e): e is TextEl => e.type === "text");
  const shapes = els.filter((e): e is ShapeEl => e.type === "shape");
  const images = els.filter((e): e is ImageEl => e.type === "image");
  const allText = texts.length === els.length;
  const allShape = shapes.length === els.length;
  const allImage = images.length === els.length;
  const first = els[0];
  const grouped = els.some((e) => e.group);
  const kept = els.every((e) => e.keep);

  const patchText = (fn: (el: TextEl) => TextEl, coalesce?: string) => st().updateEls(ids, (el) => (el.type === "text" ? fn(el) : el), { coalesce });
  const patchShape = (fn: (el: ShapeEl) => ShapeEl, coalesce?: string) => st().updateEls(ids, (el) => (el.type === "shape" ? fn(el) : el), { coalesce });
  const patchImage = (fn: (el: ImageEl) => ImageEl, coalesce?: string) => st().updateEls(ids, (el) => (el.type === "image" ? fn(el) : el), { coalesce });
  const patchBox = (fn: (box: BoxStyle) => BoxStyle) => patchText((el) => ({ ...el, box: fn(el.box ?? makeBox()) }));

  const t0 = texts[0];
  const s0 = shapes[0];
  const i0 = images[0];

  return (
    <div
      className="nb pop-in flex max-w-full items-center gap-0.5 !rounded-[16px] px-2 py-1.5"
      data-testid="toolbar"
      onMouseDownCapture={rememberSelection}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {allText && t0 && (
        <>
          <div className="relative">
            <select
              className="h-[34px] cursor-pointer appearance-none rounded-[10px] bg-transparent py-0 pl-2.5 pr-7 text-[14px] font-extrabold hover:bg-[#fff1cf]"
              value={t0.font}
              onChange={(e) => patchText((el) => ({ ...el, font: e.target.value as FontId }))}
              title="Police"
              aria-label="Police"
            >
              {FONTS.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.label}
                </option>
              ))}
            </select>
            <ChevronDown size={15} strokeWidth={3} className="pointer-events-none absolute right-2 top-[10px]" />
          </div>
          <Sep />
          <IconBtn title="Plus petit" onClick={() => patchText((el) => resizeFont(el, Math.max(10, Math.round(el.size * 0.92))) as TextEl, "size")}>
            <Minus size={17} strokeWidth={3} />
          </IconBtn>
          <input
            className="h-[30px] w-[46px] rounded-[8px] bg-transparent text-center text-[14px] font-extrabold hover:bg-[#fff1cf] focus:bg-white"
            value={Math.round(t0.size)}
            onChange={(e) => {
              const n = Number(e.target.value.replace(/\D/g, ""));
              if (n >= 8 && n <= 600) patchText((el) => resizeFont(el, n) as TextEl, "size");
            }}
            inputMode="numeric"
            title="Taille du texte"
            aria-label="Taille du texte"
          />
          <IconBtn title="Plus grand" onClick={() => patchText((el) => resizeFont(el, Math.min(600, Math.round(el.size * 1.08) + 1)) as TextEl, "size")}>
            <Plus size={17} strokeWidth={3} />
          </IconBtn>
          <Sep />
          <ColorMenu
            label="Couleur du texte (ou des mots sélectionnés)"
            value={t0.color}
            onPick={(c) => {
              if (!c) return;
              // Une couleur pour tout le texte remplace un éventuel dégradé.
              if (!colorSelection(c)) patchText((el) => ({ ...el, color: c, fill: null }), "color");
            }}
          />
          <button
            className={"ic-btn " + (t0.stroke > 0 ? "on" : "")}
            title="Contour noir épais, façon MS"
            aria-pressed={t0.stroke > 0}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() =>
              patchText((el) => (t0.stroke > 0 ? { ...el, stroke: 0, shadow: 0 } : { ...el, stroke: strokeFor(el.size), shadow: shadowFor(el.size), strokeColor: "#000000" }))
            }
          >
            <Type size={17} strokeWidth={3} />
            Contour
          </button>
          <Sep />
          <IconBtn title="Alignement du texte" onClick={() => patchText((el) => ({ ...el, align: el.align === "left" ? "center" : el.align === "center" ? "right" : "left" }))}>
            {t0.align === "left" ? (
              <AlignLeft size={18} strokeWidth={2.6} />
            ) : t0.align === "center" ? (
              <AlignCenter size={18} strokeWidth={2.6} />
            ) : (
              <AlignRight size={18} strokeWidth={2.6} />
            )}
          </IconBtn>
          <IconBtn title="Liste à puces" on={t0.list} onClick={() => patchText((el) => ({ ...el, list: !t0.list, align: !t0.list ? "left" : el.align }))}>
            <List size={18} strokeWidth={2.6} />
          </IconBtn>
          <IconBtn title="Tout en majuscules" on={t0.upper} onClick={() => patchText((el) => ({ ...el, upper: !t0.upper }))}>
            <CaseUpper size={20} strokeWidth={2.4} />
          </IconBtn>
          <Popover
            width={252}
            align="center"
            button={({ open, toggle }) => (
              <button
                className={"ic-btn " + (open || t0.box ? "on" : "")}
                onMouseDown={(e) => e.preventDefault()}
                onClick={toggle}
                title="Étiquette : fond, bordure et ombre derrière le texte"
              >
                <Tag size={17} strokeWidth={2.6} />
                Étiquette
              </button>
            )}
          >
            {() => (
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between text-[13px] font-bold">
                  Fond
                  <ColorMenu
                    label="Fond de l'étiquette"
                    value={t0.box?.fill ?? null}
                    allowNone
                    withGold
                    onPick={(c) => (c ? patchBox((b) => ({ ...b, fill: c })) : patchText((el) => ({ ...el, box: null, fixedH: false })))}
                  />
                </div>
                {t0.box && (
                  <>
                    <div className="flex items-center justify-between text-[13px] font-bold">
                      Bordure
                      <div className="flex gap-1">
                        {[0, 5, 8].map((b) => (
                          <button
                            key={b}
                            className={"chip !px-2.5 !py-1 !text-[12px] " + (t0.box!.border === b ? "on" : "")}
                            onClick={() => patchBox((box) => ({ ...box, border: b }))}
                          >
                            {b === 0 ? "Sans" : b === 5 ? "Fine" : "Épaisse"}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="flex items-center justify-between text-[13px] font-bold">
                      Ombre
                      <div className="flex gap-1">
                        {[0, 10].map((b) => (
                          <button
                            key={b}
                            className={"chip !px-2.5 !py-1 !text-[12px] " + ((t0.box!.shadow > 0 || !!t0.box!.soft) === b > 0 ? "on" : "")}
                            onClick={() => patchBox((box) => ({ ...box, shadow: b, soft: null }))}
                          >
                            {b === 0 ? "Sans" : "Avec"}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="flex items-center justify-between text-[13px] font-bold">
                      Coins
                      <div className="flex gap-1">
                        {[
                          [0, "Droits"],
                          [12, "Arrondis"],
                          [999, "Pilule"],
                        ].map(([r, name]) => (
                          <button
                            key={r}
                            className={"chip !px-2.5 !py-1 !text-[12px] " + (t0.box!.radius === r ? "on" : "")}
                            onClick={() => patchBox((box) => ({ ...box, radius: r as number }))}
                          >
                            {name}
                          </button>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}
          </Popover>
        </>
      )}

      {allShape && s0 && (
        <>
          {s0.shape !== "arrow" && (
            <ColorMenu label="Couleur de fond" text="Fond" value={s0.fill} withGold onPick={(c) => c && patchShape((el) => ({ ...el, fill: c }), "color")} />
          )}
          <ColorMenu
            label={s0.shape === "arrow" ? "Couleur de la flèche" : "Couleur de la bordure"}
            value={s0.borderColor}
            text={s0.shape === "arrow" ? "Couleur" : "Bord"}
            onPick={(c) => c && patchShape((el) => ({ ...el, borderColor: c }), "color")}
          />
          <IconBtn title="Trait plus fin" onClick={() => patchShape((el) => ({ ...el, border: Math.max(el.shape === "arrow" ? 2 : 0, el.border - 2) }), "border")}>
            <Minus size={17} strokeWidth={3} />
          </IconBtn>
          <span className="w-6 text-center text-[13px] font-extrabold" title="Épaisseur du trait">
            {Math.round(s0.border)}
          </span>
          <IconBtn title="Trait plus épais" onClick={() => patchShape((el) => ({ ...el, border: Math.min(40, el.border + 2) }), "border")}>
            <Plus size={17} strokeWidth={3} />
          </IconBtn>
          {s0.shape === "rect" && (
            <button
              className="ic-btn"
              title="Coins : droits, arrondis, très arrondis"
              onClick={() => patchShape((el) => ({ ...el, radius: el.radius === 0 ? 12 : el.radius <= 12 ? 36 : 0 }))}
            >
              <SquareRoundCorner size={18} strokeWidth={2.6} />
              Coins
            </button>
          )}
          {s0.shape !== "arrow" && (
            <button
              className={"ic-btn " + (s0.shadow > 0 ? "on" : "")}
              title="Ombre dure"
              aria-pressed={s0.shadow > 0}
              onClick={() => patchShape((el) => ({ ...el, shadow: s0.shadow > 0 ? 0 : 14 }))}
            >
              Ombre
            </button>
          )}
        </>
      )}

      {allImage && i0 && (
        <>
          {images.length === 1 && (
            <>
              <button className="ic-btn" onClick={() => fileRef.current?.click()} title="Remplacer l'image (tu peux aussi glisser un fichier dessus)">
                <ImageUp size={18} strokeWidth={2.6} />
                Remplacer
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) onReplaceImage(f);
                  e.target.value = "";
                }}
              />
              <Sep />
            </>
          )}
          <IconBtn
            title={i0.radius >= 9999 ? "Forme : ronde" : i0.radius > 0 ? "Forme : coins arrondis" : "Forme : coins droits"}
            onClick={() => patchImage((el) => ({ ...el, radius: el.radius === 0 ? 14 : el.radius < 9999 ? 9999 : 0 }))}
          >
            {i0.radius >= 9999 ? (
              <Circle size={18} strokeWidth={2.8} />
            ) : i0.radius > 0 ? (
              <SquareRoundCorner size={18} strokeWidth={2.6} />
            ) : (
              <Square size={18} strokeWidth={2.8} />
            )}
          </IconBtn>
          <button className={"ic-btn " + (i0.border > 0 ? "on" : "")} onClick={() => patchImage((el) => ({ ...el, border: i0.border > 0 ? 0 : 8 }))} title="Bordure noire">
            Bordure
          </button>
          <button className={"ic-btn " + (i0.shadow > 0 ? "on" : "")} onClick={() => patchImage((el) => ({ ...el, shadow: i0.shadow > 0 ? 0 : 14 }))} title="Ombre dure">
            Ombre
          </button>
          <button
            className="ic-btn"
            onClick={() => patchImage((el) => ({ ...el, fit: i0.fit === "cover" ? "contain" : "cover" }))}
            title="Remplir le cadre (l'image peut être coupée) ou la montrer en entier"
          >
            {i0.fit === "cover" ? "Remplit" : "Entière"}
          </button>
        </>
      )}

      {!allText && !allShape && !allImage && <span className="px-2 text-[13px] font-extrabold text-muted">{els.length} éléments</span>}

      <Sep />
      {els.length > 1 && !grouped && (
        <IconBtn title="Grouper (Ctrl+G) : les éléments bougent ensemble" onClick={() => st().group(ids)}>
          <Group size={18} strokeWidth={2.6} />
        </IconBtn>
      )}
      {grouped && (
        <IconBtn title="Dégrouper (Ctrl+Maj+G)" onClick={() => st().ungroup(ids)}>
          <Ungroup size={18} strokeWidth={2.6} />
        </IconBtn>
      )}
      <IconBtn title="Dupliquer (Ctrl+D)" onClick={() => st().duplicateEls(ids)}>
        <Copy size={18} strokeWidth={2.6} />
      </IconBtn>
      <IconBtn title="Supprimer (Suppr)" danger onClick={() => st().removeEls(ids)}>
        <Trash2 size={18} strokeWidth={2.6} />
      </IconBtn>
      <Popover
        align="right"
        width={268}
        button={({ open, toggle }) => (
          <button className={"ic-btn " + (open ? "on" : "")} onMouseDown={(e) => e.preventDefault()} onClick={toggle} title="Plus d'options" aria-label="Plus d'options">
            <MoreHorizontal size={19} strokeWidth={2.8} />
          </button>
        )}
      >
        {(close) => (
          <div className="flex flex-col">
            <MenuItem icon={<ArrowUpToLine size={16} />} label="Mettre au premier plan" onClick={() => st().reorder(ids, "front")} />
            <MenuItem icon={<ChevronUp size={16} />} label="Avancer d'un cran" onClick={() => st().reorder(ids, "forward")} />
            <MenuItem icon={<ChevronDown size={16} />} label="Reculer d'un cran" onClick={() => st().reorder(ids, "backward")} />
            <MenuItem icon={<ArrowDownToLine size={16} />} label="Mettre à l'arrière-plan" onClick={() => st().reorder(ids, "back")} />
            <div className="my-1.5 h-[2px] bg-line" />
            <MenuItem icon={<AlignHorizontalJustifyCenter size={16} />} label="Centrer dans la largeur" onClick={() => st().align(ids, "center")} />
            <MenuItem icon={<AlignVerticalJustifyCenter size={16} />} label="Centrer dans la hauteur" onClick={() => st().align(ids, "middle")} />
            <div className="my-1.5 h-[2px] bg-line" />
            <MenuItem icon={<Pin size={16} />} label="Reprendre sur les nouvelles diapos" on={kept} onClick={() => st().updateEls(ids, (el: El) => ({ ...el, keep: !kept }))} />
            <div className="flex items-center gap-2.5 px-2.5 py-2 text-[14px] font-bold">
              Opacité
              <input
                type="range"
                min={10}
                max={100}
                step={5}
                className="flex-1 accent-[#111]"
                value={Math.round((first.opacity ?? 1) * 100)}
                onChange={(e) => st().updateEls(ids, (el: El) => ({ ...el, opacity: Number(e.target.value) / 100 }), { coalesce: "opacity" })}
              />
            </div>
            {isStaff && (
              <>
                <div className="my-1.5 h-[2px] bg-line" />
                <MenuItem
                  icon={<BookmarkPlus size={16} />}
                  label="Ajouter à la bibliothèque (staff)"
                  onClick={() => {
                    close();
                    onSaveToLibrary();
                  }}
                />
              </>
            )}
          </div>
        )}
      </Popover>
    </div>
  );
}
