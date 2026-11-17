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
  await page.evaluate(() => localStorage.clear());
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
  await page.locator('[data-asset-id="b:coeur"] button').click();
  await page.waitForFunction(() => (localStorage.getItem("msd:hidden") || "").includes("b:coeur"));
  check(true, "le staff masque un élément du pack de départ");
  await shot("admin");

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
  check((await page.locator('[data-testid="library"]').getByText("sticker test").count()) === 1, "l'image ajoutée apparaît dans la bibliothèque de l'éditeur");
  check((await page.locator('[data-asset-id="b:coeur"]').count()) === 0, "l'élément masqué n'y est plus");

  await clickEl(texts().nth(1));
  await toolbar().locator('button[aria-label="Plus d\'options"]').click();
  await page.click("text=Ajouter à la bibliothèque (staff)");
  await page.fill('[data-testid="save-asset-name"]', "Mon titre maison");
  await page.click('[data-testid="save-asset-submit"]');
  await page.waitForFunction(() => JSON.parse(localStorage.getItem("msd:assets") || "[]").length === 2);
  const block = (await stored("msd:assets"))[1];
  check(block.kind === "elements" && block.elements.length === 1 && block.elements[0].x === 0 && block.elements[0].y === 0, "une sélection devient un élément de bibliothèque, recalé à l'origine");

  await page.click('[data-testid="open-templates"]');
  await page.click('[data-testid="save-slide-template"]');
  await page.fill('[data-testid="save-template-name"]', "Diapo maison");
  await page.click('[data-testid="save-template-submit"]');
  await page.waitForFunction(() => JSON.parse(localStorage.getItem("msd:templates") || "[]").length === 2);
  templates = await stored("msd:templates");
  check(templates[1].name === "Diapo maison" && templates[1].kind === "slide", "« Cette diapo → modèle » crée un modèle");

  /* ───────────── Bilan ───────────── */
  section("Console du navigateur");
  check(errors.length === 0, "aucune erreur pendant le parcours", errors.join(" | "));

  await browser.close();
  fs.rmSync(TMP, { recursive: true, force: true });
  console.log(`\n${passed} vérifications réussies, ${failures} échec(s).`);
  process.exit(failures ? 1 : 0);
})().catch((e) => {
  console.error("\nLe parcours s'est arrêté :", e.message.split("\n")[0]);
  console.error(`${passed} vérifications réussies avant l'arrêt, ${failures} échec(s).`);
  process.exit(1);
});

