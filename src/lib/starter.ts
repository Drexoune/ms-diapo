import { GOLD_FILL, GOLD_TEXT, PALETTE, makeBox, makeImage, makeShape, makeText, type TextInit } from "./factory";
import type { Asset, AssetCategory, Background, El, ImageEl, ShapeEl, Slide, Template, TemplateCategory, TextEl } from "./types";

/**
 * Pack de départ : éléments de bibliothèque et modèles fournis avec
 * l'application, construits d'après les diapos MS Creators (mêmes tailles,
 * couleurs, contours et ombres). Le staff peut en ajouter d'autres depuis le
 * panel admin, ou masquer ceux-ci.
 *
 * Les identifiants sont déterministes pour rester stables d'un chargement à
 * l'autre.
 */

/** Remplacé à l'insertion par l'avatar de la personne connectée. */
export const AVATAR_TOKEN = "{avatar}";
export const DEFAULT_AVATAR = "/library/avatar-defaut.svg";
export const PHOTO = "/library/photo-exemple.svg";

const BG = {
  creme: { kind: "image", src: "/library/fonds/creme-croix.svg" } as Background,
  or: { kind: "image", src: "/library/fonds/or-croix.svg" } as Background,
};

let counter = 0;
const sid = () => `s${(counter += 1)}`;

/* ───────────── Raccourcis de construction ───────────── */

const t = (text: string, x: number, y: number, w: number, size: number, extra: TextInit = {}): TextEl => ({
  ...makeText({ text, x, y, w, size, ...extra }),
  id: sid(),
});

/** Texte dans une étiquette (fond + bordure + ombre). */
const label = (text: string, x: number, y: number, w: number, size: number, fill: string, extra: TextInit = {}): TextEl =>
  t(text, x, y, w, size, { box: makeBox({ fill }), ...extra });

const pill = (text: string, x: number, y: number, w: number, fill = "#000000", color = "#ffffff"): TextEl =>
  t(text, x, y, w, 28, {
    outlined: false,
    color,
    box: makeBox({ fill, radius: 999, border: 0, shadow: 0, padX: 18, padY: 9 }),
  });

/** Largeur d'une pastille selon son texte (la largeur d'un texte est fixe : elle ne s'ajuste pas toute seule). */
const pillWidth = (text: string) => 62 + text.length * 23;

const gold = (text: string, x: number, y: number, w: number, size = 52): TextEl =>
  t(text, x, y, w, size, {
    outlined: false,
    color: GOLD_TEXT,
    box: makeBox({ fill: GOLD_FILL, radius: 10, border: 0, shadow: 0, padX: 26, padY: 14 }),
  });

const rect = (x: number, y: number, w: number, h: number, fill: string, extra: Partial<ShapeEl> = {}): ShapeEl => ({
  ...makeShape("rect", { x, y, w, h, fill, shadow: 14, ...extra }),
  id: sid(),
});

const arrow = (x: number, y: number, w: number, extra: Partial<ShapeEl> = {}): ShapeEl => ({
  ...makeShape("arrow", { x, y, w, h: 60, ...extra }),
  id: sid(),
});

const img = (src: string, x: number, y: number, w: number, h: number, extra: Partial<ImageEl> = {}): ImageEl => ({
  ...makeImage(src, { width: w, height: h }, { x, y, w, h, ...extra }),
  id: sid(),
});

const photo = (x: number, y: number, w: number, h: number, extra: Partial<ImageEl> = {}): ImageEl =>
  img(PHOTO, x, y, w, h, { radius: 12, border: 8, shadow: 14, ...extra });

const grouped = (els: El[]): El[] => {
  const g = sid();
  return els.map((el) => ({ ...el, group: g }));
};

/** Logo MS en bas à gauche et bulle du présentateur en bas à droite, repris sur chaque nouvelle diapo. */
const footer = (): El[] => [
  img("/library/ms-logo.png", 72, 878, 200, 175, { fit: "contain", keep: true }),
  img(AVATAR_TOKEN, 1742, 902, 166, 166, { radius: 9999, border: 6, keep: true }),
];

const slide = (bg: Background, els: El[]): Slide => ({ id: sid(), bg, els: [...els, ...footer()] });

