/**
 * Tests de bout en bout : pilote l'application dans Chromium, en mode démo
 * local (aucune variable Supabase), et vérifie le parcours complet.
 *
 *   npm run build && npx next start      (dans un terminal)
 *   npm run test:e2e                     (dans un autre)
 *
 * E2E_URL change l'adresse visée (par défaut http://localhost:3000).
 * E2E_SHOTS=dossier enregistre des captures d'écran à chaque étape.
 */

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const zlib = require("node:zlib");
const { chromium } = require("playwright");

const BASE = process.env.E2E_URL || "http://localhost:3000";
const SHOTS = process.env.E2E_SHOTS || "";
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "ms-diapo-e2e-"));

/* ───────────── Petits outils ───────────── */

/** Fabrique un PNG uni (sans dépendance) pour les tests d'envoi d'image. */
function makePng(file, w, h, [r, g, b, a]) {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (buf) => {
    let c = 0xffffffff;
    for (const byte of buf) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type), data]);
    const sum = Buffer.alloc(4);
    sum.writeUInt32BE(crc(body));
    return Buffer.concat([len, body, sum]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr.set([8, 6, 0, 0, 0], 8);
  const row = Buffer.concat([Buffer.from([0]), Buffer.from(Array.from({ length: w }, () => [r, g, b, a]).flat())]);
  const raw = Buffer.concat(Array.from({ length: h }, () => row));
  fs.writeFileSync(
    file,
    Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]),
  );
  return file;
}

const PHOTO = makePng(path.join(TMP, "photo test.png"), 320, 200, [40, 120, 220, 255]);
const STICKER = makePng(path.join(TMP, "sticker-test.png"), 120, 120, [230, 60, 60, 200]);

let failures = 0;
let passed = 0;

