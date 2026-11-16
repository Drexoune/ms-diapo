import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { AVATAR_TOKEN, DEFAULT_AVATAR, STARTER_ASSETS, STARTER_TEMPLATES, resolveAvatarInSlides, tokenizeAvatarInSlides } from "@/lib/starter";
import { FONTS } from "@/lib/fonts";
import { safeHtml } from "@/lib/text";
import { ASSET_CATEGORIES, SLIDE_H, SLIDE_W, TEMPLATE_CATEGORIES, type El } from "@/lib/types";

const publicFile = (url: string) => existsSync(new URL(`../../public${url}`, import.meta.url));
const allEls: El[] = [...STARTER_ASSETS.flatMap((a) => a.elements ?? []), ...STARTER_TEMPLATES.flatMap((t) => t.slides.flatMap((s) => s.els))];

describe("pack de départ", () => {
  it("couvre toutes les catégories", () => {
    for (const c of ASSET_CATEGORIES) expect(STARTER_ASSETS.some((a) => a.category === c.id), c.id).toBe(true);
    for (const c of TEMPLATE_CATEGORIES) expect(STARTER_TEMPLATES.some((t) => t.kind === "slide" && t.category === c.id), c.id).toBe(true);
    expect(STARTER_TEMPLATES.filter((t) => t.kind === "deck").length).toBeGreaterThanOrEqual(2);
  });

  it("a des identifiants uniques et stables", () => {
    const ids = [...STARTER_ASSETS, ...STARTER_TEMPLATES].map((x) => x.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^b:[a-z0-9-]+$/);
    const elIds = allEls.map((e) => e.id);
    expect(new Set(elIds).size).toBe(elIds.length);
  });

  it("ne référence que des fichiers qui existent", () => {
    const urls = new Set<string>();
    for (const a of STARTER_ASSETS) if (a.url) urls.add(a.url);
    for (const el of allEls) if (el.type === "image" && el.src !== AVATAR_TOKEN) urls.add(el.src);
    for (const t of STARTER_TEMPLATES) for (const s of t.slides) if (s.bg.kind === "image") urls.add(s.bg.src);
    urls.add(DEFAULT_AVATAR);
    for (const url of urls) expect(publicFile(url), url).toBe(true);
    for (const f of FONTS) for (const file of f.files) expect(publicFile(file.url), file.url).toBe(true);
  });

  it("garde chaque diapo de modèle dans le cadre", () => {
    for (const t of STARTER_TEMPLATES) {
      for (const s of t.slides) {
        for (const el of s.els) {
          const where = `${t.id} / ${el.type} en (${el.x}, ${el.y})`;
          expect(el.x, where).toBeGreaterThanOrEqual(0);
          expect(el.y, where).toBeGreaterThanOrEqual(0);
          expect(el.x + el.w, where).toBeLessThanOrEqual(SLIDE_W);
          expect(el.y + el.h, where).toBeLessThanOrEqual(SLIDE_H);
        }
      }
    }
  });

  it("n'a que du texte au format stocké", () => {
    for (const el of allEls) if (el.type === "text") expect(safeHtml(el.html), el.html).toBe(el.html);
  });

  it("met logo et bulle sur chaque diapo de modèle, repris sur les suivantes", () => {
    for (const t of STARTER_TEMPLATES) {
      for (const s of t.slides) {
        const kept = s.els.filter((e) => e.keep);
        expect(kept.some((e) => e.type === "image" && e.src === "/library/ms-logo.png"), t.id).toBe(true);
        expect(kept.some((e) => e.type === "image" && e.src === AVATAR_TOKEN), t.id).toBe(true);
      }
    }
  });
});

describe("jeton d'avatar", () => {
  const slides = STARTER_TEMPLATES[0].slides;

  it("est remplacé par l'avatar de la personne, ou la silhouette par défaut", () => {
    const srcs = (list: typeof slides) => list.flatMap((s) => s.els).flatMap((e) => (e.type === "image" ? [e.src] : []));
    expect(srcs(resolveAvatarInSlides(slides, "https://exemple/moi.png"))).toContain("https://exemple/moi.png");
    expect(srcs(resolveAvatarInSlides(slides, null))).toContain(DEFAULT_AVATAR);
    expect(srcs(resolveAvatarInSlides(slides, null))).not.toContain(AVATAR_TOKEN);
  });

  it("redevient un jeton à l'enregistrement d'un modèle, avec ou sans avatar", () => {
    for (const avatar of ["https://exemple/moi.png", null]) {
      const roundTrip = tokenizeAvatarInSlides(resolveAvatarInSlides(slides, avatar), avatar);
      expect(roundTrip).toEqual(slides);
    }
  });
});
