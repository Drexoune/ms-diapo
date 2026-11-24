import { beforeEach, describe, expect, it } from "vitest";
import { blankSlide, currentSlide, setEditingReader, useEditor } from "@/lib/editor/store";
import { makeImage, makeShape, makeText } from "@/lib/factory";

const st = () => useEditor.getState();
const els = () => currentSlide(st()).els;

beforeEach(() => {
  st().load({ title: "Test", slides: [blankSlide()] });
});

describe("historique", () => {
  it("annule et rétablit un ajout", () => {
    st().addEls([makeShape("rect")]);
    expect(els()).toHaveLength(1);
    st().undo();
    expect(els()).toHaveLength(0);
    st().redo();
    expect(els()).toHaveLength(1);
  });

  it("un geste (glisser) ne crée qu'une entrée d'historique", () => {
    const el = makeShape("rect", { x: 0, y: 0 });
    st().addEls([el]);
    st().beginGesture();
    for (let i = 1; i <= 20; i++) st().updateEls([el.id], (e) => ({ ...e, x: i * 5 }), { history: false });
    st().endGesture();
    expect(els()[0].x).toBe(100);
    st().undo();
    expect(els()[0].x).toBe(0);
    st().undo();
    expect(els()).toHaveLength(0);
  });

  it("un geste sans changement ne laisse pas de trace", () => {
    const before = st().past.length;
    st().beginGesture();
    st().endGesture();
    expect(st().past.length).toBe(before);
  });

  it("une nouvelle action efface la pile « rétablir »", () => {
    st().addEls([makeShape("rect")]);
    st().undo();
    st().addEls([makeShape("ellipse")]);
    expect(st().future).toHaveLength(0);
  });

  it("marque le document à enregistrer, sauf pour une hauteur mesurée", () => {
    const text = makeText({ text: "a" });
    st().addEls([text]);
    const rev = st().revision;
    expect(st().saveState).toBe("dirty");
    st().setMeasured(text.id, 321);
    expect(st().revision).toBe(rev);
    expect(els()[0].h).toBe(321);
    const saving = st().markSaving();
    st().markSaved(saving);
    expect(st().saveState).toBe("saved");
  });
});

describe("sélection et groupes", () => {
  it("cliquer un membre d'un groupe sélectionne tout le groupe", () => {
    const a = makeShape("rect");
    const b = makeText({ text: "b" });
    const c = makeShape("ellipse");
    st().addEls([a, b, c]);
    st().group([a.id, b.id]);
    st().select([a.id]);
    expect(st().selection.sort()).toEqual([a.id, b.id].sort());
    st().ungroup([a.id, b.id]);
    st().select([a.id]);
    expect(st().selection).toEqual([a.id]);
  });

  it("dupliquer un groupe crée un groupe distinct", () => {
    const a = makeShape("rect");
    const b = makeShape("rect");
    st().addEls([a, b]);
    st().group([a.id, b.id]);
    st().duplicateEls([a.id, b.id]);
    const groups = new Set(els().map((e) => e.group));
    expect(els()).toHaveLength(4);
    expect(groups.size).toBe(2);
  });

  it("change l'ordre des calques", () => {
    const a = makeShape("rect");
    const b = makeShape("rect");
    const c = makeShape("rect");
    st().addEls([a, b, c]);
    st().reorder([a.id], "front");
    expect(els().map((e) => e.id)).toEqual([b.id, c.id, a.id]);
    st().reorder([a.id], "backward");
    expect(els().map((e) => e.id)).toEqual([b.id, a.id, c.id]);
    st().reorder([c.id], "back");
    expect(els().map((e) => e.id)).toEqual([c.id, b.id, a.id]);
  });

  it("centre une sélection sur la diapo", () => {
    const a = makeShape("rect", { x: 0, y: 0, w: 200, h: 100 });
    st().addEls([a]);
    st().align([a.id], "center");
    st().align([a.id], "middle");
    expect(els()[0]).toMatchObject({ x: 860, y: 490 });
  });
});

describe("diapos", () => {
  it("une nouvelle diapo reprend le fond et les éléments épinglés, pas le reste", () => {
    const logo = makeImage("/library/ms-logo.png", { width: 200, height: 175 }, { keep: true });
    st().setBackground({ kind: "color", color: "#123456" });
    st().addEls([logo, makeText({ text: "contenu" })]);
    st().addSlide();
    expect(st().current).toBe(1);
    expect(currentSlide(st()).bg).toEqual({ kind: "color", color: "#123456" });
    expect(els()).toHaveLength(1);
    expect(els()[0].id).not.toBe(logo.id);
    expect(els()[0]).toMatchObject({ type: "image", keep: true });
  });

  it("après une diapo d'ouverture dorée, la suite passe en crème", () => {
    st().setBackground({ kind: "image", src: "/library/fonds/or-croix.svg" });
    st().addSlide();
    expect(currentSlide(st()).bg).toEqual({ kind: "image", src: "/library/fonds/creme-croix.svg" });
  });

  it("ne laisse jamais une présentation sans diapo", () => {
    st().addEls([makeShape("rect")]);
    st().deleteSlide(0);
    expect(st().slides).toHaveLength(1);
    expect(els()).toHaveLength(0);
  });

  it("déplace une diapo en gardant la diapo affichée", () => {
    st().addSlide();
    st().addSlide();
    const shown = currentSlide(st()).id;
    st().moveSlide(2, 0);
    expect(st().slides[0].id).toBe(shown);
    expect(st().current).toBe(0);
  });
});

describe("édition de texte", () => {
  it("enregistre le texte saisi et permet de l'annuler", () => {
    const t = makeText({ text: "avant" });
    st().addEls([t]);
    st().startEditing(t.id);
    setEditingReader(() => "<div>après</div>");
    st().stopEditing();
    expect(els()[0]).toMatchObject({ html: "<div>après</div>" });
    st().undo();
    expect(els()[0]).toMatchObject({ html: "<div>avant</div>" });
  });

  it("un texte vidé disparaît, une étiquette vide reste", () => {
    const t = makeText({ text: "x" });
    const label = makeText({ text: "y", box: { fill: "#fff", radius: 0, border: 0, borderColor: "#000", shadow: 0, padX: 0, padY: 0 } });
    st().addEls([t, label]);
    st().startEditing(t.id);
    setEditingReader(() => "<div><br></div>");
    st().stopEditing();
    expect(els().map((e) => e.id)).toEqual([label.id]);
    st().startEditing(label.id);
    setEditingReader(() => "");
    st().stopEditing();
    expect(els()).toHaveLength(1);
  });

  it("changer de sélection termine l'édition en cours", () => {
    const t = makeText({ text: "a" });
    const other = makeShape("rect");
    st().addEls([t, other]);
    st().startEditing(t.id);
    setEditingReader(() => "<div>b</div>");
    st().select([other.id]);
    expect(st().editingId).toBeNull();
    expect(els()[0]).toMatchObject({ html: "<div>b</div>" });
  });
});

describe("presse-papiers", () => {
  it("colle des copies décalées, avec de nouveaux identifiants", () => {
    const a = makeShape("rect", { x: 100, y: 100 });
    st().addEls([a]);
    st().select([a.id]);
    st().copy();
    st().paste();
    st().paste();
    expect(els().map((e) => e.x)).toEqual([100, 140, 180]);
    expect(new Set(els().map((e) => e.id)).size).toBe(3);
  });
});
