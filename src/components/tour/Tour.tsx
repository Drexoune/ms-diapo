"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import { ArrowLeft, ArrowRight, X } from "lucide-react";
import { useApp } from "@/lib/app";
import { data } from "@/lib/backend";
import { stepById, useTour, type TourPage } from "@/lib/tour";
import { padBox, placeBubble, type Box, type Placement } from "@/lib/tour-layout";

const BUBBLE_W = 368;
/** Délai d'attente d'un élément qui n'est pas encore affiché (éditeur en cours de chargement). */
const WAIT_MS = 1500;

interface Layout {
  stepId: string;
  hole: Box | null;
  place: Placement;
  waiting: boolean;
}

const subscribeNothing = () => () => undefined;

function pageOf(pathname: string): TourPage | null {
  if (pathname === "/") return "home";
  if (/^\/(editor|modele)\//.test(pathname)) return "editor";
  return null;
}

/**
 * Visite guidée : assombrit l'écran, éclaire l'élément présenté, et pose à
 * côté une bulle annotée. Montée une seule fois, au-dessus de toutes les
 * pages : elle suit la personne de l'accueil à l'éditeur.
 */
export function Tour() {
  const { profile, loading } = useApp();
  const pathname = usePathname();
  const steps = useTour((s) => s.steps);
  const index = useTour((s) => s.index);
  // Rien côté serveur : la visite n'existe que dans le navigateur.
  const isClient = useSyncExternalStore(
    subscribeNothing,
    () => true,
    () => false,
  );
  const bubbleRef = useRef<HTMLDivElement>(null);
  const primaryRef = useRef<HTMLButtonElement>(null);
  const [layout, setLayout] = useState<Layout | null>(null);

  const page = pageOf(pathname);
  const step = stepById(steps?.[index]);
  const active = isClient && !!profile && !!step && step.page === page;
  const ctx = { name: profile?.name ?? "", isStaff: !!profile?.isStaff };

  const finish = useCallback(() => {
    useTour.getState().stop();
    data.markOnboarded().catch(() => undefined);
  }, []);

  // Déconnexion : la visite s'arrête.
  useEffect(() => {
    if (!loading && !profile && steps) useTour.getState().stop();
  }, [loading, profile, steps]);

  // L'étape « ouvre l'éditeur » se termine dès que l'éditeur est ouvert, quel que soit le chemin pris.
  useEffect(() => {
    if (step?.opensEditor && page === "editor") useTour.getState().next();
  }, [step, page]);

  // Suivi de l'élément présenté : il peut bouger (défilement, chargement, barre d'outils qui apparaît).
  useEffect(() => {
    if (!active || !step) return;
    step.enter?.();
    const t0 = performance.now();
    let raf = 0;
    let scrolled = false;
    let last = "";
    const tick = () => {
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const el = step.target ? document.querySelector<HTMLElement>(step.target) : null;
      let hole: Box | null = null;
      if (el) {
        let r = el.getBoundingClientRect();
        if (!scrolled && r.height > 0) {
          scrolled = true;
          if (r.top < 0 || r.bottom > vh) {
            el.scrollIntoView({ block: r.height > vh * 0.8 ? "start" : "center" });
            r = el.getBoundingClientRect();
          }
        }
        if (r.width > 0 && r.height > 0) hole = padBox({ x: r.left, y: r.top, w: r.width, h: r.height }, 8, { w: vw, h: vh });
      }
      const waiting = !!step.target && !hole && performance.now() - t0 < WAIT_MS;
      const b = bubbleRef.current;
      const place = placeBubble(hole, { w: b?.offsetWidth || BUBBLE_W, h: b?.offsetHeight || 230 }, { w: vw, h: vh }, step.side);
      const round = (n: number) => Math.round(n);
      const key = [hole && [hole.x, hole.y, hole.w, hole.h].map(round), round(place.x), round(place.y), place.side, round(place.arrow), waiting].join("|");
      if (key !== last) {
        last = key;
        setLayout({ stepId: step.id, hole, place, waiting });
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      step.leave?.();
    };
  }, [active, step]);

  const current = active && layout?.stepId === step?.id ? layout : null;
  const ready = !!current && !current.waiting;

  // Le bouton principal prend le focus : Entrée fait avancer.
  useEffect(() => {
    if (ready) primaryRef.current?.focus({ preventScroll: true });
  }, [ready, step]);

  const primary = useCallback(() => {
    if (!step) return;
    if (step.opensEditor) {
      document.querySelector<HTMLElement>(step.opensEditor.click)?.click();
      return;
    }
    const { steps: list, index: i } = useTour.getState();
    if (list && i >= list.length - 1) finish();
    else useTour.getState().next();
  }, [step, finish]);

  // Clavier : la visite a la main tant qu'elle est affichée.
  useEffect(() => {
    if (!active || !step) return;
    const onKey = (e: KeyboardEvent) => {
      const inBubble = !!bubbleRef.current?.contains(e.target as Node);
      if (e.key === "Escape") finish();
      else if (e.key === "ArrowRight" && !step.opensEditor) primary();
      else if (e.key === "ArrowLeft") useTour.getState().prev();
      else if (e.key === "Enter" && !inBubble) primary();
      else if (inBubble && ["Tab", "Enter", " "].includes(e.key)) return;
      e.preventDefault();
      e.stopImmediatePropagation();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [active, step, primary, finish]);

  if (!active || !step || !steps) return null;

  const hole = current?.hole ?? null;
  const place = current?.place;
  const total = steps.length;
  const last = index === total - 1;
  const vw = typeof window !== "undefined" ? window.innerWidth : 0;
  const vh = typeof window !== "undefined" ? window.innerHeight : 0;
  const block = "pointer-events-auto fixed bg-transparent";
  const nextLabel = step.opensEditor?.label ?? step.next ?? (last ? "Terminer" : "Suivant");

  return (
    <div className="tour pointer-events-none fixed inset-0 z-[110]" data-testid="tour" data-step={step.id}>
      {/* Voile : un trou lumineux autour de l'élément, ou un voile plein quand il n'y a rien à montrer. */}
      {hole ? (
        <div
          className="tour-hole pointer-events-none fixed rounded-[18px]"
          style={{ left: hole.x, top: hole.y, width: hole.w, height: hole.h }}
          data-testid="tour-hole"
        />
      ) : (
        <div className="pointer-events-none fixed inset-0 bg-[rgba(20,16,8,.62)]" />
      )}

      {/* Les clics hors de l'élément sont bloqués ; sur l'élément, seulement quand l'étape le demande. */}
      {hole ? (
        <>
          <div className={block} style={{ left: 0, top: 0, width: vw, height: hole.y }} />
          <div className={block} style={{ left: 0, top: hole.y + hole.h, width: vw, height: Math.max(0, vh - hole.y - hole.h) }} />
          <div className={block} style={{ left: 0, top: hole.y, width: hole.x, height: hole.h }} />
          <div className={block} style={{ left: hole.x + hole.w, top: hole.y, width: Math.max(0, vw - hole.x - hole.w), height: hole.h }} />
          {!step.interactive && <div className={block} style={{ left: hole.x, top: hole.y, width: hole.w, height: hole.h }} />}
          <span
            className="tour-badge pointer-events-none fixed flex h-[34px] w-[34px] items-center justify-center rounded-full border-[3px] border-ink bg-coral text-[15px] font-black"
            style={{ left: Math.max(6, hole.x - 14), top: Math.max(6, hole.y - 14) }}
            aria-hidden="true"
          >
            {index + 1}
          </span>
        </>
      ) : (
        <div className={block + " inset-0"} />
      )}

      {/* La bulle n'apparaît qu'une fois l'élément trouvé (ou l'attente terminée). */}
      <div
        ref={bubbleRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="tour-title"
        aria-describedby="tour-body"
        className="tour-bubble nb fixed !rounded-[20px] bg-white p-[18px]"
        style={{ left: place?.x ?? -9999, top: place?.y ?? 0, width: Math.min(BUBBLE_W, vw - 24), opacity: ready ? 1 : 0, pointerEvents: ready ? "auto" : "none" }}
        data-testid="tour-bubble"
      >
        {place && place.side !== "center" && (
          <span
            className={"tour-arrow absolute h-4 w-4 rotate-45 border-ink bg-white " + `tour-arrow-${place.side}`}
            style={place.side === "top" || place.side === "bottom" ? { left: place.arrow - 8 } : { top: place.arrow - 8 }}
            aria-hidden="true"
          />
        )}
        <div className="mb-2 flex items-center justify-between gap-3">
          <span className="rounded-full border-2 border-ink bg-sun px-2.5 py-0.5 text-[12px] font-extrabold" data-testid="tour-count">
            Étape {index + 1} sur {total}
          </span>
          <button className="flex items-center gap-1 rounded-lg px-1.5 py-0.5 text-[13px] font-bold text-muted hover:bg-[#fff1cf] hover:text-ink" onClick={finish} data-testid="tour-skip">
            Passer la visite
            <X size={14} strokeWidth={3} />
          </button>
        </div>
        <h2 id="tour-title" className="display mb-1.5 text-[21px] leading-[1.05]">
          {step.title(ctx)}
        </h2>
        <p id="tour-body" className="text-[15px] font-semibold leading-snug">
          {step.body}
        </p>
        <div className="mt-3.5 h-1.5 overflow-hidden rounded-full bg-[#f1e6cc]" aria-hidden="true">
          <div className="h-full rounded-full bg-ink transition-[width]" style={{ width: `${((index + 1) / total) * 100}%` }} />
        </div>
        <div className="mt-3.5 flex items-center justify-between gap-2">
          <button className="nb-btn sm" onClick={() => useTour.getState().prev()} disabled={index === 0} data-testid="tour-prev">
            <ArrowLeft size={15} strokeWidth={3} />
            Précédent
          </button>
          <button ref={primaryRef} className="nb-btn sun" onClick={primary} data-testid="tour-next">
            {nextLabel}
            {!last && <ArrowRight size={16} strokeWidth={3} />}
          </button>
        </div>
      </div>
    </div>
  );
}
