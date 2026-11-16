// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { htmlToText, isBlankHtml, normalizeEditable, safeHtml, textToHtml } from "@/lib/text";

const dom = (html: string) => {
  const root = document.createElement("div");
  root.innerHTML = html;
  return root;
};

describe("safeHtml", () => {
  it("laisse passer la forme stockée", () => {
    const ok = '<div>Tu es un <span style="color:#ffd23f">chef</span></div><div><br></div><div>fin</div>';
    expect(safeHtml(ok)).toBe(ok);
  });

  it.each([
    '<div><script>alert(1)</script></div>',
    '<div><img src=x onerror=alert(1)></div>',
    '<div onclick="alert(1)">x</div>',
    '<div><span style="color:#fff;background:url(javascript:alert(1))">x</span></div>',
    '<div><a href="javascript:alert(1)">x</a></div>',
    "<div><span style='color:#fff'>x</span></div>",
    "<iframe src=//exemple></iframe>",
  ])("neutralise %s", (bad) => {
    const out = safeHtml(bad);
    expect(out).not.toMatch(/<(script|img|a|iframe)|on\w+=|javascript:|url\(/i);
    // Ce qui reste respecte la grammaire : le repasser dans le filtre ne change rien.
    expect(safeHtml(out)).toBe(out);
  });

  it("garde le texte d'un contenu hors grammaire", () => {
    expect(htmlToText(safeHtml("<p>Bonjour <b>toi</b></p><p>ligne 2</p>"))).toBe("Bonjour toi\nligne 2");
  });
});

describe("texte ↔ HTML", () => {
  it("fait l'aller-retour, caractères spéciaux compris", () => {
    const text = "1 < 2 & \"guillemets\"\n\nfin";
    expect(htmlToText(textToHtml(text))).toBe(text);
    expect(textToHtml("a\n\nb")).toBe("<div>a</div><div><br></div><div>b</div>");
  });

  it("reconnaît un texte vide", () => {
    expect(isBlankHtml("<div><br></div>")).toBe(true);
    expect(isBlankHtml("<div>  </div>")).toBe(true);
    expect(isBlankHtml("<div>x</div>")).toBe(false);
  });
});

describe("normalizeEditable", () => {
  it("découpe en lignes ce que produit la saisie (Chrome, Firefox, Maj+Entrée)", () => {
    expect(normalizeEditable(dom("un<div>deux</div><div>trois</div>"))).toBe("<div>un</div><div>deux</div><div>trois</div>");
    expect(normalizeEditable(dom("un<br>deux"))).toBe("<div>un</div><div>deux</div>");
    expect(normalizeEditable(dom("<div>un<br>deux</div>"))).toBe("<div>un</div><div>deux</div>");
    expect(normalizeEditable(dom("<p>un</p><p>deux</p>"))).toBe("<div>un</div><div>deux</div>");
  });

  it("garde les lignes vides du milieu, pas celles de la fin", () => {
    expect(normalizeEditable(dom("<div>un</div><div><br></div><div>deux</div><div><br></div>"))).toBe("<div>un</div><div><br></div><div>deux</div>");
  });

  it("garde la couleur des mots et rien d'autre", () => {
    const html = '<div>Tu es un <span style="color: rgb(255, 210, 63); font-size: 90px">chef</span> <b>fort</b></div>';
    expect(normalizeEditable(dom(html))).toBe('<div>Tu es un <span style="color:#ffd23f">chef</span> fort</div>');
    expect(normalizeEditable(dom('<font color="#ff0000">rouge</font>'))).toBe('<div><span style="color:#ff0000">rouge</span></div>');
  });

  it("échappe le texte et ignore scripts et styles", () => {
    expect(normalizeEditable(dom("<div>a &lt;b&gt; c</div><script>x()</script><style>p{}</style>"))).toBe("<div>a &lt;b&gt; c</div>");
  });

  it("produit toujours une forme acceptée par safeHtml", () => {
    for (const html of ["un<div>deux</div>", '<div><span style="color:red">x</span></div>', "<div><br></div>", "<ul><li>a</li><li>b</li></ul>"]) {
      const out = normalizeEditable(dom(html));
      expect(safeHtml(out)).toBe(out);
    }
  });

  it("renvoie une chaîne vide pour un contenu vide", () => {
    expect(normalizeEditable(dom(""))).toBe("");
    expect(isBlankHtml(normalizeEditable(dom("<div><br></div>")))).toBe(true);
  });
});