/** Carte : fond, titre, texte, le tout groupé. */
const card = (x: number, y: number, w: number, h: number, title: string, body: string, fill: string = PALETTE.cream, tag?: string): El[] =>
  grouped([
    rect(x, y, w, h, fill),
    t(title, x + 30, y + 24, w - 60, 56, { align: "left" }),
    t(body, x + 30, y + 104, w - 60, 40, { align: "left", lh: 1.06 }),
    ...(tag ? [pill(tag, x + w - 30 - pillWidth(tag), y + h - 30 - 46, pillWidth(tag))] : []),
  ]);

/* ───────────── Éléments de bibliothèque ───────────── */

const assets: Asset[] = [];

function addElements(category: AssetCategory, id: string, name: string, tags: string[], els: El[]) {
  // Les positions sont ramenées au coin haut-gauche du bloc.
  const x0 = Math.min(...els.map((e) => e.x));
  const y0 = Math.min(...els.map((e) => e.y));
  assets.push({
    id: `b:${id}`,
    category,
    name,
    tags,
    kind: "elements",
    elements: els.map((e) => ({ ...e, x: e.x - x0, y: e.y - y0 })),
    sort: assets.length,
    builtin: true,
  });
}

function addImage(category: AssetCategory, id: string, name: string, tags: string[], url: string, width: number, height: number) {
  assets.push({ id: `b:${id}`, category, name, tags, kind: "image", url, width, height, sort: assets.length, builtin: true });
}

// Titres
addElements("titres", "titre-gros", "Gros titre", ["titre", "chapitre", "partie"], [t("Gros titre", 0, 0, 1500, 148)]);
addElements("titres", "titre-nom", "Titre + nom", ["ouverture", "nom", "doré"], [
  gold("Ton nom", 400, 0, 700, 56),
  t("Titre de la\nprésentation", 0, 108, 1500, 132, { lh: 1 }),
]);
addElements("titres", "titre-diapo", "Titre de diapo", ["titre"], [t("Titre de la diapo", 0, 0, 1500, 100)]);
addElements("titres", "question", "Question", ["question", "qui"], [t("Qui suis-je ?", 0, 0, 1100, 132)]);
addElements("titres", "sous-titre", "Sous-titre", ["sous-titre", "texte"], [t("Un sous-titre pour préciser", 0, 0, 1300, 56)]);
addElements("titres", "mot-jaune", "Mot en jaune", ["surligner", "jaune", "phrase"], [
  t("", 0, 0, 1500, 100, { html: `<div>Tu es un <span style="color:${PALETTE.yellow}">chef d'entreprise</span></div>` }),
]);
addElements("titres", "chiffre", "Chiffre clé", ["chiffre", "nombre", "stat"], [
  t("100 000", 0, 0, 1000, 210, { color: PALETTE.yellow }),
  t("abonnés cumulés", 0, 232, 1000, 60),
]);
addElements("titres", "texte", "Texte simple", ["paragraphe", "texte"], [
  t("Un texte plus long, pour expliquer une idée en une ou deux phrases.", 0, 0, 1100, 46, { align: "left", lh: 1.1 }),
]);

// Étiquettes
addElements("etiquettes", "blanche", "Étiquette blanche", ["étiquette", "carte"], [label("Ton texte", 0, 0, 640, 46, "#ffffff")]);
addElements("etiquettes", "peche", "Étiquette pêche", ["étiquette", "orange"], [label("Ton texte", 0, 0, 640, 46, PALETTE.peach)]);
addElements("etiquettes", "rose", "Étiquette rose", ["étiquette", "attention", "non"], [label("À éviter", 0, 0, 640, 46, PALETTE.pink)]);
addElements("etiquettes", "verte", "Étiquette verte", ["étiquette", "oui", "valide"], [label("À faire", 0, 0, 640, 46, PALETTE.green)]);
addElements("etiquettes", "nom-dore", "Nom doré", ["nom", "doré", "présentateur"], [gold("Ton nom", 0, 0, 700, 56)]);
addElements("etiquettes", "bandeau-dore", "Bandeau doré", ["bandeau", "doré", "note"], [
  gold("Une précision importante à garder en tête, sur une ou deux lignes", 0, 0, 1700, 46),
]);
addElements("etiquettes", "pastille", "Pastille noire", ["pastille", "tag", "pdf"], [pill("PDF", 0, 0, 130)]);
addElements("etiquettes", "pastille-verte", "Pastille verte", ["pastille", "tag"], [pill("À retenir", 0, 0, 230, PALETTE.forest)]);
addElements(
  "etiquettes",
  "avant-apres",
  "Avant → après",
  ["avant", "après", "flèche", "comparaison"],
  grouped([
    label("« Je fais du stream »", 0, 0, 720, 40, PALETTE.pink),
    arrow(750, 18, 130),
    label("« J'anime 3 lives par semaine »", 910, 0, 780, 40, PALETTE.green),
  ]),
);

