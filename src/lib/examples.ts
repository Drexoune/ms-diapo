"use client";

import { data } from "./backend";
import { renderSlidesToCanvas, safeFileName } from "./export";
import { uuid } from "./ids";
import type { Example, ExamplePage, Slide } from "./types";

/**
 * Rubrique Exemples : transforme une ancienne présentation (PDF, images, ou
 * présentation faite dans l'app) en pages-images consultables par tous.
 *
 * Tout se passe dans le navigateur de la personne du staff qui dépose
 * l'exemple : chaque page est dessinée sur un canevas, enregistrée en image
 * (et en miniature), puis envoyée. Les autres n'ont qu'à afficher des images.
 */

/** Côté le plus long d'une page, en pixels : net en plein écran sur un écran 1080p. */
export const PAGE_MAX_SIDE = 1920;
export const THUMB_WIDTH = 400;
export const MAX_PAGES = 300;
/** Au-delà, le PDF d'origine n'est pas gardé (plafond par fichier de l'offre gratuite de Supabase). */
export const MAX_PDF_BYTES = 50 * 1024 * 1024;
export const MAX_SOURCE_BYTES = 200 * 1024 * 1024;

export type ExampleSource = { kind: "pdf"; file: File } | { kind: "images"; files: File[] } | { kind: "deck"; slides: Slide[] };

export interface PublishProgress {
  phase: "pages" | "pdf" | "save";
  done: number;
  total: number;
}

export interface ExampleMeta {
  title: string;
  author: string;
  description: string;
}

export const isPdf = (f: File) => f.type === "application/pdf" || /\.pdf$/i.test(f.name);
export const isImage = (f: File) => /^image\/(png|jpeg|webp|gif)$/.test(f.type);

/** Titre proposé d'après un nom de fichier : « diapo-mission_locale.pdf » → « Diapo mission locale ». */
export function titleFromFileName(name: string): string {
  const base = name
    .replace(/\.[a-z0-9]{2,4}$/i, "")
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return base ? base.charAt(0).toUpperCase() + base.slice(1) : "";
}

/** Tri « naturel » : page2 avant page10. */
export function sortByName(files: File[]): File[] {
  return [...files].sort((a, b) => a.name.localeCompare(b.name, "fr", { numeric: true, sensitivity: "base" }));
}

/* ───────────── Images ───────────── */

function toBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

/**
 * WebP quand le navigateur sait l'écrire, JPEG sinon (certains navigateurs
 * renvoient du PNG, bien trop lourd, quand on leur demande du WebP).
 */
async function encode(canvas: HTMLCanvasElement, quality: number): Promise<{ blob: Blob; ext: string }> {
  const webp = await toBlob(canvas, "image/webp", quality);
  if (webp && webp.type === "image/webp") return { blob: webp, ext: "webp" };
  const jpeg = await toBlob(canvas, "image/jpeg", quality);
  if (!jpeg) throw new Error("Conversion de la page en image impossible.");
  return { blob: jpeg, ext: "jpg" };
}

/** Copie réduite d'une image sur fond blanc (le JPEG ne connaît pas la transparence). */
function drawScaled(src: CanvasImageSource, sw: number, sh: number, maxSide: number, byWidth = false): HTMLCanvasElement {
  const k = Math.min(1, byWidth ? maxSide / sw : maxSide / Math.max(sw, sh));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(sw * k));
  canvas.height = Math.max(1, Math.round(sh * k));
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(src, 0, 0, canvas.width, canvas.height);
  return canvas;
}

interface EncodedPage {
  full: { blob: Blob; ext: string };
  thumb: { blob: Blob; ext: string };
  w: number;
  h: number;
}

async function encodePage(canvas: HTMLCanvasElement): Promise<EncodedPage> {
  const full = await encode(canvas, 0.86);
  const thumb = await encode(drawScaled(canvas, canvas.width, canvas.height, THUMB_WIDTH, true), 0.8);
  return { full, thumb, w: canvas.width, h: canvas.height };
}

/* ───────────── Sources ───────────── */

type OnCanvas = (canvas: HTMLCanvasElement, index: number, total: number) => Promise<void>;

async function loadPdfjs() {
  // Version « legacy » : la plus compatible (Safari, navigateurs un peu anciens).
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc = "/pdfjs/pdf.worker.min.mjs";
  return pdfjs;
}

