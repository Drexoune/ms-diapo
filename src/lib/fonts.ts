import type { FontId } from "./types";

/**
 * Polices proposées dans l'éditeur. Elles sont toutes hébergées dans
 * /public/fonts (licences libres, voir public/fonts/LICENCES.md) : aucun
 * appel externe, et l'export peut les embarquer telles quelles.
 *
 * « titre » reproduit la police des diapos MS Creators : Archivo en graisse
 * maximale, élargie à 110 %, avec un interlettrage resserré — réglages
 * mesurés sur les PDF d'exemple.
 */
export interface FontDef {
  id: FontId;
  label: string;
  family: string;
  weight: number;
  stretch?: string;
  /** Interlettrage et espacement des mots, en em. */
  ls: number;
  ws: number;
  files: { url: string; range?: string }[];
  /** Descripteurs @font-face supplémentaires (polices variables). */
  faceWeight?: string;
  faceStretch?: string;
}

const LATIN =
  "U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD";
const LATIN_EXT =
  "U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF";

export const FONTS: FontDef[] = [
  {
    id: "titre",
    label: "MS Titre",
    family: "MS Titre",
    weight: 900,
    stretch: "110%",
    ls: -0.025,
    ws: -0.05,
    faceWeight: "100 900",
    faceStretch: "62% 125%",
    files: [
      { url: "/fonts/archivo-latin-wdth-normal.woff2", range: LATIN },
      { url: "/fonts/archivo-latin-ext-wdth-normal.woff2", range: LATIN_EXT },
    ],
  },
  {
    id: "unbounded",
    label: "Unbounded",
    family: "MS Unbounded",
    weight: 900,
    ls: -0.04,
    ws: 0,
    faceWeight: "200 900",
    files: [
      { url: "/fonts/unbounded-latin-wght-normal.woff2", range: LATIN },
      { url: "/fonts/unbounded-latin-ext-wght-normal.woff2", range: LATIN_EXT },
    ],
  },
  {
    id: "bowlby",
    label: "Bowlby One",
    family: "MS Bowlby",
    weight: 400,
    ls: -0.01,
    ws: 0,
    files: [{ url: "/fonts/bowlby-one-latin-400-normal.woff2" }],
  },
  {
    id: "passion",
    label: "Passion One",
    family: "MS Passion",
    weight: 700,
    ls: 0,
    ws: 0,
    files: [
      { url: "/fonts/passion-one-latin-700-normal.woff2", range: LATIN },
      { url: "/fonts/passion-one-latin-ext-700-normal.woff2", range: LATIN_EXT },
    ],
  },
  {
    id: "anton",
    label: "Anton",
    family: "MS Anton",
    weight: 400,
    ls: 0,
    ws: 0,
    files: [
      { url: "/fonts/anton-latin-400-normal.woff2", range: LATIN },
      { url: "/fonts/anton-latin-ext-400-normal.woff2", range: LATIN_EXT },
    ],
  },
  {
    id: "marker",
    label: "Feutre",
    family: "MS Marker",
    weight: 400,
    ls: 0,
    ws: 0,
    files: [{ url: "/fonts/permanent-marker-latin-400-normal.woff2" }],
  },
  {
    id: "texte",
    label: "Texte simple",
    family: "MS Texte",
    weight: 700,
    ls: -0.01,
    ws: 0,
    faceWeight: "200 800",
    files: [
      { url: "/fonts/bricolage-grotesque-latin-wght-normal.woff2", range: LATIN },
      { url: "/fonts/bricolage-grotesque-latin-ext-wght-normal.woff2", range: LATIN_EXT },
    ],
  },
];

const BY_ID = new Map(FONTS.map((f) => [f.id, f]));

export function fontDef(id: FontId): FontDef {
  return BY_ID.get(id) ?? FONTS[0];
}

/** Règles @font-face ; `resolve` permet de remplacer chaque URL (par ex. par un data: URI pour l'export). */
export function fontFaceCss(resolve: (url: string) => string = (u) => u, only?: Set<FontId>): string {
  let css = "";
  for (const f of FONTS) {
    if (only && !only.has(f.id)) continue;
    for (const file of f.files) {
      css +=
        `@font-face{font-family:'${f.family}';font-style:normal;font-display:swap;` +
        `font-weight:${f.faceWeight ?? f.weight};` +
        (f.faceStretch ? `font-stretch:${f.faceStretch};` : "") +
        `src:url(${resolve(file.url)}) format('woff2');` +
        (file.range ? `unicode-range:${file.range};` : "") +
        `}\n`;
    }
  }
  return css;
}