// Listes
addElements("listes", "puces", "Liste à puces", ["liste", "puces", "points"], [
  t("Premier point\nDeuxième point\nTroisième point", 0, 0, 1500, 64, { align: "left", list: true, lh: 1.08 }),
]);
addElements(
  "listes",
  "carte-liste",
  "Liste dans une carte",
  ["liste", "carte"],
  grouped([
    rect(0, 0, 760, 420, "#ffffff"),
    t("Titre", 34, 28, 690, 56, { align: "left" }),
    t("Premier point\nDeuxième point\nTroisième point", 34, 120, 690, 40, { align: "left", list: true, lh: 1.15 }),
  ]),
);
addElements("listes", "etapes", "Étapes numérotées", ["étapes", "numéros", "plan"], [
  label("1 – Première étape", 0, 0, 900, 46, "#ffffff"),
  label("2 – Deuxième étape", 0, 122, 900, 46, "#ffffff"),
  label("3 – Troisième étape", 0, 244, 900, 46, "#ffffff"),
]);
addElements("listes", "sommaire", "Sommaire", ["sommaire", "plan"], [
  t("On va voir :", 0, 0, 1200, 56, { align: "left" }),
  t("Le premier sujet\nLe deuxième sujet\nLe troisième sujet", 0, 84, 1200, 52, { align: "left", list: true, lh: 1.12 }),
]);

// Cartes
addElements("cartes", "carte-creme", "Carte titre + texte", ["carte", "bloc"], card(0, 0, 690, 290, "Titre", "Une explication courte\nen deux lignes", PALETTE.cream, "PDF"));
addElements("cartes", "carte-blanche", "Carte blanche", ["carte", "bloc"], card(0, 0, 690, 290, "Titre", "Une explication courte\nen deux lignes", "#ffffff"));
addElements(
  "cartes",
  "carte-numero",
  "Carte numérotée",
  ["carte", "numéro", "point"],
  grouped([
    rect(0, 0, 735, 225, "#ffffff"),
    t("1 – Un point clair", 30, 44, 675, 56),
    t("On le comprend en une phrase", 30, 126, 675, 34),
  ]),
);
addElements("cartes", "grille-4", "Grille de 4 cartes", ["grille", "cartes", "2x2"], [
  ...card(0, 0, 690, 290, "Premier", "Une explication courte"),
  ...card(730, 0, 690, 290, "Deuxième", "Une explication courte"),
  ...card(0, 330, 690, 290, "Troisième", "Une explication courte"),
  ...card(730, 330, 690, 290, "Quatrième", "Une explication courte"),
]);
addElements("cartes", "bloc-sombre", "Bloc à révéler", ["révéler", "cache", "sombre"], [rect(0, 0, 576, 330, PALETTE.dark)]);
addElements(
  "cartes",
  "podium",
  "Podium",
  ["podium", "classement"],
  grouped([
    rect(0, 220, 250, 330, "#000000", { shadow: 0, radius: 18 }),
    t("2", 0, 250, 250, 90, { outlined: false }),
    rect(260, 0, 250, 550, "#000000", { shadow: 0, radius: 18 }),
    t("1", 260, 36, 250, 90, { outlined: false }),
    rect(520, 345, 250, 205, "#000000", { shadow: 0, radius: 18 }),
    t("3", 520, 370, 250, 90, { outlined: false }),
  ]),
);

