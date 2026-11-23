import { describe, expect, it } from "vitest";
import { isImage, isPdf, sortByName, titleFromFileName } from "@/lib/examples";

const file = (name: string, type = "") => new File([new Uint8Array(1)], name, { type });

describe("exemples : fichiers déposés", () => {
  it("propose un titre lisible à partir du nom de fichier", () => {
    expect(titleFromFileName("diapo-mission_locale.pdf")).toBe("Diapo mission locale");
    expect(titleFromFileName("planning  novembre.PDF")).toBe("Planning novembre");
    expect(titleFromFileName(".pdf")).toBe("");
  });

  it("range les images dans l'ordre naturel de leurs noms", () => {
    const sorted = sortByName([file("page10.png"), file("Page2.png"), file("page1.png")]).map((f) => f.name);
    expect(sorted).toEqual(["page1.png", "Page2.png", "page10.png"]);
  });

  it("reconnaît un PDF même sans type, et seulement des images matricielles", () => {
    expect(isPdf(file("x.pdf"))).toBe(true);
    expect(isPdf(file("x", "application/pdf"))).toBe(true);
    expect(isPdf(file("x.png", "image/png"))).toBe(false);
    expect(isImage(file("x.webp", "image/webp"))).toBe(true);
    expect(isImage(file("x.svg", "image/svg+xml"))).toBe(false);
  });
});
