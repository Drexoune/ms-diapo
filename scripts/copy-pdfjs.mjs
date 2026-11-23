// Copie les fichiers dont pdf.js a besoin dans le navigateur (le « worker »
// et ses décodeurs) vers public/pdfjs, depuis la version installée : ils
// restent ainsi toujours de la même version que la bibliothèque.
// Lancé automatiquement après `npm install` et avant `npm run dev` / `build`.
import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = join(root, "node_modules", "pdfjs-dist");
const dest = join(root, "public", "pdfjs");

if (!existsSync(src)) {
  console.warn("copy-pdfjs : pdfjs-dist n'est pas installé, rien à copier.");
  process.exit(0);
}

rmSync(dest, { recursive: true, force: true });
mkdirSync(dest, { recursive: true });
cpSync(join(src, "legacy", "build", "pdf.worker.min.mjs"), join(dest, "pdf.worker.min.mjs"));
for (const dir of ["wasm", "iccs", "standard_fonts"]) cpSync(join(src, dir), join(dest, dir), { recursive: true });
console.log("copy-pdfjs : fichiers de pdf.js copiés dans public/pdfjs");