// Photos
addElements("photos", "cadre", "Cadre photo", ["photo", "image", "cadre"], [photo(0, 0, 520, 520)]);
addElements("photos", "ronde", "Photo ronde", ["photo", "avatar", "rond"], [img(PHOTO, 0, 0, 360, 360, { radius: 9999, border: 8 })]);
addElements(
  "photos",
  "photo-nom",
  "Photo + nom",
  ["photo", "nom", "portrait"],
  grouped([photo(0, 0, 460, 560), label("Prénom Nom", 0, 590, 460, 46, PALETTE.peach)]),
);
addElements("photos", "capture", "Capture d'écran", ["capture", "écran", "screenshot"], [photo(0, 0, 420, 760, { radius: 22, border: 7, shadow: 16 })]);
addElements("photos", "paysage", "Image large", ["image", "paysage"], [photo(0, 0, 900, 506)]);
addElements("photos", "logo-ms", "Logo MS (coin)", ["logo", "ms"], [img("/library/ms-logo.png", 0, 0, 200, 175, { fit: "contain", keep: true })]);
addElements("photos", "bulle", "Ma bulle (coin)", ["avatar", "présentateur", "bulle"], [img(AVATAR_TOKEN, 0, 0, 166, 166, { radius: 9999, border: 6, keep: true })]);

// Stickers
addImage("stickers", "logo", "Logo MS", ["logo", "ms"], "/library/ms-logo.png", 640, 561);
addImage("stickers", "etoile", "Étoile", ["étoile", "star"], "/library/stickers/etoile.svg", 220, 220);
addImage("stickers", "etoile-fine", "Étoile fine", ["étoile", "déco"], "/library/stickers/etoile-fine.svg", 110, 110);
addImage("stickers", "croix-fine", "Petite croix", ["croix", "déco"], "/library/stickers/croix-fine.svg", 70, 70);
addImage("stickers", "coche", "Validé", ["oui", "valide", "check"], "/library/stickers/coche.svg", 220, 220);
addImage("stickers", "croix-rouge", "Refusé", ["non", "refus", "erreur"], "/library/stickers/croix-rouge.svg", 220, 220);
addImage("stickers", "eclair", "Éclair", ["éclair", "énergie"], "/library/stickers/eclair.svg", 200, 240);
addImage("stickers", "flamme", "Flamme", ["feu", "hot"], "/library/stickers/flamme.svg", 200, 240);
addImage("stickers", "coeur", "Cœur", ["cœur", "like"], "/library/stickers/coeur.svg", 230, 210);
addImage("stickers", "cible", "Cible", ["objectif", "cible"], "/library/stickers/cible.svg", 220, 220);
addImage("stickers", "billet", "Billet", ["argent", "euro"], "/library/stickers/billet.svg", 260, 180);
addImage("stickers", "bulle-texte", "Bulle", ["bulle", "parole"], "/library/stickers/bulle.svg", 260, 220);
addImage("stickers", "fleche-courbe", "Flèche courbe", ["flèche"], "/library/stickers/fleche-courbe.svg", 260, 200);
addImage("stickers", "loupe", "Loupe", ["loupe", "analyse"], "/library/stickers/loupe.png", 316, 550);
addImage("stickers", "document", "Document", ["document", "dossier", "papier"], "/library/stickers/document.png", 420, 534);
addImage("stickers", "hibou", "Hibou Turbo", ["hibou", "mascotte", "exemple"], "/library/stickers/hibou-turbo.png", 560, 697);
addElements("stickers", "fleche", "Flèche", ["flèche"], [arrow(0, 0, 260)]);

// Fonds
for (const [id, name, tags] of [
  ["creme-croix", "Crème à croix", ["clair", "défaut"]],
  ["or-croix", "Or à croix", ["doré", "titre", "ouverture"]],
  ["creme-uni", "Crème uni", ["clair", "sobre"]],
  ["nuit-croix", "Nuit", ["sombre", "noir"]],
  ["bleu-croix", "Bleu", ["bleu"]],
  ["rose-croix", "Rose", ["rose"]],
  ["vert-croix", "Vert", ["vert"]],
  ["lilas-croix", "Lilas", ["violet"]],
] as const) {
  addImage("fonds", `fond-${id}`, name, [...tags], `/library/fonds/${id}.svg`, 1920, 1080);
}

export const STARTER_ASSETS: Asset[] = assets;

/* ───────────── Modèles de diapos ───────────── */

const TITLE_Y = 88;
const heading = (text: string, size = 100) => t(text, 110, TITLE_Y, 1700, size);

