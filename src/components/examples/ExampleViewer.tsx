"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Download, Loader2, Maximize, Minimize, X } from "lucide-react";
import { useApp } from "@/lib/app";
import { downloadExample } from "@/lib/examples";
import type { Example } from "@/lib/types";

export const pagesLabel = (n: number) => `${n} page${n > 1 ? "s" : ""}`;

/** Visionneuse d'un exemple : une page à la fois, miniatures, plein écran, téléchargement en PDF. */
export function ExampleViewer({ example, onClose, start = 0 }: { example: Example; onClose: () => void; start?: number }) {
  const { toast } = useApp();
  const rootRef = useRef<HTMLDivElement>(null);
  const stripRef = useRef<HTMLDivElement>(null);
  const swipe = useRef<number | null>(null);
  const [index, setIndex] = useState(Math.min(start, example.pages.length - 1));
  const [loaded, setLoaded] = useState<Record<number, boolean>>({});
  const [fullscreen, setFullscreen] = useState(false);
  const [downloading, setDownloading] = useState<string | null>(null);
  const total = example.pages.length;
  const page = example.pages[index];

  const go = useCallback((delta: number) => setIndex((i) => Math.min(total - 1, Math.max(0, i + delta))), [total]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const key = e.key;
      if (["ArrowRight", "ArrowDown", "PageDown", " "].includes(key)) go(1);
      else if (["ArrowLeft", "ArrowUp", "PageUp"].includes(key)) go(-1);
      else if (key === "Home") setIndex(0);
      else if (key === "End") setIndex(total - 1);
      else if (key === "Escape" && !document.fullscreenElement) onClose();
      else return;
      e.preventDefault();
      // La visionneuse a la main : l'éditeur ou la fenêtre en dessous ne réagissent pas.
      e.stopImmediatePropagation();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [go, onClose, total]);

  useEffect(() => {
    const root = rootRef.current;
    const onChange = () => setFullscreen(!!root && document.fullscreenElement === root);
    document.addEventListener("fullscreenchange", onChange);
    return () => {
      document.removeEventListener("fullscreenchange", onChange);
      if (root && document.fullscreenElement === root) document.exitFullscreen?.().catch(() => undefined);
    };
  }, []);

  // Les pages voisines se chargent à l'avance ; la miniature courante reste visible.
  useEffect(() => {
    for (const i of [index + 1, index - 1, index + 2]) {
      const p = example.pages[i];
      if (p) new Image().src = p.url;
    }
    stripRef.current?.querySelector<HTMLElement>(`[data-page="${index}"]`)?.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" });
  }, [index, example.pages]);

  const toggleFullscreen = () => {
    if (document.fullscreenElement) document.exitFullscreen?.().catch(() => undefined);
    else rootRef.current?.requestFullscreen?.().catch(() => undefined);
  };

  const download = async () => {
    setDownloading(example.pdfUrl ? "Téléchargement…" : "Préparation du PDF…");
    try {
      await downloadExample(example, (done, n) => setDownloading(`Préparation du PDF… ${done}/${n}`));
    } catch (e) {
      toast(e instanceof Error ? e.message : "Téléchargement impossible", "error");
    } finally {
      setDownloading(null);
    }
  };

  return (
    <div
      ref={rootRef}
      className={"fixed inset-0 z-[85] flex flex-col " + (fullscreen ? "bg-black" : "gap-3 bg-[#1b1710]/[.97] p-4")}
      role="dialog"
      aria-modal="true"
      aria-label={`Exemple : ${example.title}`}
      data-testid="example-viewer"
    >
      {!fullscreen && (
        <header className="flex flex-none items-center gap-4 rounded-[18px] border-[3px] border-ink bg-white px-4 py-2.5 shadow-[4px_5px_0_#000]">
          <div className="min-w-0 flex-1">
            <h2 className="display truncate text-[22px]">{example.title}</h2>
            <p className="truncate text-[13px] font-bold text-muted">
              {[example.author && `Présenté par ${example.author}`, pagesLabel(total), example.description].filter(Boolean).join(" · ")}
            </p>
          </div>
          <button className="nb-btn sm" onClick={download} disabled={!!downloading} data-testid="example-download">
            {downloading ? <Loader2 size={15} className="spin" /> : <Download size={15} strokeWidth={2.8} />}
            {downloading ?? "Télécharger en PDF"}
          </button>
          <button className="nb-btn sm" onClick={toggleFullscreen} title="Plein écran">
            <Maximize size={15} strokeWidth={2.8} />
            Plein écran
          </button>
          <button className="ic-btn" onClick={onClose} aria-label="Fermer" title="Fermer (Échap)" data-testid="example-close">
            <X size={22} strokeWidth={2.8} />
          </button>
        </header>
      )}

      <div
        className="relative flex min-h-0 flex-1 items-center justify-center"
        onPointerDown={(e) => (swipe.current = e.clientX)}
        onPointerUp={(e) => {
          const start = swipe.current;
          swipe.current = null;
          if (start !== null && Math.abs(e.clientX - start) > 60) go(e.clientX < start ? 1 : -1);
        }}
      >
        <button
          className="absolute left-1 z-10 flex h-14 w-14 items-center justify-center rounded-full border-[3px] border-ink bg-white shadow-[3px_3px_0_#000] transition-opacity hover:bg-sun disabled:opacity-0"
          onClick={() => go(-1)}
          disabled={index === 0}
          aria-label="Page précédente"
        >
          <ChevronLeft size={28} strokeWidth={3} />
        </button>
        <div
          className={"relative max-h-full max-w-full overflow-hidden " + (fullscreen ? "" : "rounded-[10px] border-[3px] border-ink shadow-[5px_6px_0_#000]")}
          style={{
            aspectRatio: `${page.w} / ${page.h}`,
            height: fullscreen ? "100%" : `min(100%, calc((100vw - 200px) * ${page.h / page.w}))`,
            background: `#fff url("${page.thumb}") center / cover no-repeat`,
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            key={page.url}
            src={page.url}
            alt={`Page ${index + 1} sur ${total}`}
            className={"block h-full w-full object-contain transition-opacity duration-200 " + (loaded[index] ? "opacity-100" : "opacity-0")}
            onLoad={() => setLoaded((l) => ({ ...l, [index]: true }))}
            draggable={false}
            data-testid="example-page"
          />
        </div>
        <button
          className="absolute right-1 z-10 flex h-14 w-14 items-center justify-center rounded-full border-[3px] border-ink bg-white shadow-[3px_3px_0_#000] transition-opacity hover:bg-sun disabled:opacity-0"
          onClick={() => go(1)}
          disabled={index === total - 1}
          aria-label="Page suivante"
        >
          <ChevronRight size={28} strokeWidth={3} />
        </button>
        {fullscreen && (
          <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-2 rounded-full bg-white/95 px-3 py-1.5 text-[14px] font-extrabold">
            {index + 1} / {total}
            <button className="ic-btn" onClick={toggleFullscreen} aria-label="Quitter le plein écran">
              <Minimize size={17} strokeWidth={2.8} />
            </button>
          </div>
        )}
      </div>

      {!fullscreen && (
        <footer className="flex flex-none items-center gap-3">
          <div ref={stripRef} className="scroll-thin flex min-w-0 flex-1 gap-2.5 overflow-x-auto px-1 pb-2 pt-1" data-testid="example-strip">
            {example.pages.map((p, i) => (
              <button
                key={p.thumb + i}
                data-page={i}
                className={
                  "flex-none overflow-hidden rounded-[7px] border-[2.5px] transition-transform " +
                  (i === index ? "-translate-y-0.5 border-sun shadow-[0_0_0_3px_#ffcc55]" : "border-ink/70 opacity-75 hover:opacity-100")
                }
                style={{ height: 66, aspectRatio: `${p.w} / ${p.h}` }}
                onClick={() => setIndex(i)}
                aria-label={`Page ${i + 1}`}
                aria-current={i === index}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.thumb} alt="" loading="lazy" className="block h-full w-full object-cover" draggable={false} />
              </button>
            ))}
          </div>
          <span className="flex-none rounded-full border-[2.5px] border-ink bg-white px-3.5 py-1.5 text-[14px] font-extrabold tabular-nums" data-testid="example-count">
            {index + 1} / {total}
          </span>
        </footer>
      )}
    </div>
  );
}
