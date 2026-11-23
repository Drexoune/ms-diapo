/**
 * Mode invité : depuis l'écran de connexion, on doit pouvoir essayer
 * l'application sans compte Discord.
 *
 * Demande une application construite AVEC les variables Supabase (une
 * adresse factice suffit : le mode invité ne dépend pas du serveur) :
 *
 *   NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54399 NEXT_PUBLIC_SUPABASE_ANON_KEY=test npm run build
 *   npx next start -p 3001
 *   E2E_URL=http://localhost:3001 node tests/e2e/guest.cjs
 */

const { chromium } = require("playwright");

const BASE = process.env.E2E_URL || "http://localhost:3001";
let failures = 0;
let passed = 0;
function check(cond, label, detail = "") {
  if (cond) passed += 1;
  else failures += 1;
  console.log(`  ${cond ? "ok  " : "ÉCHEC"} ${label}${!cond && detail ? ` — ${detail}` : ""}`);
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 988 } });
  // Les requêtes vers l'adresse Supabase factice échouent : seules les exceptions de l'application comptent ici.
  const exceptions = [];
  page.on("pageerror", (e) => exceptions.push(e.message.slice(0, 300)));
  const saved = () => page.waitForSelector('[data-testid="save-state"][data-state="saved"]', { timeout: 15000 });

  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForSelector('[data-testid="signin"]');
  check((await page.locator('[data-testid="guest"]').count()) === 1, "l'écran de connexion propose « Essayer sans compte »");
  if (process.env.E2E_SHOTS) await page.screenshot({ path: `${process.env.E2E_SHOTS}/invite-connexion.png` });

  await page.click('[data-testid="guest"]');
  await page.waitForSelector('[data-testid="new-blank"]');
  await page.waitForSelector('[data-testid="tour-bubble"]');
  check((await page.locator('[data-testid="tour"]').getAttribute("data-step")) === "welcome", "à sa première venue, un invité a droit à la visite guidée");
  await page.click('[data-testid="tour-skip"]');
  await page.waitForSelector('[data-testid="tour"]', { state: "detached" });
  check((await page.locator('[data-testid="guest-banner"]').count()) === 1, "le mode invité ouvre l'accueil, avec un bandeau explicite");
  // Le serveur factice ne répond pas : le client Supabase réessaie quelques secondes avant d'abandonner.
  await page.waitForFunction(() => !/Chargement/.test(document.querySelector('[data-testid="examples-section"]')?.textContent || ""), null, { timeout: 30000 });
  check((await page.locator('[data-testid="examples-section"]').innerText()).includes("Aucun exemple"), "sans serveur joignable, la rubrique Exemples reste simplement vide");
  check((await page.locator("text=Invité").count()) >= 1, "la personne est nommée « Invité »");
  check((await page.locator('[data-testid="admin-link"]').count()) === 0 && (await page.locator('[data-testid="demo-staff"]').count()) === 0, "aucun accès staff, ni réel ni simulé");
  if (process.env.E2E_SHOTS) await page.screenshot({ path: `${process.env.E2E_SHOTS}/invite-accueil.png` });

  await page.click('[data-testid="new-blank"]');
  await page.waitForSelector('[data-testid="stage"] .el-text', { timeout: 30000 });
  await page.click('[data-testid="add-text"]');
  await page.waitForSelector('.tx[contenteditable="true"]');
  await page.keyboard.type("Essai en invité");
  await page.keyboard.press("Escape");
  await saved();
  check(true, "un invité crée et modifie une présentation");
  check((await page.locator("[data-asset-id]").count()) > 5, "la bibliothèque de départ est disponible");
  await page.click('[data-testid="open-templates"]');
  check((await page.locator('[data-testid="template-grid"] [data-template-id]').count()) >= 20, "les modèles aussi");
  await page.keyboard.press("Escape");
  check((await page.locator('[data-testid="library-add"]').count()) === 0, "pas de bouton d'ajout à la bibliothèque pour un invité");

  const url = page.url();
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForSelector('[data-testid="stage"] .el-text');
  check((await page.locator('[data-testid="stage"] .el-text').last().innerText()).toLowerCase() === "essai en invité", "la présentation est conservée après rechargement");

  await page.goto(`${BASE}/admin`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector('[data-testid="admin-denied"]');
  check(true, "le panel admin reste fermé à un invité");

  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("[data-deck-id]");
  await page.click('[data-testid="signout"]');
  await page.waitForSelector('[data-testid="signin"]');
  check(true, "quitter le mode invité ramène à l'écran de connexion");
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.waitForSelector('[data-testid="signin"]');
  check(true, "hors session, l'adresse d'une présentation renvoie à la connexion");
  await page.click('[data-testid="guest"]');
  await page.waitForSelector("[data-deck-id]");
  check(true, "en revenant en invité, on retrouve sa présentation");
  await page.waitForTimeout(800);
  check((await page.locator('[data-testid="tour"]').count()) === 0, "… sans revoir la visite guidée");

  check(exceptions.length === 0, "aucune exception pendant le parcours", exceptions.join(" | "));
  await browser.close();
  console.log(`\n${passed} vérifications réussies, ${failures} échec(s).`);
  process.exit(failures ? 1 : 0);
})().catch((e) => {
  console.error("\nLe parcours s'est arrêté :", e.message.split("\n")[0]);
  process.exit(1);
});
