/** Préparation des images avant envoi : dimensions, et réduction des fichiers trop lourds. */

export interface PreparedImage {
  blob: Blob;
  width: number;
  height: number;
  ext: string;
  contentType: string;
}

export const ACCEPTED_IMAGES = ["image/png", "image/jpeg", "image/webp", "image/gif", "image/svg+xml"];
const MAX_SIDE = 2400;
const MAX_BYTES = 2.5 * 1024 * 1024;
export const MAX_UPLOAD_BYTES = 12 * 1024 * 1024;

const EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/svg+xml": "svg",
};

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Image illisible"));
    img.src = src;
  });
}

export async function imageSize(src: string): Promise<{ width: number; height: number }> {
  const img = await loadImage(src);
  return { width: img.naturalWidth || 400, height: img.naturalHeight || 400 };
}

/**
 * `allowSvg: false` convertit les SVG en image matricielle : le stockage
 * des images personnelles n'accepte pas le format vectoriel.
 */
export async function prepareImage(file: Blob, { allowSvg = true }: { allowSvg?: boolean } = {}): Promise<PreparedImage> {
  const type = file.type || "image/png";
  if (!ACCEPTED_IMAGES.includes(type)) throw new Error("Format non pris en charge (PNG, JPG, WebP, GIF ou SVG)");
  if (file.size > MAX_UPLOAD_BYTES) throw new Error("Image trop lourde (12 Mo maximum)");

  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    const width = img.naturalWidth || 400;
    const height = img.naturalHeight || 400;
    const isSvg = type === "image/svg+xml";
    const keep = (isSvg && allowSvg) || type === "image/gif" || (!isSvg && Math.max(width, height) <= MAX_SIDE && file.size <= MAX_BYTES);
    if (keep) return { blob: file, width, height, ext: EXT[type], contentType: type };

    // Trop grande, trop lourde ou vectorielle : on la redessine en WebP (qui garde la transparence).
    // Un SVG est agrandi au passage pour rester net une fois posé sur la diapo.
    const k = isSvg ? Math.min(MAX_SIDE, 1600) / Math.max(width, height) : Math.min(1, MAX_SIDE / Math.max(width, height));
    const w = Math.round(width * k);
    const h = Math.round(height * k);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    canvas.getContext("2d")!.drawImage(img, 0, 0, w, h);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", 0.9));
    if (!blob) return { blob: file, width, height, ext: EXT[type], contentType: type };
    return { blob, width: w, height: h, ext: "webp", contentType: "image/webp" };
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}