const slides = {
  ouverture: () => slide(BG.or, [gold("Ton nom", 610, 338, 700, 56), t("Titre de la\nprésentation", 110, 452, 1700, 132, { lh: 1 })]),

  quiSuisJe: () =>
    slide(BG.creme, [
      t("Qui suis-je ?", 410, 66, 1100, 132),
      ...grouped([photo(420, 222, 450, 548), label("Prénom Nom", 420, 800, 450, 46, PALETTE.peach)]),
      ...grouped([photo(930, 292, 350, 350), label("Ce que je fais", 930, 672, 350, 36, PALETTE.peach)]),
      ...grouped([photo(1318, 292, 350, 350), label("Ce que j'aime", 1318, 672, 350, 36, PALETTE.peach)]),
    ]),

  sommaire: () =>
    slide(BG.creme, [
      t("Sommaire", 110, TITLE_Y, 1200, 112, { align: "left" }),
      t("On va voir :", 110, 268, 1200, 56, { align: "left" }),
      t("Le premier sujet\nLe deuxième sujet\nLe troisième sujet\nLe quatrième sujet", 110, 352, 1500, 56, { align: "left", list: true, lh: 1.14 }),
    ]),

  objectifs: () =>
    slide(BG.creme, [
      t("Objectifs", 410, 222, 1100, 112),
      t("Repartir avec quelque chose de concret\nSavoir quoi faire ensuite\nAvoir les bons documents sous la main", 110, 358, 1700, 60, { align: "left", list: true, lh: 1.1 }),
      gold("Une précision à garder en tête : ce qu'on promet, et ce qu'on ne promet pas", 145, 640, 1630, 44),
    ]),

  chapitre: () => slide(BG.creme, [t("Partie 1 :\ntitre du chapitre", 110, 368, 1700, 148, { lh: 1 })]),

  phraseChoc: () =>
    slide(BG.creme, [
      t("Tu n'es pas un passionné\nqui fait des vidéos", 210, 268, 1500, 84, { color: "#e4e4e4", lh: 1.04 }),
      t("", 110, 520, 1700, 104, {
        lh: 1.02,
        html: `<div>Tu es un <span style="color:${PALETTE.yellow}">chef d'entreprise</span></div><div>qui présente son projet</div>`,
      }),
      img("/library/stickers/croix-fine.svg", 262, 322, 36, 36),
      img("/library/stickers/croix-fine.svg", 1640, 244, 36, 36),
      img("/library/stickers/croix-fine.svg", 1576, 412, 36, 36),
      img("/library/stickers/etoile-fine.svg", 196, 610, 46, 46),
      img("/library/stickers/etoile-fine.svg", 1780, 516, 46, 46),
      img("/library/stickers/etoile-fine.svg", 1590, 728, 46, 46),
    ]),

  titreTexte: () =>
    slide(BG.creme, [
      t("Titre de la diapo", 110, TITLE_Y, 1700, 100, { align: "left" }),
      t("Une idée, expliquée simplement.\nUne deuxième ligne pour préciser.", 110, 262, 1700, 60, { align: "left", lh: 1.12 }),
      t("Un détail en plus, écrit plus petit pour ne pas voler la vedette.", 110, 452, 1500, 42, { align: "left", lh: 1.12 }),
    ]),

  imageTexte: () =>
    slide(BG.creme, [
      t("Titre de la diapo", 110, TITLE_Y, 1000, 92, { align: "left" }),
      t("Un premier point\nUn deuxième point\nUn troisième point", 110, 330, 1000, 56, { align: "left", list: true, lh: 1.16 }),
      photo(1230, 150, 540, 700, { radius: 20 }),
    ]),

  avantApres: () =>
    slide(BG.creme, [
      heading("La posture, ça fait tout !"),
      ...[
        ["« Je fais du stream »", "« J'anime 3 lives par semaine »"],
        ["« J'espère percer »", "« Mon objectif : 25 viewers en 6 mois »"],
        ["« Je ne sais pas »", "« Voici ce que je ferai »"],
      ].flatMap(([a, b], i) =>
        grouped([label(a, 110, 300 + i * 140, 760, 38, PALETTE.pink), arrow(900, 316 + i * 140, 130), label(b, 1060, 300 + i * 140, 750, 38, PALETTE.green)]),
      ),
      t("Donne des faits, pas des envies", 310, 760, 1300, 54),
    ]),

  quatreCartes: () =>
    slide(BG.creme, [
      heading("Ce dont tu auras besoin", 94),
      ...card(312, 258, 678, 290, "Premier", "Une explication courte\nen deux lignes", PALETTE.cream, "PDF"),
      ...card(1042, 258, 678, 290, "Deuxième", "Une explication courte\nen deux lignes", PALETTE.cream, "PDF"),
      ...card(312, 588, 678, 290, "Troisième", "Une explication courte\nen deux lignes", PALETTE.cream, "Canva"),
      ...card(1042, 588, 678, 290, "Quatrième", "Une explication courte\nen deux lignes", PALETTE.cream, "PDF"),
    ]),

  quatrePoints: () =>
    slide(BG.creme, [
      heading("Ce qui compte vraiment", 94),
      ...[
        ["1 – Un projet clair", "On le comprend en une phrase"],
        ["2 – Une activité réelle", "Un rythme, des chiffres"],
        ["3 – Des objectifs chiffrés", "Datés sur un an"],
        ["4 – Un projet viable", "Même sans aide, à terme"],
      ].flatMap(([a, b], i) => {
        const x = i % 2 ? 1035 : 228;
        const y = i < 2 ? 268 : 540;
        return grouped([rect(x, y, 735, 225, "#ffffff"), t(a, x + 30, y + 48, 675, 52), t(b, x + 30, y + 128, 675, 34)]);
      }),
      img("/library/stickers/loupe.png", 400, 880, 92, 160),
      t("", 520, 892, 1000, 62, { html: `<div>L'aide accélère le projet</div><div><span style="color:${PALETTE.yellow}">elle ne le fait pas tenir</span></div>`, lh: 1.04 }),
    ]),

  comparaison: () =>
    slide(BG.creme, [
      heading("L'un et l'autre", 100),
      ...grouped([
        rect(222, 272, 745, 405, "#ffffff"),
        t("Premier sujet", 256, 300, 677, 54),
        t("Un point\nUn autre point\nUn dernier point", 262, 396, 665, 38, { align: "left", list: true, lh: 1.16 }),
      ]),
      ...grouped([
        rect(1025, 272, 745, 405, "#ffffff"),
        t("Deuxième sujet", 1059, 300, 677, 54),
        t("Un point\nUn autre point\nUn dernier point", 1065, 396, 665, 38, { align: "left", list: true, lh: 1.16 }),
      ]),
      label("Ce qu'il faut retenir du premier", 222, 726, 745, 36, PALETTE.pink, { fixedH: true, h: 120 }),
      label("Ce qu'il faut retenir du second", 1025, 726, 745, 36, PALETTE.pink, { fixedH: true, h: 120 }),
    ]),

  neufCases: () =>
    slide(BG.creme, [
      heading("Le plan, case par case", 94),
      ...["Proposition", "Clients", "Canaux", "Relation", "Activités", "Ressources", "Partenaires", "Dépenses", "Revenus"].flatMap((name, i) => {
        const x = 108 + (i % 3) * 574;
        const y = 220 + Math.floor(i / 3) * 256;
        return grouped([rect(x, y, 546, 228, "#ffffff"), t(name, x + 24, y + 18, 498, 46, { align: "left" }), t("Ce qu'il faut y mettre", x + 24, y + 96, 498, 32, { align: "left", lh: 1.08 })]);
      }),
    ]),

  etapes: () =>
    slide(BG.creme, [
      heading("Les étapes", 100),
      ...["Première étape", "Deuxième étape", "Troisième étape", "Quatrième étape"].map((s, i) => label(`${i + 1} – ${s}`, 330, 262 + i * 128, 620, 40, "#ffffff")),
      ...grouped([
        rect(1010, 262, 620, 240, PALETTE.peach),
        t("Dans ton sac :", 1038, 284, 564, 42, { align: "left" }),
        t("Ce qu'il faut préparer avant de commencer", 1038, 350, 564, 32, { align: "left", lh: 1.1 }),
      ]),
      label("Si oui : on avance", 1010, 548, 620, 38, PALETTE.green),
      label("Sinon : on corrige et on revient", 1010, 660, 620, 38, PALETTE.pink),
    ]),

  planning4: () =>
    slide(BG.creme, [
      ...["Le lundi", "Le mercredi", "Le vendredi", "Le jeudi"].flatMap((day, i) => {
        const x = 46 + i * 462;
        return grouped([
          photo(x, 110, 440, 548, { shadow: 12 }),
          label("Nom du rendez-vous", x, 684, 440, 34, [PALETTE.lilac, PALETTE.pink, PALETTE.green, PALETTE.peach][i], { fixedH: true, h: 84 }),
          t(`${day} · 19h – 20h`, x, 784, 440, 28),
        ]);
      }),
    ]),

  planning6: () =>
    slide(BG.creme, [
      ...["Analyse", "Parcours d'un pro", "Bons plans", "Atelier", "Questions-réponses", "Bilan du mois"].flatMap((name, i) => {
        const x = 78 + (i % 3) * 598;
        const y = 104 + Math.floor(i / 3) * 372;
        return grouped([
          rect(x, y, 566, 330, "linear-gradient(135deg, #d9b25a 0%, #b88a2e 100%)", { shadow: 12 }),
          pill("Prénom", x + 24, y + 22, 170, "#000000", GOLD_TEXT),
          t(name, x + 24, y + 96, 330, 44, { align: "left", lh: 1.04 }),
          t("7 novembre – 19h", x + 24, y + 252, 400, 32, { align: "left" }),
          img(PHOTO, x + 360, y + 76, 180, 180, { radius: 9999, border: 6 }),
        ]);
      }),
    ]),

  podium: () =>
    slide(BG.creme, [
      t("Classement du mois", 110, TITLE_Y, 1700, 100, { align: "left" }),
      t("+ distribution des récompenses", 114, 212, 1400, 44, { align: "left" }),
      ...grouped([
        rect(590, 540, 250, 330, "#000000", { shadow: 0, radius: 18 }),
        t("2", 590, 570, 250, 90, { outlined: false }),
        rect(850, 320, 250, 550, "#000000", { shadow: 0, radius: 18 }),
        t("1", 850, 356, 250, 90, { outlined: false }),
        rect(1110, 665, 250, 205, "#000000", { shadow: 0, radius: 18 }),
        t("3", 1110, 690, 250, 90, { outlined: false }),
      ]),
    ]),

  annonce: () =>
    slide(BG.creme, [
      img("/library/stickers/etoile.svg", 850, 150, 220, 220),
      t("Grande nouvelle", 110, 420, 1700, 112),
      t("Infos supplémentaires et détails pratiques", 110, 566, 1700, 48),
    ]),

  etMaintenant: () =>
    slide(BG.creme, [
      t("Et maintenant ?", 330, 222, 1300, 100, { align: "left" }),
      label("1 – Où trouver les documents", 340, 372, 640, 34, "#ffffff", { fixedH: true, h: 120 }),
      label("2 – Je corrige les premiers envois", 1010, 372, 640, 34, "#ffffff", { fixedH: true, h: 120 }),
      label("3 – Vos questions", 340, 530, 640, 34, "#ffffff", { fixedH: true, h: 120 }),
    ]),

  questions: () => slide(BG.creme, [t("Des questions ?", 310, 462, 1300, 132)]),

  aidezNous: () =>
    slide(BG.creme, [
      t("Aidez-nous !", 310, 180, 1300, 132),
      label("Laissez-nous un avis", 420, 420, 1080, 60, "#ffffff", { fixedH: true, h: 220 }),
      t("ms-creators.com", 310, 740, 1300, 48, { color: PALETTE.blue }),
    ]),
};

