import { describe, expect, it } from "vitest";
import { GAP, MARGIN, padBox, placeBubble } from "@/lib/tour-layout";
import { STEPS, tourStepIds } from "@/lib/tour";

const viewport = { w: 1440, h: 900 };
const bubble = { w: 368, h: 230 };

describe("placeBubble", () => {
  it("pose la bulle sous l'élément quand il y a la place, flèche pointée sur son centre", () => {
    const p = placeBubble({ x: 600, y: 100, w: 200, h: 60 }, bubble, viewport, "bottom");
    expect(p.side).toBe("bottom");
    expect(p.y).toBe(100 + 60 + GAP);
    expect(p.x + p.arrow).toBe(700);
  });

  it("passe au côté opposé quand la place manque", () => {
    const p = placeBubble({ x: 600, y: 760, w: 200, h: 60 }, bubble, viewport, "bottom");
    expect(p.side).toBe("top");
    expect(p.y + bubble.h + GAP).toBe(760);
  });

  it("reste dans la fenêtre près d'un bord", () => {
    const p = placeBubble({ x: 1380, y: 40, w: 50, h: 40 }, bubble, viewport, "bottom");
    expect(p.x).toBe(viewport.w - MARGIN - bubble.w);
    expect(p.arrow).toBeLessThanOrEqual(bubble.w - 26);
  });

  it("à gauche ou à droite pour un panneau latéral", () => {
    const right = placeBubble({ x: 14, y: 110, w: 212, h: 760 }, bubble, viewport, "right");
    expect(right.side).toBe("right");
    expect(right.x).toBe(14 + 212 + GAP);
    const left = placeBubble({ x: 1300, y: 500, w: 130, h: 50 }, bubble, viewport, "left");
    expect(left.side).toBe("left");
    expect(left.x + bubble.w + GAP).toBe(1300);
  });

  it("se pose sur un élément qui occupe tout l'écran, sans flèche", () => {
    const p = placeBubble({ x: 4, y: 4, w: 1432, h: 892 }, bubble, viewport, "bottom");
    expect(p.side).toBe("center");
    expect(p.x).toBeGreaterThanOrEqual(MARGIN);
    expect(p.y + bubble.h).toBeLessThanOrEqual(viewport.h - MARGIN);
  });

  it("se centre quand il n'y a rien à montrer", () => {
    expect(placeBubble(null, bubble, viewport)).toEqual({ x: (1440 - 368) / 2, y: (900 - 230) / 2, side: "center", arrow: 0 });
  });
});

describe("padBox", () => {
  it("élargit sans sortir de la fenêtre", () => {
    expect(padBox({ x: 100, y: 100, w: 50, h: 50 }, 8, viewport)).toEqual({ x: 92, y: 92, w: 66, h: 66 });
    expect(padBox({ x: 0, y: 0, w: 1440, h: 900 }, 8, viewport)).toEqual({ x: 4, y: 4, w: 1432, h: 892 });
  });
});

describe("étapes de la visite", () => {
  it("va de l'accueil à l'éditeur et finit sur le bouton Aide", () => {
    const ids = tourStepIds("full", { name: "Clément", isStaff: false });
    const pages = ids.map((id) => STEPS.find((s) => s.id === id)!.page);
    expect(ids[0]).toBe("welcome");
    expect(ids.at(-1)).toBe("help");
    expect(STEPS.find((s) => s.id === "help")!.target).toBe('[data-testid="open-help"]');
    // Toutes les étapes de l'accueil d'abord, puis toutes celles de l'éditeur.
    expect(pages.indexOf("editor")).toBe(pages.lastIndexOf("home") + 1);
  });

  it("ne montre le panel admin qu'au staff", () => {
    expect(tourStepIds("full", { name: "", isStaff: false })).not.toContain("admin");
    expect(tourStepIds("full", { name: "", isStaff: true })).toContain("admin");
  });

  it("depuis l'aide, ne rejoue que l'éditeur", () => {
    const ids = tourStepIds("editor", { name: "", isStaff: true });
    expect(ids[0]).toBe("slides");
    expect(ids.every((id) => STEPS.find((s) => s.id === id)!.page === "editor")).toBe(true);
  });

  it("l'étape qui mène à l'éditeur est la dernière de l'accueil", () => {
    const ids = tourStepIds("full", { name: "", isStaff: true });
    const i = ids.indexOf("open-editor");
    expect(STEPS.find((s) => s.id === ids[i + 1])!.page).toBe("editor");
  });

  it("salue par le prénom, pas par un nom générique", () => {
    const welcome = STEPS[0];
    expect(welcome.title({ name: "Clément Dupont", isStaff: false })).toBe("Bienvenue, Clément !");
    expect(welcome.title({ name: "Invité", isStaff: false })).toBe("Bienvenue sur MS Diapos !");
    expect(welcome.title({ name: "Mode démo", isStaff: false })).toBe("Bienvenue sur MS Diapos !");
  });
});
