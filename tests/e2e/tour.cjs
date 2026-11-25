/**
 * Visite guidée : premier passage, clavier, reprise après rechargement,
 * passage de l'accueil à l'éditeur, fin sur le bouton Aide, relance.
 *
 *   npm run build && npx next start      (mode démo : sans variables Supabase)
 *   node tests/e2e/tour.cjs
 *
 * E2E_URL change l'adresse visée (par défaut http://localhost:3000).
 */

const { chromium } = require("playwright");

const BASE = process.env.E2E_URL || "http://localhost:3000";
let failures = 0;
let passed = 0;
function check(cond, label, detail = "") {
  if (cond) passed += 1;
  else failures += 1;
  console.log(`  ${cond ? "ok  " : "ÉCHEC"} ${label}${!cond && detail ? ` — ${detail}` : ""}`);
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on("console", (m) => m.type() === "error" && errors.push(`console : ${m.text().slice(0, 300)}`));
  page.on("pageerror", (e) => errors.push(`exception : ${e.message.slice(0, 300)}`));

  const step = () => page.locator('[data-testid="tour"]').getAttribute("data-step");
  const count = () => page.locator('[data-testid="tour-count"]').innerText();
  /** Attend que la bulle de l'étape `id` soit affichée. */
  const at = (id) =>
    page.waitForFunction(
      (expected) => {
        const tour = document.querySelector('[data-testid="tour"]');
        const bubble = document.querySelector('[data-testid="tour-bubble"]');
        return tour?.getAttribute("data-step") === expected && bubble && getComputedStyle(bubble).opacity === "1";
      },
      id,
      { timeout: 20000 },
    );
  const next = () => page.click('[data-testid="tour-next"]');
  /** Le projecteur glisse d'un élément à l'autre : on attend qu'il soit posé avant de le mesurer. */
  const holeBox = async () => {
    let last = null;
    for (let i = 0; i < 20; i++) {
      const b = await page.locator('[data-testid="tour-hole"]').boundingBox();
      if (last && b && Math.abs(b.x - last.x) < 0.5 && Math.abs(b.y - last.y) < 0.5 && Math.abs(b.width - last.width) < 0.5) return b;
      last = b;
      await page.waitForTimeout(100);
    }
    return last;
  };
  const gone = () => page.waitForSelector('[data-testid="tour"]', { state: "detached", timeout: 10000 });

  console.log("Premier passage");
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: "networkidle" });
  await at("welcome");
  check((await count()) === "Étape 1 sur 12", "à la première visite, la visite démarre d'elle-même (12 étapes sans rôle staff)", await count());
  check((await page.locator("#tour-title").innerText()).toLowerCase().includes("bienvenue"), "elle commence par un mot de bienvenue");

  // Le reste de la page est inaccessible pendant la visite.
  await page.mouse.click(30, 880);
  await page.locator('[data-testid="new-blank"]').click({ force: true, timeout: 2000 }).catch(() => undefined);
  await page.waitForTimeout(400);
  check(page.url() === `${BASE}/` && (await step()) === "welcome", "les clics hors de la bulle ne font rien");

  await page.keyboard.press("ArrowRight");
  await at("new-deck");
  const hole = await holeBox();
  const target = await page.locator('[data-tour="new-deck"]').boundingBox();
  check(Math.abs(hole.x - (target.x - 8)) < 2 && Math.abs(hole.width - (target.width + 16)) < 2, "le projecteur entoure l'élément présenté");
  await page.keyboard.press("ArrowLeft");
  await at("welcome");
  await page.keyboard.press("ArrowRight");
  await at("new-deck");
  check(true, "les flèches du clavier avancent et reculent");

  await next();
  await at("examples");
  await page.reload({ waitUntil: "networkidle" });
  await at("examples");
  check((await count()) === "Étape 3 sur 12", "après un rechargement, la visite reprend où elle en était");

  await next();
  await at("my-decks");
  await next();
  await at("open-editor");
  check((await page.locator('[data-testid="tour-next"]').innerText()).includes("Créer ma présentation"), "avant l'éditeur, la bulle propose de créer sa présentation");
  // Les clics passent sur l'élément éclairé : on ouvre l'éditeur depuis un modèle plutôt que par la bulle.
  await page.locator('[data-template-id="b:modele-deck-formation"]').click();
  await page.waitForURL(/\/editor\//, { timeout: 20000 });
  await at("slides");
  check((await count()) === "Étape 6 sur 12", "ouvrir l'éditeur, par n'importe quel chemin, fait continuer la visite", await count());

  await next();
  await at("library");
  await next();
  await at("toolbar");
  check((await page.locator('[data-testid="toolbar"]').count()) === 1 && (await page.locator('[data-testid="selection-box"]').count()) === 1, "pour la barre d'outils, un texte est sélectionné et sa barre apparaît");
  const before = await page.locator('[data-testid="stage"] .el').count();
  await page.keyboard.press("Delete");
  await page.keyboard.press("Control+z");
  check((await page.locator('[data-testid="stage"] .el').count()) === before && (await step()) === "toolbar", "les raccourcis de l'éditeur sont neutralisés pendant la visite");
  await next();
  await at("inspiration");
  check((await page.locator('[data-testid="selection-box"]').count()) === 0, "la sélection faite pour la démonstration est retirée ensuite");
  await next();
  await at("autosave");
  await next();
  await at("share");
  await next();
  await at("help");
  const help = await page.locator('[data-testid="open-help"]').boundingBox();
  const hole2 = await holeBox();
  check(Math.abs(hole2.x + hole2.width / 2 - (help.x + help.width / 2)) < 2, "la dernière étape montre le bouton Aide");
  check((await page.locator('[data-testid="tour-next"]').innerText()).includes("Terminer"), "… avec « Terminer »");
  await next();
  await gone();
  check((await page.evaluate(() => localStorage.getItem("msd:onboarded:local"))) === "1", "terminée, la visite est notée comme vue");

  console.log("\nVisites suivantes");
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.waitForSelector("[data-deck-id]");
  await page.waitForTimeout(800);
  check((await page.locator('[data-testid="tour"]').count()) === 0, "elle ne revient pas d'elle-même");

  await page.click('[data-testid="replay-tour"]');
  await at("welcome");
  check((await count()) === "Étape 1 sur 12", "le bouton « Visite guidée » de l'accueil la relance en entier");
  await page.click('[data-testid="tour-skip"]');
  await gone();
  check(true, "« Passer la visite » la ferme");

  await page.locator("[data-deck-id]").first().click();
  await page.waitForSelector('[data-testid="stage"] .el-text');
  await page.click('[data-testid="open-help"]');
  await page.click('[data-testid="help-replay-tour"]');
  await at("slides");
  check((await count()) === "Étape 1 sur 7", "depuis l'aide, elle rejoue les 7 étapes de l'éditeur", await count());
  await page.keyboard.press("Escape");
  await gone();
  check(true, "Échap la ferme");

  console.log("\nStaff");
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.check('[data-testid="demo-staff"]');
  await page.click('[data-testid="replay-tour"]');
  await at("welcome");
  check((await count()) === "Étape 1 sur 13", "avec le rôle staff, une étape de plus", await count());
  for (const id of ["new-deck", "examples", "my-decks", "admin"]) {
    await next();
    await at(id);
  }
  // Le projecteur glisse jusqu'au bouton : on lui laisse le temps d'arriver.
  const onAdmin = await page
    .waitForFunction(
      () => {
        const a = document.querySelector('[data-tour="admin"]')?.getBoundingClientRect();
        const h = document.querySelector('[data-testid="tour-hole"]')?.getBoundingClientRect();
        return !!a && !!h && Math.abs(h.y + h.height / 2 - (a.y + a.height / 2)) < 2;
      },
      null,
      { timeout: 3000 },
    )
    .then(() => true)
    .catch(() => false);
  check(onAdmin, "… qui montre le panel admin");
  await page.click('[data-testid="tour-skip"]');
  await gone();

  check(errors.length === 0, "aucune erreur pendant le parcours", errors.join(" | "));
  await browser.close();
  console.log(`\n${passed} vérifications réussies, ${failures} échec(s).`);
  process.exit(failures ? 1 : 0);
})().catch((e) => {
  console.error("\nLe parcours s'est arrêté :", e.message.split("\n")[0]);
  console.error(`${passed} vérifications réussies avant l'arrêt, ${failures} échec(s).`);
  process.exit(1);
});