/** Nombre de pages d'un PDF (pour l'afficher avant l'envoi). */
export async function countPdfPages(file: File): Promise<number> {
  const pdfjs = await loadPdfjs();
  const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()), wasmUrl: "/pdfjs/wasm/", iccUrl: "/pdfjs/iccs/" });
  try {
    return (await task.promise).numPages;
  } finally {
    await task.destroy();
  }
}

async function renderPdf(file: File, onCanvas: OnCanvas): Promise<void> {
  const pdfjs = await loadPdfjs();
  const task = pdfjs.getDocument({
    data: new Uint8Array(await file.arrayBuffer()),
    wasmUrl: "/pdfjs/wasm/",
    iccUrl: "/pdfjs/iccs/",
    standardFontDataUrl: "/pdfjs/standard_fonts/",
    disableWorkerRendering: true,
  });
  let doc;
  try {
    doc = await task.promise;
  } catch (e) {
    await task.destroy();
    const name = (e as { name?: string })?.name;
    if (name === "PasswordException") throw new Error("Ce PDF est protégé par un mot de passe : exporte-le sans protection.");
    throw new Error("Ce fichier n'a pas pu être lu comme un PDF.");
  }
  try {
    if (doc.numPages > MAX_PAGES) throw new Error(`Ce PDF a ${doc.numPages} pages : ${MAX_PAGES} au maximum.`);
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const base = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: PAGE_MAX_SIDE / Math.max(base.width, base.height) });
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(viewport.width);
      canvas.height = Math.round(viewport.height);
      await page.render({ canvas, viewport }).promise;
      page.cleanup();
      await onCanvas(canvas, i - 1, doc.numPages);
      canvas.width = canvas.height = 0; // libère la mémoire du canevas
    }
  } finally {
    await task.destroy();
  }
}

async function renderImages(files: File[], onCanvas: OnCanvas): Promise<void> {
  if (files.length > MAX_PAGES) throw new Error(`${files.length} images : ${MAX_PAGES} au maximum.`);
  const sorted = sortByName(files);
  for (const [i, file] of sorted.entries()) {
    let bitmap: ImageBitmap;
    try {
      bitmap = await createImageBitmap(file);
    } catch {
      throw new Error(`L'image « ${file.name} » n'a pas pu être lue.`);
    }
    const canvas = drawScaled(bitmap, bitmap.width, bitmap.height, PAGE_MAX_SIDE);
    bitmap.close();
    await onCanvas(canvas, i, sorted.length);
  }
}

/* ───────────── Publication ───────────── */

/**
 * Au plus `n` tâches à la fois : attend une place libre, lance la tâche et
 * rend sa promesse sans l'attendre (l'objet évite qu'`await` ne la déballe).
 * Une tâche en échec fait échouer l'attente suivante : on s'arrête tôt.
 */
function limiter(n: number) {
  const running = new Set<Promise<void>>();
  return async (task: () => Promise<void>): Promise<{ done: Promise<void> }> => {
    while (running.size >= n) await Promise.race(running);
    const p = task();
    running.add(p);
    p.then(
      () => running.delete(p),
      () => running.delete(p),
    );
    return { done: p };
  };
}

/**
 * Convertit la source en pages et envoie leurs fichiers dans le dossier de
 * l'exemple. `prefix` distingue les fichiers d'un ajout ultérieur de ceux
 * déjà présents. En cas d'échec, les fichiers déjà envoyés sont supprimés.
 */
async function uploadPages(source: ExampleSource, exampleId: string, prefix: string, onProgress: (p: PublishProgress) => void): Promise<ExamplePage[]> {
  const pages: ExamplePage[] = [];
  const uploads: Promise<void>[] = [];
  const queue = limiter(3);
  let total = source.kind === "images" ? source.files.length : source.kind === "deck" ? source.slides.length : 0;
  let done = 0;

  const onCanvas: OnCanvas = async (canvas, index, count) => {
    total = count;
    onProgress({ phase: "pages", done, total });
    const page = await encodePage(canvas);
    const n = prefix + String(index + 1).padStart(3, "0");
    // La page suivante se prépare pendant que celle-ci part.
    const { done: uploaded } = await queue(async () => {
      const [url, thumb] = await Promise.all([
        data.uploadExampleFile(exampleId, `p${n}.${page.full.ext}`, page.full.blob),
        data.uploadExampleFile(exampleId, `t${n}.${page.thumb.ext}`, page.thumb.blob),
      ]);
      pages[index] = { url, thumb, w: page.w, h: page.h };
      done += 1;
      onProgress({ phase: "pages", done, total });
    });
    uploads.push(uploaded);
  };

  try {
    if (source.kind === "pdf") await renderPdf(source.file, onCanvas);
    else if (source.kind === "images") await renderImages(source.files, onCanvas);
    else await renderSlidesToCanvas(source.slides, onCanvas);
    await Promise.all(uploads);
    if (!pages.length) throw new Error("Aucune page trouvée.");
    return pages;
  } catch (e) {
    await Promise.allSettled(uploads);
    const sent = pages.filter(Boolean).flatMap((pg) => [pg.url, pg.thumb]);
    if (sent.length) await data.deleteExampleFiles(exampleId, sent).catch(() => undefined);
    throw e;
  }
}