const templates: Template[] = [];

function addSlideTemplate(category: TemplateCategory, id: string, name: string, make: () => Slide) {
  // Préfixe « modele- » : un modèle et un élément de bibliothèque peuvent porter le même nom sans se confondre.
  templates.push({ id: `b:modele-${id}`, kind: "slide", name, category, slides: [make()], sort: templates.length, builtin: true });
}

function addDeckTemplate(id: string, name: string, makers: (() => Slide)[]) {
  templates.push({ id: `b:modele-${id}`, kind: "deck", name, category: "ouverture", slides: makers.map((m) => m()), sort: templates.length, builtin: true });
}

addSlideTemplate("ouverture", "ouverture", "Titre d'ouverture", slides.ouverture);
addSlideTemplate("ouverture", "qui-suis-je", "Qui suis-je ?", slides.quiSuisJe);
addSlideTemplate("ouverture", "sommaire", "Sommaire", slides.sommaire);
addSlideTemplate("ouverture", "objectifs", "Objectifs", slides.objectifs);
addSlideTemplate("contenu", "chapitre", "Chapitre", slides.chapitre);
addSlideTemplate("contenu", "phrase-choc", "Phrase choc", slides.phraseChoc);
addSlideTemplate("contenu", "titre-texte", "Titre + texte", slides.titreTexte);
addSlideTemplate("contenu", "image-texte", "Texte + image", slides.imageTexte);
addSlideTemplate("contenu", "avant-apres", "Avant → après", slides.avantApres);
addSlideTemplate("contenu", "etapes", "Étapes", slides.etapes);
addSlideTemplate("cartes", "quatre-cartes", "4 cartes", slides.quatreCartes);
addSlideTemplate("cartes", "quatre-points", "4 points numérotés", slides.quatrePoints);
addSlideTemplate("cartes", "comparaison", "Comparaison", slides.comparaison);
addSlideTemplate("cartes", "neuf-cases", "9 cases", slides.neufCases);
addSlideTemplate("planning", "planning-4", "4 rendez-vous", slides.planning4);
addSlideTemplate("planning", "planning-6", "6 événements", slides.planning6);
addSlideTemplate("planning", "podium", "Classement", slides.podium);
addSlideTemplate("planning", "annonce", "Annonce", slides.annonce);
addSlideTemplate("fin", "et-maintenant", "Et maintenant ?", slides.etMaintenant);
addSlideTemplate("fin", "questions", "Des questions ?", slides.questions);
addSlideTemplate("fin", "aidez-nous", "Aidez-nous", slides.aidezNous);

