import { describe, expect, it } from "vitest";
import { HANDLES, applyMeasure, bbox, corners, resizeRect, rotate, scaleEl, snapAngle, snapLines, snapMove, union, upgradeEls, type RotRect } from "@/lib/geometry";
import { makeShape, makeText } from "@/lib/factory";

const close = (a: number, b: number) => expect(Math.abs(a - b)).toBeLessThan(1e-6);

describe("resizeRect", () => {
  it("agrandit par le coin bas-droit sans bouger le coin haut-gauche", () => {
    const r = resizeRect({ x: 100, y: 100, w: 200, h: 100, rot: 0 }, HANDLES.se, { x: 50, y: 20 });
    expect(r).toMatchObject({ x: 100, y: 100, w: 250, h: 120 });
  });

  it("agrandit par le coin haut-gauche sans bouger le coin bas-droit", () => {
    const r = resizeRect({ x: 100, y: 100, w: 200, h: 100, rot: 0 }, HANDLES.nw, { x: -40, y: -10 });
    expect(r).toMatchObject({ x: 60, y: 90, w: 240, h: 110 });
  });

  // Propriété essentielle : quelle que soit la rotation, le coin opposé à la poignée reste fixe à l'écran.
  it.each([0, 30, 90, 137, -45])("garde le coin opposé fixe à %s°", (rot) => {
    const start: RotRect = { x: 300, y: 200, w: 400, h: 180, rot };
    const before = corners(start);
    for (const [name, opposite] of [
      ["se", 0],
      ["sw", 1],
      ["nw", 2],
      ["ne", 3],
    ] as const) {
      const after = corners(resizeRect(start, HANDLES[name], rotate({ x: 70, y: -35 }, rot)));
      close(after[opposite].x, before[opposite].x);
      close(after[opposite].y, before[opposite].y);
    }
  });

  it("garde les proportions quand on le demande", () => {
    const r = resizeRect({ x: 0, y: 0, w: 400, h: 200, rot: 0 }, HANDLES.se, { x: 100, y: 0 }, { keepRatio: true });
    close(r.w / r.h, 2);
    expect(r.w).toBe(500);
  });

  it("respecte la taille minimale", () => {
    const r = resizeRect({ x: 0, y: 0, w: 100, h: 100, rot: 0 }, HANDLES.se, { x: -500, y: -500 }, { minW: 20, minH: 30 });
    expect(r.w).toBe(20);
    expect(r.h).toBe(30);
  });
});

describe("bbox et union", () => {
  it("la boîte d'un rectangle tourné de 90° échange largeur et hauteur", () => {
    const b = bbox({ x: 0, y: 0, w: 200, h: 100, rot: 90 });
    close(b.w, 100);
    close(b.h, 200);
    close(b.x, 50);
    close(b.y, -50);
  });

  it("union englobe tout", () => {
    expect(union([{ x: 0, y: 0, w: 10, h: 10 }, { x: 50, y: 20, w: 10, h: 10 }])).toEqual({ x: 0, y: 0, w: 60, h: 30 });
    expect(union([])).toBeNull();
  });
});

describe("magnétisme", () => {
  const lines = snapLines(1920, 1080, [{ x: 100, y: 100, w: 200, h: 100 }]);

  it("centre un élément sur la diapo quand il en est proche", () => {
    const snap = snapMove({ x: 860 - 4, y: 400, w: 200, h: 100 }, lines, 7);
    expect(snap.dx).toBe(4);
    expect(snap.guides).toContainEqual({ axis: "x", pos: 960 });
  });

  it("aligne sur le bord d'un autre élément", () => {
    const snap = snapMove({ x: 303, y: 500, w: 80, h: 80 }, lines, 7);
    expect(snap.dx).toBe(-3);
  });

  it("ne bouge rien hors de portée", () => {
    const snap = snapMove({ x: 500, y: 333, w: 80, h: 80 }, lines, 7);
    expect(snap).toMatchObject({ dx: 0, dy: 0, guides: [] });
  });
});