/** Publie un nouvel exemple. En cas d'échec, ce qui a déjà été envoyé est supprimé. */
export async function publishExample(source: ExampleSource, meta: ExampleMeta, onProgress: (p: PublishProgress) => void): Promise<Example> {
  const id = uuid();
  try {
    const pages = await uploadPages(source, id, "", onProgress);
    const done = pages.length;
    let pdfUrl: string | null = null;
    if (source.kind === "pdf" && source.file.size <= MAX_PDF_BYTES) {
      onProgress({ phase: "pdf", done, total: done });
      pdfUrl = await data.uploadExampleFile(id, "original.pdf", new Blob([source.file], { type: "application/pdf" }));
    }
    onProgress({ phase: "save", done, total: done });
    return await data.createExample({
      id,
      title: meta.title.trim().slice(0, 120),
      author: meta.author.trim().slice(0, 80),
      description: meta.description.trim().slice(0, 600),
      pages,
      pdfUrl,
    });
  } catch (e) {
    await data.deleteExample(id).catch(() => undefined);
    throw e;
  }
}

/**
 * Prépare des pages à ajouter à un exemple existant (PDF ou images). Les
 * fichiers sont envoyés tout de suite ; l'exemple, lui, n'est modifié qu'à
 * l'enregistrement.
 */
export function addExamplePages(exampleId: string, source: ExampleSource, onProgress: (p: PublishProgress) => void): Promise<ExamplePage[]> {
  return uploadPages(source, exampleId, `-${uuid().slice(0, 8)}-`, onProgress);
}

/** Fichiers à supprimer quand des pages sont retirées d'un exemple. */
export function pageFiles(pages: ExamplePage[]): string[] {
  return pages.flatMap((p) => [p.url, p.thumb]);
}

/* ───────────── Téléchargement ───────────── */

function saveBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Une page n'a pas pu être chargée."));
    img.src = src;
  });
}

/**
 * Télécharge un exemple en PDF : le fichier d'origine s'il existe, sinon un
 * PDF fabriqué à partir des pages.
 */
export async function downloadExample(example: Example, onProgress?: (done: number, total: number) => void): Promise<void> {
  const name = `${safeFileName(example.title)}.pdf`;
  if (example.pdfUrl) {
    const res = await fetch(example.pdfUrl);
    if (!res.ok) throw new Error("Le PDF n'a pas pu être téléchargé.");
    saveBlob(await res.blob(), name);
    return;
  }
  const { jsPDF } = await import("jspdf");
  let pdf: InstanceType<typeof jsPDF> | null = null;
  for (const [i, page] of example.pages.entries()) {
    const img = await loadImage(page.url);
    // Passage par un canevas : le PDF reçoit du JPEG, quel que soit le format de la page.
    const jpeg = drawScaled(img, img.naturalWidth, img.naturalHeight, PAGE_MAX_SIDE).toDataURL("image/jpeg", 0.9);
    const orientation = page.w >= page.h ? "landscape" : "portrait";
    if (!pdf) pdf = new jsPDF({ orientation, unit: "px", format: [page.w, page.h], hotfixes: ["px_scaling"], compress: true });
    else pdf.addPage([page.w, page.h], orientation);
    pdf.addImage(jpeg, "JPEG", 0, 0, page.w, page.h, undefined, "FAST");
    onProgress?.(i + 1, example.pages.length);
  }
  if (!pdf) return;
  pdf.setProperties({ title: example.title });
  pdf.save(name);
}
