/**
 * Chaque élément de la bibliothèque qui contient du texte reçoit un texte
 * long : aucune lettre ne doit sortir de son fond (étiquette, badge,
 * pastille) ni de la forme qui l'entoure (carte, marche de podium).
 *
 *   node tests/e2e/responsive.cjs     (application sur http://localhost:3000, ou E2E_URL)
 *   E2E_SHOTS=dossier node tests/e2e/responsive.cjs   pour garder une capture par élément
 */
const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");

const BASE = process.env.E2E_URL || "http://localhost:3000";
const SHOTS = process.env.E2E_SHOTS;
const LONG = "Loann et un texte bien plus long";
const TOL = 2;
const near = (a, b, tol = 1.5) => Math.abs(a - b) <= tol;

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
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));

  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem("msd:onboarded:local", "1");
  });
  await page.reload({ waitUntil: "networkidle" });
  await page.click('[data-testid="new-blank"]');
  await page.waitForSelector('[data-testid="stage"] .el-text', { timeout: 30000 });
  await page.evaluate(() => document.fonts.ready);

  // Tous les éléments de la bibliothèque, onglet par onglet.
  const ids = [];
  for (const tab of await page.locator('[data-testid="library"] [role="tab"]').all()) {
    await tab.click();
    for (const id of await page.locator("[data-asset-id]").evaluateAll((n) => n.map((e) => e.getAttribute("data-asset-id")))) {
      if (!ids.includes(id)) ids.push(id);
    }
  }

  const clear = async () => {
    await page.keyboard.press("Escape");
    await page.keyboard.press("Escape");
    await page.locator('[data-testid="stage"]').click({ position: { x: 4, y: 4 } });
    await page.keyboard.press("Control+a");
    await page.keyboard.press("Delete");
  };

  let tested = 0;
  for (const id of ids) {
    await clear();
    const tab = await page.locator('[data-testid="library"] [role="tab"]').all();
    let found = false;
    for (const t of tab) {
      await t.click();
      if (await page.locator(`[data-asset-id="${id}"]`).count()) {
        found = true;
        break;
      }
    }
    if (!found) continue;
    await page.locator(`[data-asset-id="${id}"]`).first().click();
    await page.waitForTimeout(150);
    const n = await page.locator('[data-testid="stage"] .el-text').count();
    if (!n) continue;
    tested += 1;

    // Chaque texte, du dernier posé au premier (les textes du dessus d'abord).
    for (let i = n - 1; i >= 0; i -= 1) {
      const t = page.locator('[data-testid="stage"] .el-text').nth(i);
      const b = await t.boundingBox();
      await page.keyboard.press("Escape");
      await page.keyboard.press("Escape");
      await page.mouse.dblclick(b.x + b.width / 2, b.y + b.height / 2);
      // Dans un groupe, le premier double-clic sélectionne l'élément, le suivant l'ouvre.
      if (!(await page.locator('.tx[contenteditable="true"]').count())) await page.mouse.dblclick(b.x + b.width / 2, b.y + b.height / 2);
      if (!(await page.locator('.tx[contenteditable="true"]').count())) continue;
      await page.keyboard.press("Control+a");
      await page.keyboard.type(LONG);
      await page.keyboard.press("Escape");
    }
    await page.keyboard.press("Escape");
    await page.waitForTimeout(250);

    const problems = await page.evaluate((tol) => {
      const stage = document.querySelector('[data-testid="stage"]');
      const rectOf = (n) => n.getBoundingClientRect();
      const inside = (a, b) => a.left >= b.left - tol && a.right <= b.right + tol && a.top >= b.top - tol && a.bottom <= b.bottom + tol;
      const out = [];
      const inks = [];
      // Rectangles des lignes réellement écrites (sans les espaces pendants).
      const lines = (tx) =>
        [...tx.children].map((div) => {
          const r = document.createRange();
          r.selectNodeContents(div);
          const rr = r.getBoundingClientRect();
          return { left: rr.left, right: rr.right, top: rr.top, bottom: rr.bottom };
        });
      const shapes = [...stage.querySelectorAll(".el-shape")].filter((s) => !s.querySelector("svg")).map(rectOf);
      for (const el of stage.querySelectorAll(".el-text")) {
        const tx = el.querySelector(".tx");
        const box = el.querySelector(".tx-box");
        const range = document.createRange();
        range.selectNodeContents(tx);
        const ink = range.getBoundingClientRect();
        const label = tx.innerText.slice(0, 30);
        // Verticalement seulement : en fin de ligne coupée, l'espace « pend » au-delà du bord, sans rien dessiner.
        const fr = rectOf(el);
        // Avec un interligne serré, l'enveloppe de la police dépasse la ligne d'environ 0,1 em : ce n'est pas un débordement.
        const em = parseFloat(getComputedStyle(tx).fontSize) * 0.12;
        if (ink.top < fr.top - tol - em || ink.bottom > fr.bottom + tol + em) out.push(`« ${label} » sort de son cadre`);
        inks.push({ label, r: lines(tx) });
        const bg = getComputedStyle(box).backgroundColor;
        if (bg !== "rgba(0, 0, 0, 0)" && !inside(ink, rectOf(box))) out.push(`« ${label} » sort de son fond`);
        // Une forme qui contenait le centre du texte doit contenir tout le texte.
        const f = rectOf(el);
        const cx = (f.left + f.right) / 2;
        const top = f.top + 2;
        for (const s of shapes) {
          if (cx > s.left && cx < s.right && top > s.top && top < s.bottom && !inside(ink, s)) out.push(`« ${label} » sort de sa carte`);
        }
      }
      // Deux textes ne se recouvrent jamais.
      const hit = (a, b) => a.left < b.right - tol && b.left < a.right - tol && a.top < b.bottom - tol && b.top < a.bottom - tol;
      for (let i = 0; i < inks.length; i += 1)
        for (let j = i + 1; j < inks.length; j += 1)
          if (inks[i].r.some((a) => inks[j].r.some((b) => hit(a, b)))) out.push(`« ${inks[i].label} » recouvre « ${inks[j].label} »`);
      return out;
    }, TOL);
    if (SHOTS) {
      fs.mkdirSync(SHOTS, { recursive: true });
      await page.locator('[data-testid="slide-box"]').screenshot({ path: path.join(SHOTS, `${id.replace(/[^a-z0-9-]/gi, "_")}.png`) });
    }
    check(problems.length === 0, `${id} : le texte long reste dans son fond`, problems.join(" ; "));
  }

  // Hauteur fixée (badge, étiquettes des modèles) : un passage à la ligne agrandit le fond.
  await clear();
  await page.getByRole("tab", { name: "Étiquettes" }).click();
  await page.click('[data-asset-id="b:badge-vert"]');
  const badge = page.locator('[data-testid="stage"] .el-text').last();
  const h0 = (await badge.locator(".tx-box").boundingBox()).height;
  const bb = await badge.boundingBox();
  await page.mouse.dblclick(bb.x + bb.width / 2, bb.y + bb.height / 2);
  await page.waitForSelector('.tx[contenteditable="true"]');
  await page.keyboard.press("Control+a");
  await page.keyboard.type("Ligne 1");
  await page.keyboard.press("Enter");
  await page.keyboard.type("Ligne 2");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(200);
  const box2 = await badge.locator(".tx-box").boundingBox();
  const ink2 = await badge.locator(".tx").evaluate((n) => {
    const r = document.createRange();
    r.selectNodeContents(n);
    const b = r.getBoundingClientRect();
    return { top: b.top, bottom: b.bottom };
  });
  check(box2.height > h0 * 1.6 && ink2.top >= box2.y - TOL && ink2.bottom <= box2.y + box2.height + TOL, "un badge sur deux lignes grandit en hauteur", `${h0} → ${box2.height}`);
  await page.waitForTimeout(1200);
  await page.waitForSelector('[data-testid="save-state"][data-state="saved"]', { timeout: 15000 });
  const stored = await page.evaluate((id) => JSON.parse(localStorage.getItem("msd:decks"))[id].slides[0].els.at(-1), page.url().split("/").pop());
  check(stored.minH === 80 && stored.h > 120, "… et garde sa hauteur d'origine comme minimum", `h ${stored.h}, minH ${stored.minH}`);
  await page.keyboard.press("Control+z");
  await page.waitForTimeout(200);
  check(near((await badge.locator(".tx-box").boundingBox()).height, h0), "annuler lui rend sa taille d'origine");

  check(tested >= 10, `éléments avec du texte testés : ${tested}`);
  check(errors.length === 0, "aucune erreur dans la page", errors.join(" | "));
  console.log(`\n${passed} vérifications réussies, ${failures} échec(s).`);
  await browser.close();
  process.exit(failures ? 1 : 0);
})();