describe("scaleEl", () => {
  it("met à l'échelle position, taille et épaisseurs autour du point fixe", () => {
    const el = makeShape("rect", { x: 100, y: 100, w: 200, h: 100, border: 8, shadow: 10, radius: 12 });
    const s = scaleEl(el, { x: 100, y: 100 }, 2);
    expect(s).toMatchObject({ x: 100, y: 100, w: 400, h: 200, border: 16, shadow: 20, radius: 24 });
  });

  it("garde un cercle rond et fait suivre la taille du texte", () => {
    const circle = scaleEl({ ...makeShape("rect"), radius: 9999 }, { x: 0, y: 0 }, 3);
    expect(circle.type === "shape" && circle.radius).toBe(9999);
    const text = scaleEl(makeText({ size: 100 }), { x: 0, y: 0 }, 0.5);
    expect(text.type === "text" && text.size).toBe(50);
  });
});

describe("snapAngle", () => {
  it("accroche près des angles droits et par pas avec Maj", () => {
    expect(snapAngle(88.5, null)).toBe(90);
    expect(snapAngle(47, null)).toBe(47);
    expect(snapAngle(52, 15)).toBe(45);
    expect(snapAngle(359, null)).toBe(0);
    expect(snapAngle(270, null)).toBe(-90);
  });
});

describe("applyMeasure : les éléments suivent leur texte", () => {
  const card = () => {
    const bg = { ...makeShape("rect", { x: 0, y: 0, w: 690, h: 290 }), id: "bg", group: "g" };
    const title = { ...makeText({ text: "Titre", x: 30, y: 24, w: 630, size: 56 }), id: "title", group: "g" };
    const body = { ...makeText({ text: "Texte", x: 30, y: 104, w: 630, size: 40 }), id: "body", group: "g" };
    const pill = { ...makeText({ text: "PDF", x: 530, y: 214, w: 130, size: 28 }), id: "pill", group: "g" };
    const other = { ...makeText({ text: "Ailleurs", x: 0, y: 400, w: 600, size: 40 }), id: "other" };
    return [bg, title, body, pill, other];
  };

  it("un texte qui grandit allonge le fond de sa carte et fait descendre ce qui est dessous", () => {
    const els = card();
    const body = els[2];
    const out = applyMeasure(els, "body", body.h + 80)!;
    const by = Object.fromEntries(out.map((e) => [e.id, e]));
    expect(by.body.h).toBe(body.h + 80);
    expect(by.bg.h).toBe(290 + 80);
    expect(by.pill.y).toBe(214 + 80);
    expect(by.title.y).toBe(24);
    // Hors du groupe : rien ne bouge.
    expect(by.other.y).toBe(400);
  });

  it("en raccourcissant le texte, on retrouve la mise en page d'origine", () => {
    const els = card();
    const h0 = els[2].h;
    const grown = applyMeasure(els, "body", h0 + 80)!;
    const back = applyMeasure(grown, "body", h0)!;
    expect(back).toEqual(els);
  });

  it("un écart d'arrondi ne déplace rien", () => {
    const els = card();
    const out = applyMeasure(els, "body", els[2].h + 1)!;
    expect(out.find((e) => e.id === "pill")!.y).toBe(214);
  });

  it("un texte à hauteur fixée grandit sans perdre sa hauteur minimale", () => {
    const el = { ...makeText({ text: "Badge", w: 263, size: 62, h: 80, fixedH: true }), id: "b" };
    const out = applyMeasure([el], "b", 150)![0];
    expect(out).toMatchObject({ h: 150, minH: 80 });
    const back = applyMeasure([out], "b", 80)![0];
    expect(back).toMatchObject({ h: 80, minH: 80 });
  });

  it("un texte qui suit son contenu s'élargit depuis son centre, et ne descend pas sous sa largeur d'origine", () => {
    const el = { ...makeText({ text: "Badge", x: 100, w: 263, size: 62, hug: true }), id: "b" };
    const wide = applyMeasure([el], "b", el.h, 463)![0];
    expect(wide).toMatchObject({ w: 463, x: 0, minW: 263 });
    const right = applyMeasure([{ ...el, align: "right" as const }], "b", el.h, 463)![0];
    expect(right.x).toBe(-100);
  });

  it("les badges déjà posés suivent désormais leur texte", () => {
    const old = { ...makeText({ text: "Badge", font: "etiquette", fill: "linear-gradient(red, blue)", size: 62, box: { fill: "#000", radius: 7, border: 0, borderColor: "#000", shadow: 0, padX: 0, padY: 0 } }), id: "b" };
    const [up] = upgradeEls([old]);
    expect(up).toMatchObject({ hug: true, box: { padX: 18 } });
    const plain = { ...makeText({ text: "Titre" }), id: "t" };
    const list = [plain];
    expect(upgradeEls(list)).toBe(list);
  });
});
