/**
 * Texte des éléments.
 *
 * Le texte est stocké sous une forme HTML volontairement minuscule :
 *
 *   <div>ligne</div><div>mot <span style="color:#ffd23f">coloré</span></div>
 *
 * Rien d'autre n'est admis. `safeHtml` est appliqué à chaque rendu : un
 * contenu qui sort de cette grammaire (donnée corrompue ou malveillante
 * venue de la base) est affiché comme du texte brut, jamais interprété.
 */

const TOKEN = /<div>|<\/div>|<br>|<span style="color:#[0-9a-fA-F]{3,8}">|<\/span>|[^<>]+/g;

export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

const cache = new Map<string, string>();

export function safeHtml(html: string): string {
  const hit = cache.get(html);
  if (hit !== undefined) return hit;
  let out: string;
  const tokens = html.match(TOKEN);
  if (tokens && tokens.join("") === html) {
    out = html;
  } else {
    // Hors grammaire : on retire les balises et on affiche le texte tel quel.
    const text = html
      .replace(/<\/(div|p|li)>|<br\s*\/?>/gi, "\n")
      .replace(/<[^>]*>/g, "")
      .replace(/[<>]/g, "");
    out = textToHtml(decodeEntities(text).replace(/\n+$/, ""));
  }
  if (cache.size > 2000) cache.clear();
  cache.set(html, out);
  return out;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");
}

/** Texte brut (une ligne par saut de ligne) vers la forme stockée. */
export function textToHtml(text: string): string {
  return text
    .split("\n")
    .map((line) => `<div>${line === "" ? "<br>" : escapeHtml(line)}</div>`)
    .join("");
}

/** Forme stockée vers texte brut. */
export function htmlToText(html: string): string {
  const lines = html.split("</div>").slice(0, -1);
  if (!lines.length) return decodeEntities(html.replace(/<[^>]*>/g, ""));
  return lines.map((l) => decodeEntities(l.replace(/<[^>]*>/g, ""))).join("\n");
}

export function isBlankHtml(html: string): boolean {
  return htmlToText(html).trim() === "";
}

function toHex(color: string): string | null {
  const c = color.trim().toLowerCase();
  if (/^#[0-9a-f]{3,8}$/.test(c)) return c;
  const m = c.match(/^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/);
  if (!m) return null;
  return "#" + [m[1], m[2], m[3]].map((n) => Math.min(255, Number(n)).toString(16).padStart(2, "0")).join("");
}

const BLOCKS = new Set(["DIV", "P", "LI", "UL", "OL", "H1", "H2", "H3", "H4", "BLOCKQUOTE", "PRE"]);

/**
 * Normalise le contenu d'une zone en cours d'édition vers la forme stockée.
 * Ne garde que les sauts de ligne et la couleur des mots ; tout le reste
 * (balises collées depuis une autre page, styles, liens) est abandonné.
 */
export function normalizeEditable(root: Node): string {
  const lines: string[] = [];
  let cur = "";
  let curHasContent = false;

  const pushLine = () => {
    lines.push(cur);
    cur = "";
    curHasContent = false;
  };

  const walk = (node: Node, color: string | null) => {
    if (node.nodeType === 3) {
      const text = (node.nodeValue ?? "").replace(/​/g, "").replace(/\n/g, " ");
      if (!text) return;
      const esc = escapeHtml(text);
      cur += color ? `<span style="color:${color}">${esc}</span>` : esc;
      curHasContent = true;
      return;
    }
    if (node.nodeType !== 1) return;
    const el = node as HTMLElement;
    const tag = el.tagName;
    if (tag === "BR") {
      // Un <br> final dans un bloc ne fait que matérialiser une ligne vide.
      const isTrailing = !el.nextSibling && el.parentNode !== root;
      if (!isTrailing || !curHasContent) {
        if (isTrailing) return;
        pushLine();
      }
      return;
    }
    if (tag === "SCRIPT" || tag === "STYLE") return;
    const isBlock = BLOCKS.has(tag);
    if (isBlock && curHasContent) pushLine();
    const own = el.style?.color ? toHex(el.style.color) : el.getAttribute?.("color") ? toHex(el.getAttribute("color")!) : null;
    const before = lines.length;
    for (const child of Array.from(el.childNodes)) walk(child, own ?? color);
    if (isBlock) {
      // Un bloc produit toujours au moins une ligne, même vide.
      if (curHasContent || lines.length === before) pushLine();
    }
  };

  for (const child of Array.from(root.childNodes)) walk(child, null);
  if (curHasContent) pushLine();

  while (lines.length > 1 && lines[lines.length - 1] === "") lines.pop();
  if (!lines.length) return "";
  return lines.map((l) => `<div>${l === "" ? "<br>" : l}</div>`).join("");
}
