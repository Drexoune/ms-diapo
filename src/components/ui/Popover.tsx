"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * Petit menu flottant ancré sous son bouton. Le clic à l'intérieur ne
 * retire pas le focus du texte en cours d'édition (mousedown neutralisé),
 * ce qui permet de colorer une sélection de mots.
 */
export function Popover({
  button,
  children,
  align = "left",
  width,
}: {
  button: (props: { open: boolean; toggle: () => void }) => ReactNode;
  children: (close: () => void) => ReactNode;
  align?: "left" | "right" | "center";
  width?: number;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("pointerdown", onDown, true);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onDown, true);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      {button({ open, toggle: () => setOpen((o) => !o) })}
      {open && (
        <div
          className={
            "pop-in absolute top-[calc(100%+8px)] z-50 rounded-[16px] border-[2.5px] border-ink bg-white p-3 shadow-[3px_4px_0_#111] " +
            (align === "right" ? "right-0" : align === "center" ? "left-1/2 -translate-x-1/2" : "left-0")
          }
          style={{ width }}
          onMouseDown={(e) => {
            // Garde le focus (et la sélection de texte) là où il est, sauf pour les champs de saisie.
            const tag = (e.target as HTMLElement).tagName;
            if (tag !== "INPUT" && tag !== "SELECT" && tag !== "TEXTAREA") e.preventDefault();
          }}
        >
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}