function check(cond, label, detail = "") {
  if (cond) {
    passed += 1;
    console.log(`  ok   ${label}`);
  } else {
    failures += 1;
    console.log(`  ÉCHEC ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

const near = (a, b, tol = 2) => Math.abs(a - b) <= tol;

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1440, height: 988 }, acceptDownloads: true });
  const page = await context.newPage();
  const errors = [];
  page.on("console", (m) => m.type() === "error" && errors.push(`console : ${m.text().slice(0, 300)}`));
  page.on("pageerror", (e) => errors.push(`exception : ${e.message.slice(0, 300)}`));

  let shotIndex = 0;
  const shot = async (name) => {
    if (!SHOTS) return;
    fs.mkdirSync(SHOTS, { recursive: true });
    shotIndex += 1;
    await page.screenshot({ path: path.join(SHOTS, `${String(shotIndex).padStart(2, "0")}-${name}.png`) });
  };
  const section = (name) => console.log(`\n${name}`);

  /* Accès à l'état enregistré (mode démo : localStorage). */
  const deckId = () => page.url().split("/").pop();
  const storedDeck = () => page.evaluate((id) => JSON.parse(localStorage.getItem("msd:decks") || "{}")[id], deckId());
  const stored = (key) => page.evaluate((k) => JSON.parse(localStorage.getItem(k) || "null"), key);
  const saved = () => page.waitForSelector('[data-testid="save-state"][data-state="saved"]', { timeout: 15000 });
  const els = () => page.locator('[data-testid="stage"] .el');
  const texts = () => page.locator('[data-testid="stage"] .el-text');
  const toolbar = () => page.locator('[data-testid="toolbar"]');
  const slideBox = () => page.locator('[data-testid="slide-box"]').boundingBox();
  const center = (b) => ({ x: b.x + b.width / 2, y: b.y + b.height / 2 });
  const clickEl = async (locator) => {
    const c = center(await locator.boundingBox());
    await page.mouse.click(c.x, c.y);
  };
  const dragBy = async (from, dx, dy) => {
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    await page.mouse.move(from.x + dx, from.y + dy, { steps: 6 });
    await page.mouse.up();
  };
  const deselect = async () => {
    await page.keyboard.press("Escape");
    await page.keyboard.press("Escape");
  };

  /* ───────────── 1. Accueil et création ───────────── */
  section("Accueil");
  await page.goto(BASE, { waitUntil: "networkidle" });
  // Visite guidée déjà vue : elle a son propre parcours (tests/e2e/tour.cjs).
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem("msd:onboarded:local", "1");
    indexedDB.deleteDatabase("ms-diapo");
  });
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForSelector('[data-testid="new-blank"]');
  check((await page.locator('[data-testid="signin"]').count()) === 0, "le mode démo ne demande pas de connexion");
  check((await page.locator("text=Mode démo local").count()) === 1, "le bandeau « mode démo » est affiché");
  check((await page.locator('[data-testid="admin-link"]').count()) === 0, "pas de lien admin sans rôle staff");
  await shot("accueil");
  await page.click('[data-testid="new-blank"]');
  await page.waitForSelector('[data-testid="editor"]', { timeout: 30000 });
  await page.waitForSelector('[data-testid="stage"] .el-text');
  check(/\/editor\/[0-9a-f-]{36}$/.test(page.url()), "la création ouvre l'éditeur");
  check((await els().count()) === 4, "la diapo d'ouverture contient nom, titre, logo et bulle", `${await els().count()} éléments`);
  {
    const first = (await storedDeck()).slides[0].els;
    check(first[0].font === "etiquette" && first[0].hug && first[1].font === "titre-etroit", "« Partir de zéro » pose l'élément « Slide d'ouverture » : badge doré et grand titre");
  }

  /* ───────────── 2. Sélection, édition de texte ───────────── */
  section("Texte");
  const title = texts().nth(1);
  await clickEl(title);
  check(await toolbar().isVisible(), "cliquer un texte affiche la barre d'outils");
  check((await page.locator('[data-testid="selection-box"]').count()) === 1, "… et le cadre de sélection");
  const c0 = center(await title.boundingBox());
  await page.mouse.dblclick(c0.x, c0.y);
  await page.waitForSelector('.tx[contenteditable="true"]');
  await page.keyboard.press("Control+A");
  await page.keyboard.type("Gagner sa vie");
  await page.keyboard.press("Enter");
  await page.keyboard.type("avec ses vidéos");
  await shot("edition");
  await page.keyboard.press("Escape");
  check((await title.locator(".tx").innerHTML()) === "<div>Gagner sa vie</div><div>avec ses vidéos</div>", "le double-clic permet d'écrire, Échap valide");
  await saved();
  check((await storedDeck()).slides[0].els[1].html === "<div>Gagner sa vie</div><div>avec ses vidéos</div>", "le texte est enregistré automatiquement");

  // Un mot en couleur.
  await page.mouse.dblclick(c0.x, c0.y);
  await page.waitForSelector('.tx[contenteditable="true"]');
  await page.keyboard.press("Control+A");
  await page.keyboard.type("Tu es un chef");
  await page.keyboard.press("Control+Shift+ArrowLeft");
  await toolbar().locator('button[title^="Couleur du texte"]').click();
  await page.click('button[title="Jaune MS"]');
  await deselect();
  await saved();
  check((await storedDeck()).slides[0].els[1].html === '<div>Tu es un <span style="color:#ffd23f">chef</span></div>', "colorer un mot sélectionné ne colore que ce mot");

  // Bouton « Texte » : on écrit tout de suite.
  await page.click('[data-testid="add-text"]');
  await page.waitForSelector('.tx[contenteditable="true"]');
  await page.keyboard.type("Texte ajouté");
  await page.keyboard.press("Escape");
  check((await texts().last().locator(".tx").innerText()).toLowerCase() === "texte ajouté", "le bouton Texte crée un texte prêt à saisir");

  // Étiquette.
  await toolbar().locator('button[title^="Étiquette"]').click();
  await toolbar().locator('button[title="Fond de l\'étiquette"]').click();
  await page.click('button[title="Pêche"]');
  await deselect();
  await saved();
  check((await storedDeck()).slides[0].els.at(-1).box?.fill === "#fbc57e", "un texte devient une étiquette colorée");

  // Un texte vidé disparaît.
  const before = await els().count();
  const last = center(await texts().last().boundingBox());
  await page.mouse.dblclick(last.x, last.y);
  await page.waitForSelector('.tx[contenteditable="true"]');
  await page.keyboard.press("Control+A");
  await page.keyboard.press("Delete");
  await page.keyboard.press("Escape");
  check((await els().count()) === before, "une étiquette vidée reste en place (son fond la rend visible)");
  await page.keyboard.press("Delete");
  check((await els().count()) === before - 1, "Suppr retire l'élément sélectionné");

  /* ───────────── 3. Déplacer, annuler ───────────── */
  section("Déplacement et historique");
  const b1 = await title.boundingBox();
  // Alt désactive l'aimantation : le déplacement mesuré est exactement celui de la souris.
  await page.keyboard.down("Alt");
  await dragBy(center(b1), 60, 40);
  await page.keyboard.up("Alt");
  const b2 = await title.boundingBox();
  check(near(b2.x - b1.x, 60) && near(b2.y - b1.y, 40), "glisser déplace l'élément", `${b2.x - b1.x}, ${b2.y - b1.y}`);
  await page.keyboard.press("Control+Z");
  const b3 = await title.boundingBox();
  check(near(b3.x, b1.x) && near(b3.y, b1.y), "Ctrl+Z annule le déplacement");
  await page.keyboard.press("Control+Shift+Z");
  const b4 = await title.boundingBox();
  check(near(b4.x, b2.x) && near(b4.y, b2.y), "Ctrl+Maj+Z le rétablit");
  await page.keyboard.press("Control+Z");
  await clickEl(title);
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Shift+ArrowDown");
  const b5 = await title.boundingBox();
  const scale = (await slideBox()).width / 1920;
  check(near(b5.x - b1.x, scale, 1) && near(b5.y - b1.y, 10 * scale, 1), "les flèches déplacent d'un cran (10 avec Maj)");
  await deselect();

  /* ───────────── 4. Diapos ───────────── */
  section("Diapos");
  await page.click('[data-testid="add-slide"]');
  await saved();
  let deck = await storedDeck();
  check(deck.slides.length === 2, "« Nouvelle diapo » ajoute une diapo");
  check(deck.slides[1].bg.src === "/library/fonds/creme-croix.svg", "après l'ouverture dorée, la suite passe sur fond crème");
  check(deck.slides[1].els.length === 2 && deck.slides[1].els.every((e) => e.keep), "le logo et la bulle sont repris sur la nouvelle diapo");

  /* ───────────── 5. Bibliothèque ───────────── */
  section("Bibliothèque");
  await page.click('[data-asset-id="b:titre-diapo"]');
  check((await els().count()) === 3, "un clic sur un élément l'ajoute à la diapo");
  await page.getByRole("tab", { name: "Cartes" }).click();
  const box = await slideBox();
  await page.locator('[data-asset-id="b:carte-creme"]').dragTo(page.locator('[data-testid="slide-box"]'), { targetPosition: { x: box.width * 0.3, y: box.height * 0.62 } });
  check((await els().count()) === 7, "glisser une carte la dépose (fond, titre, texte, pastille)", `${await els().count()} éléments`);
  await saved();
  deck = await storedDeck();
  const cardRect = deck.slides[1].els.find((e) => e.type === "shape");
  check(near(cardRect.x + cardRect.w / 2, 1920 * 0.3, 12) && near(cardRect.y + cardRect.h / 2, 1080 * 0.62, 12), "… à l'endroit où on la lâche", `${cardRect.x + cardRect.w / 2}, ${cardRect.y + cardRect.h / 2}`);
  check(new Set(deck.slides[1].els.slice(-4).map((e) => e.group)).size === 1, "les éléments d'une carte restent groupés");
  await page.getByRole("tab", { name: "Stickers" }).click();
  await page.locator('[data-asset-id="b:etoile"]').dragTo(page.locator('[data-testid="slide-box"]'), { targetPosition: { x: box.width * 0.82, y: box.height * 0.3 } });
  check((await els().count()) === 8, "glisser un sticker le dépose");
  await page.fill('input[aria-label="Chercher dans la bibliothèque"]', "podium");
  check((await page.locator("[data-asset-id]").count()) === 1 && (await page.locator('[data-asset-id="b:podium"]').count()) === 1, "la recherche trouve un élément dans toutes les catégories");
  // Badges dorés, cuivrés, verts : texte modifiable, dégradé conservé.
  await page.fill('input[aria-label="Chercher dans la bibliothèque"]', "badge");
  check(
    (await page.locator('[data-asset-id="b:badge-dore"], [data-asset-id="b:badge-cuivre"], [data-asset-id="b:badge-vert"]').count()) === 3,
    "les trois badges sont dans la bibliothèque",
  );
  await page.click('[data-asset-id="b:badge-dore"]');
  check((await els().count()) === 9, "un badge se pose d'un clic");
  const badge = texts().last();
  const bc = center(await badge.boundingBox());
  await page.mouse.dblclick(bc.x, bc.y);
  await page.waitForSelector('.tx[contenteditable="true"]');
  await page.keyboard.press("Control+A");
  await page.keyboard.type("Top 1");
  await page.keyboard.press("Escape");
  await saved();
  const badgeEl = (await storedDeck()).slides[1].els.at(-1);
  check(badgeEl.html === "<div>Top 1</div>" && badgeEl.fill?.startsWith("linear-gradient") && badgeEl.box?.fill, "le texte d'un badge s'écrit au double-clic, dégradé et fond gardés", badgeEl.html);
  await page.keyboard.press("Delete");
  check((await els().count()) === 8, "… et le badge se retire");
  await page.fill('input[aria-label="Chercher dans la bibliothèque"]', "");
  await page.getByRole("tab", { name: "Fonds" }).click();
  await page.click('[data-asset-id="b:fond-bleu-croix"]');
  await saved();
  deck = await storedDeck();
  check(deck.slides[1].bg.src === "/library/fonds/bleu-croix.svg" && deck.slides[0].bg.src === "/library/fonds/or-croix.svg", "un fond s'applique à la diapo affichée seulement");
  await shot("bibliotheque");

  /* ───────────── 6. Formes, redimensionnement, rotation ───────────── */
  section("Formes");
  await page.click('[data-testid="add-shape"]');
  await page.click('[data-testid="shape-rect"]');
  const sel = page.locator('[data-testid="selection-box"]');
  const s1 = await sel.boundingBox();
  await dragBy(center(await page.locator('[data-handle="se"]').boundingBox()), 80, 50);
  const s2 = await sel.boundingBox();
  check(near(s2.width - s1.width, 80) && near(s2.height - s1.height, 50) && near(s2.x, s1.x) && near(s2.y, s1.y), "tirer un coin redimensionne sans bouger le coin opposé");
  await dragBy(center(await page.locator('[data-handle="rotate"]').boundingBox()), 100, 50);
  await saved();
  deck = await storedDeck();
  const rect = deck.slides[1].els.at(-1);
  check(rect.type === "shape" && Math.abs(rect.rot) > 20, "la poignée ronde fait pivoter", `rot ${rect.rot}`);
  await toolbar().locator('button[title="Couleur de fond"]').click();
  await page.click('button[title="Corail"]');
  await page.keyboard.press("Escape");
  await saved();
  check((await storedDeck()).slides[1].els.at(-1).fill === "#fe6f6b", "la couleur de fond d'une forme se change");
  await clickEl(els().last());
  await page.keyboard.press("Control+D");
  check((await els().count()) === 10, "Ctrl+D duplique");
  await page.keyboard.press("Delete");
  await clickEl(els().last());
  await page.keyboard.press("Delete");
  check((await els().count()) === 8, "Suppr supprime");

  /* ───────────── 7. Sélection multiple, groupes ───────────── */
  section("Sélection multiple");
  await deselect();
  const sb = await slideBox();
  await page.mouse.move(sb.x + sb.width * 0.02, sb.y + sb.height * 0.4);
  await page.mouse.down();
  await page.mouse.move(sb.x + sb.width * 0.98, sb.y + sb.height * 0.8, { steps: 6 });
  await page.mouse.up();
  check((await toolbar().innerText()).includes("éléments"), "tracer un cadre sélectionne plusieurs éléments");
  await page.keyboard.press("Control+A");
  check((await toolbar().innerText()).includes("8 éléments"), "Ctrl+A sélectionne tout");
  await deselect();

  /* ───────────── 8. Images ───────────── */
  section("Images");
  await page.setInputFiles('[data-testid="image-input"]', PHOTO);
  await page.waitForFunction(() => document.querySelectorAll('[data-testid="stage"] .el-image').length === 4);
  await saved();
  deck = await storedDeck();
  const image = deck.slides[1].els.at(-1);
  check(image.type === "image" && image.src.startsWith("data:image/png") && near(image.w / image.h, 1.6, 0.02), "le bouton Image ajoute une image aux bonnes proportions");

  // Coller une image copiée ailleurs.
  await deselect();
  await page.evaluate(async (bytes) => {
    const file = new File([new Uint8Array(bytes)], "colle.png", { type: "image/png" });
    const data = new DataTransfer();
    data.items.add(file);
    document.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }));
  }, [...fs.readFileSync(STICKER)]);
  await page.waitForFunction(() => document.querySelectorAll('[data-testid="stage"] .el-image').length === 5);
  check(true, "coller une image l'ajoute à la diapo");

  // Lâcher un fichier sur une image la remplace.
  await page.getByRole("tab", { name: "Photos" }).click();
  await page.click('[data-asset-id="b:cadre"]');
  await saved();
  const frameId = (await storedDeck()).slides[1].els.at(-1).id;
  const frameBox = await page.locator(`[data-el-id="${frameId}"]`).boundingBox();
  await page.evaluate(
    async ({ bytes, x, y }) => {
      const file = new File([new Uint8Array(bytes)], "remplace.png", { type: "image/png" });
      const data = new DataTransfer();
      data.items.add(file);
      const target = document.querySelector('[data-testid="canvas-area"]');
      for (const type of ["dragover", "drop"]) target.dispatchEvent(new DragEvent(type, { dataTransfer: data, clientX: x, clientY: y, bubbles: true, cancelable: true }));
    },
    { bytes: [...fs.readFileSync(PHOTO)], x: frameBox.x + frameBox.width / 2, y: frameBox.y + frameBox.height / 2 },
  );
  await page.waitForFunction((id) => document.querySelector(`[data-el-id="${id}"] img`)?.src.startsWith("data:image/png"), frameId);
  await saved();
  const frame = (await storedDeck()).slides[1].els.find((e) => e.id === frameId);
  check(frame.src.startsWith("data:image/png") && frame.border === 8, "lâcher un fichier sur un cadre photo remplace l'image en gardant le cadre");

  /* ───────────── 9. Modèles ───────────── */
  section("Modèles");
  await page.click('[data-testid="open-templates"]');
  await page.waitForSelector('[data-testid="template-grid"]');
  check((await page.locator('[data-testid="template-grid"] [data-template-id]').count()) >= 20, "la galerie propose les modèles de diapos");
  await shot("modeles");
  await page.click('[data-template-id="b:modele-quatre-cartes"]');
  await saved();
  deck = await storedDeck();
  check(deck.slides.length === 3 && deck.slides[2].els.some((e) => e.type === "text" && e.html.includes("besoin")), "choisir un modèle insère la diapo après la diapo affichée");
  await page.click('[data-testid="open-templates"]');
  await page.click('[data-testid="tab-decks"]');
  await page.click('[data-testid="template-decks"] [data-template-id="b:modele-deck-express"]');
  await saved();
  deck = await storedDeck();
  check(deck.slides.length === 8, "un modèle de présentation ajoute toutes ses diapos", `${deck.slides.length} diapos`);
  const ids = deck.slides.flatMap((s) => [s.id, ...s.els.map((e) => e.id)]);
  check(new Set(ids).size === ids.length, "chaque diapo et chaque élément a un identifiant unique");

  // Réordonner.
  const firstId = deck.slides[0].id;
  await page.locator('[data-slide-index="0"]').dragTo(page.locator('[data-slide-index="2"]'));
  await saved();
  check((await storedDeck()).slides[2].id === firstId, "glisser une miniature réordonne les diapos");
  await page.keyboard.press("Control+Z");
  await saved();
  check((await storedDeck()).slides[0].id === firstId, "… et Ctrl+Z remet l'ordre");

  /* ───────────── 10. Export ───────────── */
  section("Export");
  await page.fill('[data-testid="title-input"]', "Présentation d'essai");
  await page.click('[data-testid="download"]');
  const [pdf] = await Promise.all([page.waitForEvent("download", { timeout: 120000 }), page.click('[data-testid="export-pdf"]')]);
  const pdfPath = path.join(TMP, "out.pdf");
  await pdf.saveAs(pdfPath);
  const pdfBytes = fs.readFileSync(pdfPath);
  const pages = (pdfBytes.toString("latin1").match(/\/Type\s*\/Page[^s]/g) || []).length;
  check(pdf.suggestedFilename() === "presentation-d-essai.pdf", "le PDF porte le nom de la présentation", pdf.suggestedFilename());
  check(pdfBytes.subarray(0, 5).toString() === "%PDF-" && pages === 8, "le PDF contient une page par diapo", `${pages} pages`);
  check(pdfBytes.length > 300_000, "… avec de vraies images de diapos", `${pdfBytes.length} octets`);
  await page.click('[data-testid="download"]');
  const [png] = await Promise.all([page.waitForEvent("download", { timeout: 60000 }), page.click('[data-testid="export-png"]')]);
  const pngPath = path.join(TMP, "out.png");
  await png.saveAs(pngPath);
  const pngBytes = fs.readFileSync(pngPath);
  check(pngBytes.readUInt32BE(16) === 1920 && pngBytes.readUInt32BE(20) === 1080, "l'image PNG fait 1920 × 1080");

  /* ───────────── 11. Présentation ───────────── */
  section("Présentation");
  await page.locator('[data-slide-index="0"] button').first().click();
  await page.click('[data-testid="present-btn"]');
  await page.waitForSelector('[data-testid="present"]');
  check((await page.locator('[data-testid="present-count"]').innerText()) === "1 / 8", "« Présenter » démarre sur la diapo affichée");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Space");
  check((await page.locator('[data-testid="present-count"]').innerText()) === "3 / 8", "les flèches et Espace avancent");
  await page.keyboard.press("ArrowLeft");
  check((await page.locator('[data-testid="present-count"]').innerText()) === "2 / 8", "la flèche gauche recule");
  await shot("presentation");
  await page.keyboard.press("Escape");
  await page.waitForSelector('[data-testid="present"]', { state: "detached" });
  check(true, "Échap quitte la présentation");

  /* ───────────── 12. Persistance et accueil ───────────── */
  section("Enregistrement");
  await saved();
  const id = deckId();
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForSelector('[data-testid="stage"] .el-text');
  check((await page.inputValue('[data-testid="title-input"]')) === "Présentation d'essai", "après rechargement, le titre est là");
  check((await page.locator("[data-slide-index]").count()) === 8, "… et les 8 diapos aussi");
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.waitForSelector(`[data-deck-id="${id}"]`);
  check((await page.locator(`[data-deck-id="${id}"]`).innerText()).includes("Présentation d'essai"), "la présentation apparaît sur l'accueil");
  await page.locator(`[data-deck-id="${id}"]`).hover();
  await page.click('button[aria-label="Dupliquer"]');
  await page.waitForFunction(() => document.querySelectorAll("[data-deck-id]").length === 2);
  check(true, "dupliquer crée une copie");
  await page.locator("[data-deck-id]").first().hover();
  await page.locator('button[aria-label="Supprimer"]').first().click();
  await page.getByRole("dialog").getByRole("button", { name: "Supprimer" }).click();
  await page.waitForFunction(() => document.querySelectorAll("[data-deck-id]").length === 1);
  check(true, "supprimer demande confirmation puis retire la présentation");

  /* ───────────── 13. Panel admin ───────────── */
  section("Panel admin");
  await page.goto(`${BASE}/admin`, { waitUntil: "networkidle" });
  await page.waitForSelector('[data-testid="admin-denied"]');
  check(true, "sans rôle staff, le panel admin est refusé");
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.check('[data-testid="demo-staff"]');
  await page.click('[data-testid="admin-link"]');
  await page.waitForSelector('[data-testid="admin"]');
  await page.click('[data-testid="admin-upload"]');
  await page.setInputFiles('[data-testid="upload-input"]', STICKER);
  await page.click('[data-testid="upload-submit"]');
  await page.waitForFunction(() => JSON.parse(localStorage.getItem("msd:assets") || "[]").length === 1);
  const asset = (await stored("msd:assets"))[0];
  check(asset.name === "sticker test" && asset.category === "stickers" && asset.kind === "image", "le staff ajoute une image à la bibliothèque", JSON.stringify({ n: asset.name, c: asset.category }));
  const confirmDialog = () => page.getByRole("dialog").getByRole("button", { name: "Supprimer" }).click();
  await page.locator('[data-asset-id="b:coeur"] [data-testid="asset-delete"]').click();
  await confirmDialog();
  await page.waitForFunction(() => (localStorage.getItem("msd:hidden") || "").includes("b:coeur"));
  check((await page.locator('[data-testid="admin-assets"] [data-asset-id="b:coeur"]').count()) === 0, "le staff supprime un élément du pack de départ (après confirmation)");
  await page.locator('[data-testid="deleted-builtins"] summary').click();
  check((await page.locator('[data-restore="b:coeur"]').count()) === 1, "… qui reste récupérable dans « supprimés »");

  // Renommer un élément du pack de départ, puis lui rendre son nom.
  await page.locator('[data-asset-id="b:etoile"] [data-testid="asset-rename"]').click();
  await page.fill('[data-testid="rename-input"]', "Étoile MS");
  await page.click('[data-testid="rename-save"]');
  await page.waitForFunction(() => JSON.parse(localStorage.getItem("msd:builtin-names") || "{}")["b:etoile"] === "Étoile MS");
  check((await page.locator('[data-asset-id="b:etoile"]').innerText()).includes("Étoile MS"), "le staff renomme un élément du pack de départ");
  await page.locator('[data-asset-id="b:eclair"] [data-testid="asset-rename"]').click();
  await page.fill('[data-testid="rename-input"]', "Zap");
  await page.click('[data-testid="rename-save"]');
  await page.locator('[data-asset-id="b:eclair"] [data-testid="asset-rename"]').click();
  await page.getByRole("button", { name: /Revenir au nom d'origine/ }).click();
  await page.waitForFunction(() => !("b:eclair" in JSON.parse(localStorage.getItem("msd:builtin-names") || "{}")));
  check((await page.locator('[data-asset-id="b:eclair"]').innerText()).includes("Éclair"), "… et peut lui rendre son nom d'origine");

  // Réécrire les textes d'éléments du pack de départ.
  const contents = () => page.evaluate(() => JSON.parse(localStorage.getItem("msd:builtin-contents") || "{}"));
  const fields = page.locator('[data-testid="asset-text-field"]');
  await page.locator('[data-asset-id="b:titre-gros"] [data-testid="asset-texts"]').click();
  check((await fields.count()) === 1, "« Textes » ouvre un champ par texte de l'élément");
  await fields.first().click();
  await page.keyboard.press("Control+A");
  await page.keyboard.type("Mon super titre");
  check((await page.locator('[data-testid="asset-texts-preview"]').innerText()).toLowerCase().includes("mon super titre"), "l'aperçu suit la frappe");
  await page.keyboard.press("Control+A");
  await page.keyboard.press("Delete");
  check(await page.locator('[data-testid="asset-texts-save"]').isDisabled(), "un texte vidé ne peut pas être enregistré");
  await page.keyboard.type("Mon super titre");
  await page.click('[data-testid="asset-texts-save"]');
  await page.waitForFunction(() => JSON.parse(localStorage.getItem("msd:builtin-contents") || "{}")["b:titre-gros"]);
  check((await contents())["b:titre-gros"][0].html === "<div>Mon super titre</div>", "le staff réécrit le texte d'un élément du pack de départ");
  check((await page.locator('[data-asset-id="b:titre-gros"]').innerText()).toLowerCase().includes("mon super titre"), "… et la carte montre le nouveau texte");

  await page.locator('[data-asset-id="b:titre-nom"] [data-testid="asset-texts"]').click();
  check((await fields.count()) === 2, "un bloc à deux textes a deux champs");
  await fields.first().click();
  await page.keyboard.press("Control+A");
  await page.keyboard.type("Clément");
  await fields.nth(1).click();
  await page.keyboard.press("Control+End");
  await page.keyboard.press("Enter");
  await page.keyboard.type("en trois lignes");
  await page.click('[data-testid="asset-texts-save"]');
  await page.waitForFunction(() => JSON.parse(localStorage.getItem("msd:builtin-contents") || "{}")["b:titre-nom"]);
  const nomBloc = (await contents())["b:titre-nom"].filter((e) => e.type === "text").map((e) => e.html);
  check(nomBloc.includes("<div>Clément</div>") && nomBloc.some((h) => h === "<div>Titre de la</div><div>présentation</div><div>en trois lignes</div>"), "plusieurs textes, et des lignes ajoutées avec Entrée", nomBloc.join(" | "));

  await page.locator('[data-asset-id="b:mot-jaune"] [data-testid="asset-texts"]').click();
  await fields.first().click();
  await page.keyboard.press("Control+Home");
  await page.keyboard.type("Oui, ");
  await page.click('[data-testid="asset-texts-save"]');
  await page.waitForFunction(() => JSON.parse(localStorage.getItem("msd:builtin-contents") || "{}")["b:mot-jaune"]);
  const jaune = (await contents())["b:mot-jaune"][0].html;
  check(jaune.startsWith("<div>Oui, Tu es un ") && jaune.includes('<span style="color:#ffd23f">chef d\'entreprise</span>'), "le mot en couleur garde sa couleur", jaune);

  await page.locator('[data-asset-id="b:titre-gros"] [data-testid="asset-texts"]').click();
  await page.click('[data-testid="asset-texts-restore"]');
  await page.waitForFunction(() => !("b:titre-gros" in JSON.parse(localStorage.getItem("msd:builtin-contents") || "{}")));
  check((await page.locator('[data-asset-id="b:titre-gros"]').innerText()).toLowerCase().includes("gros titre"), "« Revenir aux textes d'origine » rétablit l'élément");

  // Renommer puis supprimer complètement un élément ajouté par le staff.
  const customCard = page.locator(`[data-asset-id="${asset.id}"]`);
  await customCard.locator('[data-testid="asset-rename"]').click();
  await page.getByRole("dialog").locator("input").first().fill("Triangle rouge");
  await page.getByRole("dialog").getByRole("button", { name: "Enregistrer" }).click();
  await page.waitForFunction(() => JSON.parse(localStorage.getItem("msd:assets"))[0].name === "Triangle rouge");
  check(true, "le staff renomme un élément qu'il a ajouté");
  await shot("admin");

  // Modèles du pack de départ : renommer, supprimer.
  await page.click('[data-testid="admin-tab-templates"]');
  await page.locator('[data-template-id="b:modele-podium"] [data-testid="template-rename"]').click();
  await page.fill('[data-testid="rename-input"]', "Classement du mois");
  await page.click('[data-testid="rename-save"]');
  await page.waitForFunction(() => JSON.parse(localStorage.getItem("msd:builtin-names") || "{}")["b:modele-podium"] === "Classement du mois");
  check(true, "le staff renomme un modèle du pack de départ");
  await page.locator('[data-template-id="b:modele-aidez-nous"] [data-testid="template-delete"]').click();
  await confirmDialog();
  await page.waitForFunction(() => (localStorage.getItem("msd:hidden") || "").includes("b:modele-aidez-nous"));
  check((await page.locator('[data-template-id="b:modele-aidez-nous"]').count()) === 0, "le staff supprime un modèle du pack de départ");
  await page.click('[data-testid="admin-tab-assets"]');

  await page.click('[data-testid="admin-tab-templates"]');
  await page.click('[data-testid="admin-new-slide-template"]');
  await page.waitForSelector('[data-testid="editor"]', { timeout: 30000 });
  await page.waitForSelector('[data-testid="stage"] .el-text');
  check(/\/modele\/[0-9a-f-]{36}$/.test(page.url()), "« Nouveau modèle » ouvre l'éditeur sur le modèle");
  await page.fill('[data-testid="title-input"]', "Annonce de live");
  await saved();
  let templates = await stored("msd:templates");
  check(templates.length === 1 && templates[0].name === "Annonce de live", "le nom du modèle est enregistré");
  check(templates[0].slides[0].els.some((e) => e.src === "{avatar}"), "la bulle du présentateur reste un emplacement, pas l'image de l'auteur");

  await page.getByRole("tab", { name: "Stickers" }).click();
  check((await page.locator('[data-testid="library"]').getByText("Triangle rouge").count()) === 1, "l'image ajoutée (et renommée) apparaît dans la bibliothèque de l'éditeur");
  check((await page.locator('[data-asset-id="b:etoile"]').innerText()).includes("Étoile MS"), "le nouveau nom d'un élément du pack s'y affiche aussi");
  check((await page.locator('[data-asset-id="b:coeur"]').count()) === 0, "l'élément supprimé n'y est plus");
  await page.getByRole("tab", { name: "Titres" }).click();
  check((await page.locator('[data-asset-id="b:titre-nom"]').innerText()).toLowerCase().includes("clément"), "les textes réécrits s'affichent dans la bibliothèque de l'éditeur");
  const elsBefore = await page.locator('[data-testid="stage"] .el-text').count();
  await page.click('[data-asset-id="b:titre-nom"]');
  await page.waitForFunction((n) => document.querySelectorAll('[data-testid="stage"] .el-text').length === n + 2, elsBefore);
  check((await page.locator('[data-testid="stage"]').innerText()).toLowerCase().includes("clément"), "… et c'est ce texte qui arrive sur la diapo");
  await page.keyboard.press("Control+z");
  await page.click('[data-testid="open-templates"]');
  await page.waitForSelector('[data-testid="template-grid"]');
  check(
    (await page.locator('[data-testid="template-grid"] [data-template-id="b:modele-podium"]').innerText()).includes("Classement du mois") &&
      (await page.locator('[data-testid="template-grid"] [data-template-id="b:modele-aidez-nous"]').count()) === 0,
    "les modèles renommés et supprimés le sont aussi pour les utilisateurs",
  );
  await page.keyboard.press("Escape");

  await clickEl(texts().nth(1));
  await toolbar().locator('button[aria-label="Plus d\'options"]').click();
  await page.click("text=Ajouter à la bibliothèque (staff)");
  await page.fill('[data-testid="save-asset-name"]', "Mon titre maison");
  await page.click('[data-testid="save-asset-submit"]');
  await page.waitForFunction(() => JSON.parse(localStorage.getItem("msd:assets") || "[]").length === 2);
  const block = (await stored("msd:assets"))[1];
  check(block.kind === "elements" && block.elements.length === 1 && block.elements[0].x === 0 && block.elements[0].y === 0, "une sélection devient un élément de bibliothèque, recalé à l'origine");
  const backTo = page.url();
  await page.goto(`${BASE}/admin`, { waitUntil: "networkidle" });
  await page.locator(`[data-asset-id="${block.id}"] [data-testid="asset-texts"]`).click();
  await page.locator('[data-testid="asset-text-field"]').first().click();
  await page.keyboard.press("Control+A");
  await page.keyboard.type("Texte maison réécrit");
  await shot("textes");
  await page.click('[data-testid="asset-texts-save"]');
  await page.waitForFunction((id) => JSON.parse(localStorage.getItem("msd:assets")).find((a) => a.id === id).elements[0].html === "<div>Texte maison réécrit</div>", block.id);
  check(true, "le staff réécrit aussi le texte d'un élément qu'il a ajouté");
  await page.goto(backTo, { waitUntil: "networkidle" });
  await page.waitForSelector('[data-testid="stage"] .el-text');

  await page.click('[data-testid="open-templates"]');
  await page.click('[data-testid="save-slide-template"]');
  await page.fill('[data-testid="save-template-name"]', "Diapo maison");
  await page.click('[data-testid="save-template-submit"]');
  await page.waitForFunction(() => JSON.parse(localStorage.getItem("msd:templates") || "[]").length === 2);
  templates = await stored("msd:templates");
  check(templates[1].name === "Diapo maison" && templates[1].kind === "slide", "« Cette diapo → modèle » crée un modèle");

  /* ───────────── 13 bis. Éditeur de modèles ───────────── */
  section("Éditeur de modèles");
  await page.goto(`${BASE}/admin?onglet=modeles`, { waitUntil: "networkidle" });
  await page.waitForSelector('[data-testid="admin-templates"]');
  check(true, "/admin?onglet=modeles ouvre directement l'onglet Modèles");
  const cardIds = () => page.locator('[data-testid="admin-templates"] [data-template-id]').evaluateAll((n) => n.map((e) => e.getAttribute("data-template-id")));
  const rankBefore = (await cardIds()).indexOf("b:modele-chapitre");
  await page.locator('[data-template-id="b:modele-chapitre"] [data-testid="template-edit"]').click();
  await page.getByRole("dialog").getByRole("button", { name: "Créer la copie et modifier" }).click();
  await page.waitForSelector('[data-testid="template-bar"]', { timeout: 30000 });
  await page.waitForSelector('[data-testid="stage"] .el-text');
  check(/\/modele\/[0-9a-f-]{36}$/.test(page.url()), "« Modifier » sur un modèle du pack ouvre l'éditeur sur sa copie");
  templates = await stored("msd:templates");
  const copy = templates[2];
  check(
    templates.length === 3 && copy.name === "Chapitre" && (await stored("msd:hidden")).includes("b:modele-chapitre"),
    "la copie remplace l'original, qui est mis de côté",
  );
  check((await page.locator('[data-testid="editor-back"]').getAttribute("href")) === "/admin?onglet=modeles", "le logo ramène aux modèles du panel admin");

  // On le modifie comme une présentation : texte, diapo ajoutée, type, catégorie.
  const tmplTitle = texts().first();
  const tc = center(await tmplTitle.boundingBox());
  await page.mouse.dblclick(tc.x, tc.y);
  await page.waitForSelector('.tx[contenteditable="true"]');
  await page.keyboard.press("Control+A");
  await page.keyboard.type("Partie modifiée");
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  await page.click('[data-testid="add-slide"]');
  await page.selectOption('[data-testid="template-kind"]', "deck");
  await page.waitForFunction((id) => JSON.parse(localStorage.getItem("msd:templates")).find((t) => t.id === id).kind === "deck", copy.id);
  check((await page.locator('[data-testid="template-category"]').count()) === 0, "un modèle de présentation n'a pas de catégorie de diapo");
  await page.selectOption('[data-testid="template-kind"]', "slide");
  check((await page.locator('[data-testid="template-multi-hint"]').count()) === 1, "un modèle de diapo à plusieurs diapos est signalé");
  await page.selectOption('[data-testid="template-category"]', "fin");
  await saved();
  await page.click('[data-testid="template-done"]');
  await page.waitForURL(/\/admin\?onglet=modeles$/);
  await page.waitForSelector('[data-testid="admin-templates"]');
  const edited = (await stored("msd:templates")).find((t) => t.id === copy.id);
  check(
    edited.kind === "slide" && edited.category === "fin" && edited.slides.length === 2 && edited.slides[0].els.some((e) => e.html === "<div>Partie modifiée</div>"),
    "texte, diapo ajoutée, type et catégorie sont enregistrés",
  );
  check((await cardIds()).indexOf(copy.id) === rankBefore, "« Terminer » ramène au panel, où la copie a pris la place de l'original", `${(await cardIds()).indexOf(copy.id)} / ${rankBefore}`);

  // Dupliquer, puis supprimer la copie.
  await page.locator(`[data-template-id="${copy.id}"] [data-testid="template-duplicate"]`).click();
  await page.waitForFunction(() => JSON.parse(localStorage.getItem("msd:templates")).length === 4);
  const dup = (await stored("msd:templates"))[3];
  check(dup.name === "Chapitre (copie)" && dup.slides.length === 2 && dup.slides[0].id !== edited.slides[0].id, "« Dupliquer » crée une copie indépendante");
  await page.locator(`[data-template-id="${dup.id}"] [data-testid="template-delete"]`).click();
  await confirmDialog();
  await page.waitForFunction(() => JSON.parse(localStorage.getItem("msd:templates")).length === 3);
  check(true, "un modèle du staff se supprime");
  await page.click('[data-testid="templates-filter-deck"]');
  check((await page.locator('[data-testid="admin-templates"] [data-template-id]').evaluateAll((n) => n.length)) >= 2 && (await page.locator(`[data-template-id="${copy.id}"]`).count()) === 0, "le filtre Présentations n'affiche que les présentations");
  await page.click('[data-testid="templates-filter-all"]');

  // Sans rôle staff, l'éditeur de modèle est fermé.
  await page.evaluate(() => localStorage.setItem("msd:staff", "0"));
  await page.goto(`${BASE}/modele/${copy.id}`, { waitUntil: "networkidle" });
  await page.waitForSelector('[data-testid="template-denied"]');
  check(true, "sans rôle staff, un modèle ne s'ouvre pas dans l'éditeur");
  await page.evaluate(() => localStorage.setItem("msd:staff", "1"));
  // L'original revient si on le restaure ; la copie reste.
  await page.goto(`${BASE}/admin?onglet=modeles`, { waitUntil: "networkidle" });
  await page.waitForSelector('[data-testid="admin-templates"]');
  await page.click('[data-testid="deleted-builtins"] summary');
  await page.click('[data-restore="b:modele-chapitre"]');
  await page.waitForSelector('[data-template-id="b:modele-chapitre"]');
  check((await page.locator(`[data-template-id="${copy.id}"]`).count()) === 1, "l'original se restaure, la copie modifiée reste");

  /* ───────────── 14. Exemples ───────────── */
  section("Exemples");
  const examplesStored = () => stored("msd:examples").then((l) => l || []);
  const idbKeys = () =>
    page.evaluate(
      () =>
        new Promise((resolve) => {
          const req = indexedDB.open("ms-diapo");
          req.onsuccess = () => {
            const keys = req.result.transaction("files").objectStore("files").getAllKeys();
            keys.onsuccess = () => resolve(keys.result);
          };
        }),
    );
  // La fenêtre de dépôt se ferme une fois l'exemple enregistré (le bouton, lui, laisse vite place à la progression).
  const publish = async () => {
    await page.click('[data-testid="example-submit"]');
    await page.waitForSelector('[role="dialog"][aria-label="Ajouter un exemple"]', { state: "detached", timeout: 180000 });
  };

  // Un PDF de 3 pages, fabriqué pour le test.
  const { jsPDF } = require("jspdf");
  const doc = new jsPDF({ orientation: "landscape", unit: "px", format: [1920, 1080], hotfixes: ["px_scaling"] });
  for (let i = 1; i <= 3; i++) {
    if (i > 1) doc.addPage([1920, 1080], "landscape");
    doc.setFillColor(255, 220 - i * 40, 80);
    doc.rect(0, 0, 1920, 1080, "F");
    doc.setFontSize(220);
    doc.text(`PAGE ${i}`, 420, 620);
  }
  const PDF = path.join(TMP, "atelier-mission_locale.pdf");
  fs.writeFileSync(PDF, Buffer.from(doc.output("arraybuffer")));

  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.waitForSelector('[data-testid="examples-section"]');
  check((await page.locator('[data-testid="examples-section"]').innerText()).includes("Aucun exemple"), "la rubrique Exemples est vide au départ");
  await page.click('[data-testid="examples-add"]');
  await page.setInputFiles('[data-testid="example-input"]', PDF);
  await page.waitForFunction(() => /3 pages/.test(document.querySelector('[data-testid="example-picked"]')?.textContent || ""), null, { timeout: 30000 });
  check((await page.inputValue('[data-testid="example-title"]')) === "Atelier mission locale", "le PDF est lu (3 pages) et le titre proposé d'après son nom");
  await page.fill('[data-testid="example-title"]', "Atelier Mission locale");
  await page.fill('[data-testid="example-author"]', "Stéphanie");
  await publish();
  let examples = await examplesStored();
  check(examples.length === 1 && examples[0].pages.length === 3 && !!examples[0].pdfUrl, "le staff publie un PDF : 3 pages et le fichier d'origine", JSON.stringify(examples.map((e) => e.pages.length)));
  check(examples[0].pages.every((pg) => pg.w === 1920 && pg.h === 1080), "les pages sont rendues en 1920 × 1080");
  check((await idbKeys()).length === 7, "pages, miniatures et PDF sont rangés (7 fichiers)", String((await idbKeys()).length));
  await page.waitForSelector('[data-testid="examples-row"] [data-example-id]');
  check((await page.locator('[data-testid="examples-row"]').innerText()).includes("Présenté par Stéphanie"), "l'exemple apparaît sur l'accueil avec son présentateur");
  await shot("exemples-accueil");

  // Visionneuse.
  await page.click('[data-testid="examples-row"] [data-example-id]');
  await page.waitForSelector('[data-testid="example-viewer"]');
  await page.waitForFunction(() => document.querySelector('[data-testid="example-page"]')?.naturalWidth === 1920);
  check((await page.locator('[data-testid="example-count"]').innerText()) === "1 / 3", "la visionneuse s'ouvre sur la première page");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  check((await page.locator('[data-testid="example-count"]').innerText()) === "3 / 3", "les flèches tournent les pages, sans dépasser la dernière");
  await page.locator('[data-testid="example-strip"] [data-page="0"]').click();
  check((await page.locator('[data-testid="example-count"]').innerText()) === "1 / 3", "une miniature mène à sa page");
  await shot("exemples-visionneuse");
  const [original] = await Promise.all([page.waitForEvent("download", { timeout: 60000 }), page.click('[data-testid="example-download"]')]);
  const originalPath = path.join(TMP, "original.pdf");
  await original.saveAs(originalPath);
  check(original.suggestedFilename() === "atelier-mission-locale.pdf" && fs.readFileSync(originalPath).equals(fs.readFileSync(PDF)), "« Télécharger en PDF » rend le fichier d'origine, intact");
  await page.keyboard.press("Escape");
  await page.waitForSelector('[data-testid="example-viewer"]', { state: "detached" });
  check(true, "Échap ferme la visionneuse");

  // Des images (une par diapo), dans l'ordre de leurs noms.
  const img1 = makePng(path.join(TMP, "diapo-10.png"), 640, 360, [30, 160, 90, 255]);
  const img2 = makePng(path.join(TMP, "diapo-2.png"), 640, 360, [200, 60, 60, 255]);
  await page.click('[data-testid="examples-add"]');
  await page.setInputFiles('[data-testid="example-input"]', [img1, img2]);
  check((await page.locator('[data-testid="example-picked"]').innerText()).includes("diapo-2.png, diapo-10.png"), "des images sont rangées dans l'ordre naturel de leurs noms");
  await page.fill('[data-testid="example-title"]', "Planning en images");
  await publish();
  examples = await examplesStored();
  const fromImages = examples.find((e) => e.title === "Planning en images");
  check(fromImages && fromImages.pages.length === 2 && fromImages.pdfUrl === null, "le staff publie des images : 2 pages, sans PDF d'origine");
  await page.locator(`[data-example-id="${fromImages.id}"]`).click();
  await page.waitForSelector('[data-testid="example-viewer"]');
  const [built] = await Promise.all([page.waitForEvent("download", { timeout: 60000 }), page.click('[data-testid="example-download"]')]);
  const builtPath = path.join(TMP, "built.pdf");
  await built.saveAs(builtPath);
  const builtPages = (fs.readFileSync(builtPath).toString("latin1").match(/\/Type\s*\/Page[^s]/g) || []).length;
  check(builtPages === 2, "sans PDF d'origine, le téléchargement fabrique un PDF des pages", `${builtPages} pages`);
  await page.keyboard.press("Escape");

  // Une présentation faite dans l'app.
  await page.click('[data-testid="examples-add"]');
  await page.click('[data-testid="example-tab-deck"]');
  await page.waitForSelector("[data-pick-deck]");
  await page.locator("[data-pick-deck]").first().click();
  const deckTitle = await page.inputValue('[data-testid="example-title"]');
  await publish();
  examples = await examplesStored();
  const fromDeck = examples.find((e) => e.title === deckTitle);
  check(!!fromDeck && fromDeck.pages.length === 8 && fromDeck.pages[0].w === 1920, "une présentation de l'app devient un exemple (8 pages)", fromDeck ? String(fromDeck.pages.length) : "absent");
  check(new Set(examples.map((e) => e.id)).size === 3, "trois exemples distincts");

  // Depuis l'éditeur : la galerie, puis la visionneuse à sa place.
  await page.locator("[data-deck-id]").first().click();
  await page.waitForSelector('[data-testid="stage"] .el-text');
  await page.click('[data-testid="open-examples"]');
  await page.waitForSelector('[data-testid="examples-grid"]');
  check((await page.locator('[data-testid="examples-grid"] [data-example-id]').count()) === 3, "l'éditeur montre aussi les exemples");
  await page.locator('[data-testid="examples-grid"] [data-example-id]').last().click();
  await page.waitForSelector('[data-testid="example-viewer"]');
  const before2 = await page.locator('[data-testid="stage"] .el').count();
  await page.keyboard.press("Delete");
  await page.keyboard.press("ArrowRight");
  check((await page.locator('[data-testid="example-count"]').innerText()) === "2 / 3", "dans l'éditeur, les flèches tournent les pages de l'exemple…");
  await page.keyboard.press("Escape");
  await page.waitForSelector('[data-testid="examples-grid"]');
  check(true, "… Échap revient à la galerie");
  await page.keyboard.press("Escape");
  await page.waitForSelector('[data-testid="examples-grid"]', { state: "detached" });
  check((await page.locator('[data-testid="stage"] .el').count()) === before2, "… et la diapo n'a pas bougé pendant ce temps");

  // Panel admin : modifier, supprimer (fichiers compris).
  await page.goto(`${BASE}/admin`, { waitUntil: "networkidle" });
  await page.click('[data-testid="admin-tab-examples"]');
  await page.waitForSelector('[data-testid="admin-examples"]');
  check((await page.locator('[data-testid="admin-examples"] [data-example-id]').count()) === 3, "le panel admin liste les exemples");
  const pdfCard = page.locator(`[data-testid="admin-examples"] [data-example-id="${examples.find((e) => e.pdfUrl).id}"]`);
  await pdfCard.getByRole("button", { name: "Modifier" }).click();
  await page.fill('[data-testid="example-edit-title"]', "Atelier Mission locale (2026)");
  await page.click('[data-testid="example-edit-save"]');
  await page.waitForFunction(() => JSON.parse(localStorage.getItem("msd:examples")).some((e) => e.title === "Atelier Mission locale (2026)"));
  check(true, "le staff renomme un exemple");

  // Modifier les pages : réordonner, retirer, ajouter.
  const pdfId = examples.find((e) => e.pdfUrl).id;
  const before3 = (await examplesStored()).find((e) => e.id === pdfId);
  const filesStart = (await idbKeys()).length;
  await pdfCard.getByRole("button", { name: "Modifier" }).click();
  const tiles = page.locator('[data-testid="example-pages"] > div');
  check((await tiles.count()) === 3, "la fenêtre de modification montre les 3 pages");
  await tiles.nth(2).getByRole("button", { name: "Avancer la page" }).click();
  await tiles.nth(1).getByRole("button", { name: "Avancer la page" }).click();
  await tiles.nth(2).dragTo(tiles.nth(1));
  await tiles.nth(1).getByRole("button", { name: "Retirer la page 2" }).click();
  await page.setInputFiles('[data-testid="example-add-input"]', [img2, img1]);
  await page.waitForFunction(() => document.querySelectorAll('[data-testid="example-pages"] > div').length === 4, null, { timeout: 60000 });
  check((await page.locator("text=le PDF d'origine ne sera plus proposé").count()) === 1, "on est prévenu que le PDF d'origine ne correspondra plus");
  await page.click('[data-testid="example-edit-save"]');
  await page.waitForSelector('[role="dialog"][aria-label="Modifier l\'exemple"]', { state: "detached", timeout: 30000 });
  const after3 = (await examplesStored()).find((e) => e.id === pdfId);
  const o = before3.pages.map((pg) => pg.url);
  // Départ 1-2-3 ; la 3 passe devant (3-1-2), puis la 2 glissée avant la 1 (3-2-1), puis la 2 retirée (3-1), plus 2 images.
  check(
    after3.pages.length === 4 && after3.pages[0].url === o[2] && after3.pages[1].url === o[0] && after3.pages.every((pg) => pg.url.startsWith("idb:")),
    "pages réordonnées (flèches et glisser), retirée et ajoutées, enregistrées",
    after3.pages.map((pg) => pg.url.slice(-14)).join(" "),
  );
  check(after3.pdfUrl === null, "le PDF d'origine n'est plus proposé une fois les pages changées");
  check((await idbKeys()).length === filesStart - 2 - 1 + 4, "les fichiers de la page retirée et le PDF d'origine sont supprimés", `${filesStart} → ${(await idbKeys()).length}`);
  await pdfCard.locator("button").first().click();
  await page.waitForSelector('[data-testid="example-viewer"]');
  check((await page.locator('[data-testid="example-count"]').innerText()) === "1 / 4", "la visionneuse montre les nouvelles pages");
  await page.keyboard.press("Escape");

  // Annuler une modification efface les pages envoyées pour rien.
  const filesMid = (await idbKeys()).length;
  await pdfCard.getByRole("button", { name: "Modifier" }).click();
  await page.setInputFiles('[data-testid="example-add-input"]', [img1]);
  await page.waitForFunction(() => document.querySelectorAll('[data-testid="example-pages"] > div').length === 5, null, { timeout: 60000 });
  await page.getByRole("dialog").getByRole("button", { name: "Annuler" }).click();
  await page.waitForTimeout(500);
  check((await idbKeys()).length === filesMid && (await examplesStored()).find((e) => e.id === pdfId).pages.length === 4, "annuler laisse l'exemple intact et efface les pages ajoutées");

  const filesBefore = (await idbKeys()).length;
  await pdfCard.getByRole("button", { name: "Supprimer" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Supprimer" }).click();
  await page.waitForFunction(() => JSON.parse(localStorage.getItem("msd:examples")).length === 2);
  check(filesBefore - (await idbKeys()).length === 8, "supprimer un exemple supprime aussi tous ses fichiers (8)", String(filesBefore - (await idbKeys()).length));

  /* ───────────── Bilan ───────────── */
  section("Console du navigateur");
  check(errors.length === 0, "aucune erreur pendant le parcours", errors.join(" | "));

  await browser.close();
  fs.rmSync(TMP, { recursive: true, force: true });
  console.log(`\n${passed} vérifications réussies, ${failures} échec(s).`);
  process.exit(failures ? 1 : 0);
})().catch((e) => {
  console.error("\nLe parcours s'est arrêté :", process.env.E2E_DEBUG ? e.message : e.message.split("\n")[0]);
  console.error(`${passed} vérifications réussies avant l'arrêt, ${failures} échec(s).`);
  process.exit(1);
});

