"use client";

import { useEffect, useRef, useState } from "react";
import { Copy, Plus, Trash2 } from "lucide-react";
import { SlideThumb } from "@/components/slide/SlideView";
import { useEditor } from "@/lib/editor/store";

const THUMB_W = 132;

export function SlidesPanel() {
  const slides = useEditor((s) => s.slides);
  const current = useEditor((s) => s.current);
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [dropAt, setDropAt] = useState<number | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // La diapo active reste visible dans la liste.
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-slide-index="${current}"]`)?.scrollIntoView({ block: "nearest" });
  }, [current, slides.length]);

  const st = () => useEditor.getState();

  return (
    <aside className="nb flex h-full w-[212px] flex-none flex-col overflow-hidden" data-testid="slides-panel">
      <div className="flex items-baseline justify-between px-4 pb-2 pt-4">
        <h2 className="display text-[21px]">Diapos</h2>
        <span className="text-[13px] font-bold text-muted">
          {slides.length} diapo{slides.length > 1 ? "s" : ""}
        </span>
      </div>
      <div ref={listRef} className="scroll-thin flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-3 pb-3 pt-1">
        {slides.map((slide, i) => (
          <div
            key={slide.id}
            data-slide-index={i}
            className={"group relative flex items-start gap-2 rounded-[12px] " + (dropAt === i && dragFrom !== null && dragFrom !== i ? "outline-dashed outline-[3px] outline-blue" : "")}
            draggable
            onDragStart={(e) => {
              setDragFrom(i);
              e.dataTransfer.effectAllowed = "move";
              e.dataTransfer.setData("application/x-ms-slide", String(i));
            }}
            onDragOver={(e) => {
              if (dragFrom === null) return;
              e.preventDefault();
              if (dropAt !== i) setDropAt(i);
            }}
            onDrop={(e) => {
              e.preventDefault();
              if (dragFrom !== null) st().moveSlide(dragFrom, i);
              setDragFrom(null);
              setDropAt(null);
            }}
            onDragEnd={() => {
              setDragFrom(null);
              setDropAt(null);
            }}
          >
            <span className="w-4 pt-1 text-right text-[13px] font-extrabold tabular-nums">{i + 1}</span>
            <button
              className={
                "overflow-hidden rounded-[10px] border-[3px] border-ink bg-white transition-shadow " +
                (i === current ? "shadow-[3px_4px_0_var(--coral)]" : "opacity-90 hover:opacity-100 hover:shadow-[2px_3px_0_#111]")
              }
              onClick={() => st().goTo(i)}
              aria-label={`Diapo ${i + 1}`}
              aria-current={i === current}
            >
              <SlideThumb slide={slide} width={THUMB_W} />
            </button>
            <div className="absolute right-1 top-1 hidden flex-col gap-1 group-hover:flex">
              <button className="flex h-6 w-6 items-center justify-center rounded-md border-2 border-ink bg-white hover:bg-sun" title="Dupliquer la diapo" onClick={() => st().duplicateSlide(i)}>
                <Copy size={12} strokeWidth={3} />
              </button>
              <button className="flex h-6 w-6 items-center justify-center rounded-md border-2 border-ink bg-white hover:bg-coral" title="Supprimer la diapo" onClick={() => st().deleteSlide(i)}>
                <Trash2 size={12} strokeWidth={3} />
              </button>
            </div>
          </div>
        ))}
      </div>
      <div className="p-3 pt-1">
        <button
          className="flex w-full items-center justify-center gap-2 rounded-[14px] border-[2.5px] border-dashed border-ink bg-white py-2.5 text-[15px] font-extrabold transition-colors hover:bg-sun"
          onClick={() => st().addSlide()}
          data-testid="add-slide"
        >
          <Plus size={18} strokeWidth={3} />
          Nouvelle diapo
        </button>
      </div>
    </aside>
  );
}
