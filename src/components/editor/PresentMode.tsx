"use client";

import { useCallback, useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { SlideContent } from "@/components/slide/SlideView";
import { SLIDE_H, SLIDE_W, type Slide } from "@/lib/types";

/** Mode présentation : plein écran, navigation au clavier, à la souris ou au doigt. */
export function PresentMode({ slides, start, onExit }: { slides: Slide[]; start: number; onExit: (index: number) => void }) {
  const [index, setIndex] = useState(start);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [idle, setIdle] = useState(false);

  const go = useCallback((delta: number) => setIndex((i) => Math.min(slides.length - 1, Math.max(0, i + delta))), [slides.length]);

  useEffect(() => {
    const measure = () => setSize({ w: window.innerWidth, h: window.innerHeight });
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (["ArrowRight", "ArrowDown", "PageDown", " ", "Enter"].includes(e.key)) {
        e.preventDefault();
        go(1);
      } else if (["ArrowLeft", "ArrowUp", "PageUp", "Backspace"].includes(e.key)) {
        e.preventDefault();
        go(-1);
      } else if (e.key === "Home") {
        setIndex(0);
      } else if (e.key === "End") {
        setIndex(slides.length - 1);
      } else if (e.key === "Escape") {
        onExit(index);
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [go, index, onExit, slides.length]);

  // Sortir du plein écran (touche Échap du navigateur) quitte aussi la présentation.
  useEffect(() => {
    let wasFullscreen = !!document.fullscreenElement;
    const onChange = () => {
      if (wasFullscreen && !document.fullscreenElement) onExit(index);
      wasFullscreen = !!document.fullscreenElement;
    };
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, [index, onExit]);

  // Les commandes s'effacent quand la souris ne bouge plus.
  useEffect(() => {
    let timer = setTimeout(() => setIdle(true), 2200);
    const wake = () => {
      setIdle(false);
      clearTimeout(timer);
      timer = setTimeout(() => setIdle(true), 2200);
    };
    window.addEventListener("pointermove", wake);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("pointermove", wake);
    };
  }, []);

  const scale = Math.min(size.w / SLIDE_W, size.h / SLIDE_H) || 0.1;
  const slide = slides[index];

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-black"
      style={{ cursor: idle ? "none" : "default" }}
      data-testid="present"
      onClick={(e) => {
        // Moitié droite : diapo suivante ; moitié gauche : précédente.
        go(e.clientX < window.innerWidth * 0.3 ? -1 : 1);
      }}
    >
      <div style={{ width: SLIDE_W * scale, height: SLIDE_H * scale, overflow: "hidden" }}>
        <div style={{ transform: `scale(${scale})`, transformOrigin: "0 0", width: SLIDE_W, height: SLIDE_H }}>{slide && <SlideContent slide={slide} />}</div>
      </div>
      <div
        className={"absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-full bg-white/95 px-2 py-1.5 shadow-lg transition-opacity " + (idle ? "opacity-0" : "opacity-100")}
        onClick={(e) => e.stopPropagation()}
      >
        <button className="ic-btn" onClick={() => go(-1)} disabled={index === 0} aria-label="Diapo précédente">
          <ChevronLeft size={20} strokeWidth={3} />
        </button>
        <span className="min-w-[64px] text-center text-[14px] font-extrabold tabular-nums" data-testid="present-count">
          {index + 1} / {slides.length}
        </span>
        <button className="ic-btn" onClick={() => go(1)} disabled={index === slides.length - 1} aria-label="Diapo suivante">
          <ChevronRight size={20} strokeWidth={3} />
        </button>
        <button className="ic-btn" onClick={() => onExit(index)} aria-label="Quitter la présentation" title="Quitter (Échap)">
          <X size={19} strokeWidth={3} />
        </button>
      </div>
    </div>
  );
}