addDeckTemplate("deck-formation", "Formation complète", [
  slides.ouverture,
  slides.quiSuisJe,
  slides.objectifs,
  slides.chapitre,
  slides.quatreCartes,
  slides.phraseChoc,
  slides.comparaison,
  slides.avantApres,
  slides.etapes,
  slides.etMaintenant,
  slides.questions,
]);
addDeckTemplate("deck-planning", "Planning du mois", [slides.ouverture, slides.planning4, slides.planning6, slides.annonce, slides.podium, slides.aidezNous]);
addDeckTemplate("deck-express", "Présentation express", [slides.ouverture, slides.sommaire, slides.titreTexte, slides.imageTexte, slides.questions]);

export const STARTER_TEMPLATES: Template[] = templates;

/** Diapo d'une présentation vierge : fond crème, logo et bulle déjà en place. */
export function firstSlide(): Slide {
  return slides.ouverture();
}

/* ───────────── Jeton d'avatar ───────────── */

function mapImageSrc<T extends El>(el: T, fn: (src: string) => string): T {
  if (el.type !== "image") return el;
  const src = fn(el.src);
  return src === el.src ? el : { ...el, src };
}

/** Remplace le jeton d'avatar par l'image de la personne connectée. */
export function resolveAvatarInEls(els: El[], avatarUrl: string | null): El[] {
  const url = avatarUrl || DEFAULT_AVATAR;
  return els.map((el) => mapImageSrc(el, (src) => (src === AVATAR_TOKEN ? url : src)));
}

export function resolveAvatarInSlides(list: Slide[], avatarUrl: string | null): Slide[] {
  return list.map((s) => ({ ...s, els: resolveAvatarInEls(s.els, avatarUrl) }));
}

/**
 * À l'enregistrement d'un modèle : l'avatar de l'auteur (ou la silhouette
 * par défaut) redevient un jeton, pour s'adapter à chaque utilisateur.
 */
export function tokenizeAvatarInEls(els: El[], avatarUrl: string | null): El[] {
  const url = avatarUrl || DEFAULT_AVATAR;
  return els.map((el) => mapImageSrc(el, (src) => (src === url || src === DEFAULT_AVATAR ? AVATAR_TOKEN : src)));
}

export function tokenizeAvatarInSlides(list: Slide[], avatarUrl: string | null): Slide[] {
  return list.map((s) => ({ ...s, els: tokenizeAvatarInEls(s.els, avatarUrl) }));
}
