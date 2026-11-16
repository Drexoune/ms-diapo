"use client";

import { createRoot } from "react-dom/client";
import { SlideContent } from "@/components/slide/SlideView";
import { FONTS, fontFaceCss } from "./fonts";
import { SLIDE_H, SLIDE_W, type FontId, type Slide } from "./types";

/**
 * Export des diapos en images, PDF ou archive.
 *
 * Chaque diapo est rendue hors écran par le même composant que l'éditeur,
 * puis photographiée. Les polices sont embarquées dans l'image : sans cela
 * le navigateur retomberait sur une police système pendant la capture.
 */

function usedFonts(slides: Slide[]): Set<FontId> {
  const set = new Set<FontId>();
  for (const s of slides) for (const el of s.els) if (el.type === "text") set.add(el.font);
  return set;
}

const fontData = new Map<string, string>();

async function toDataUrl(url: string): Promise<string> {
  const hit = fontData.get(url);
  if (hit) return hit;
  const blob = await (await fetch(url)).blob();
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
  fontData.set(url, dataUrl);
  return dataUrl;
}

async function embeddedFontCss(fonts: Set<FontId>): Promise<string> {
  const urls = FONTS.filter((f) => fonts.has(f.id)).flatMap((f) => f.files.map((x) => x.url));
  await Promise.all(urls.map(toDataUrl));
  return fontFaceCss((u) => fontData.get(u) ?? u, fonts);
}

async function waitForImages(root: HTMLElement) {
  const imgs = Array.from(root.querySelectorAll("img"));
  await Promise.all(
    imgs.map((img) =>
      img.complete && img.naturalWidth > 0
        ? img.decode().catch(() => undefined)
        : new Promise<void>((resolve) => {
            img.onload = () => resolve();
            img.onerror = () => resolve();
          }),
    ),
  );
}

const nextFrame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));

export interface RenderOptions {
  format: "png" | "jpeg";
  /** Facteur de résolution : 1 = 1920 × 1080. */
  pixelRatio?: number;
  onProgress?: (done: number, total: number) => void;
}

/** Rend les diapos en images (data: URI), une par diapo, dans l'ordre. */
export async function renderSlides(slides: Slide[], opts: RenderOptions): Promise<string[]> {
  const { toJpeg, toPng } = await import("html-to-image");
  const fontEmbedCSS = await embeddedFontCss(usedFonts(slides));
  await document.fonts.ready;

  const host = document.createElement("div");
  // Hors écran mais bien présent dans la page : le navigateur doit le mettre en forme.
  host.style.cssText = `position:fixed;left:0;top:0;width:${SLIDE_W}px;height:${SLIDE_H}px;z-index:-1;opacity:0;pointer-events:none;overflow:hidden;`;
  host.setAttribute("aria-hidden", "true");
  document.body.appendChild(host);
  const root = createRoot(host);
  const out: string[] = [];

  try {
    for (let i = 0; i < slides.length; i++) {
      root.render(<SlideContent slide={slides[i]} />);
      await nextFrame();
      await nextFrame();
      const node = host.firstElementChild as HTMLElement;
      await waitForImages(node);
      const options = {
        width: SLIDE_W,
        height: SLIDE_H,
        pixelRatio: opts.pixelRatio ?? 1,
        fontEmbedCSS,
        cacheBust: false,
        backgroundColor: "#ffffff",
        style: { opacity: "1" },
      };
      out.push(opts.format === "png" ? await toPng(node, options) : await toJpeg(node, { ...options, quality: 0.92 }));
      opts.onProgress?.(i + 1, slides.length);
    }
  } finally {
    root.unmount();
    host.remove();
  }
  return out;
}

export function safeFileName(title: string): string {
  const base = title
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
  return base || "presentation";
}

function download(href: string, name: string) {
  const a = document.createElement("a");
  a.href = href;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export async function exportPdf(title: string, slides: Slide[], onProgress?: RenderOptions["onProgress"]) {
  const images = await renderSlides(slides, { format: "jpeg", pixelRatio: 1.5, onProgress });
  const { jsPDF } = await import("jspdf");
  const pdf = new jsPDF({ orientation: "landscape", unit: "px", format: [SLIDE_W, SLIDE_H], hotfixes: ["px_scaling"], compress: true });
  images.forEach((img, i) => {
    if (i > 0) pdf.addPage([SLIDE_W, SLIDE_H], "landscape");
    pdf.addImage(img, "JPEG", 0, 0, SLIDE_W, SLIDE_H, undefined, "FAST");
  });
  pdf.setProperties({ title });
  pdf.save(`${safeFileName(title)}.pdf`);
}

export async function exportPng(title: string, slide: Slide, index: number) {
  const [img] = await renderSlides([slide], { format: "png", pixelRatio: 1 });
  download(img, `${safeFileName(title)}-${String(index + 1).padStart(2, "0")}.png`);
}

export async function exportZip(title: string, slides: Slide[], onProgress?: RenderOptions["onProgress"]) {
  const images = await renderSlides(slides, { format: "png", pixelRatio: 1, onProgress });
  const { default: JSZip } = await import("jszip");
  const zip = new JSZip();
  const name = safeFileName(title);
  images.forEach((img, i) => zip.file(`${name}-${String(i + 1).padStart(2, "0")}.png`, img.split(",")[1], { base64: true }));
  const blob = await zip.generateAsync({ type: "blob" });
  const url = URL.createObjectURL(blob);
  download(url, `${name}.zip`);
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
