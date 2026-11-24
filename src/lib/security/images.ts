import sharp from "sharp";
import { FileValidationError } from "./files";

export const MAX_PIXELS = 40_000_000; // decompression-bomb guard

export interface RedactionConfig {
  /** Fully masked bands, as a percentage of the page. */
  top?: number;     // 0..60
  bottom?: number;  // 0..60
  left?: number;    // 0..60
  right?: number;   // 0..60
  /** Extra black boxes (percentages of width/height). */
  boxes?: { x: number; y: number; w: number; h: number }[];
  /** Blur everything so fine print is unreadable. */
  blurAll?: boolean;
}

const clamp = (n: unknown, min: number, max: number) => {
  const v = typeof n === "number" && Number.isFinite(n) ? n : 0;
  return Math.max(min, Math.min(max, v));
};

export function normalizeRedaction(r: RedactionConfig | undefined): Required<Omit<RedactionConfig, "boxes">> & { boxes: NonNullable<RedactionConfig["boxes"]> } {
  const boxes = (r?.boxes ?? []).slice(0, 8).map((b) => ({
    x: clamp(b.x, 0, 100), y: clamp(b.y, 0, 100), w: clamp(b.w, 0, 100), h: clamp(b.h, 0, 100),
  }));
  return {
    top: clamp(r?.top, 0, 60), bottom: clamp(r?.bottom, 0, 60),
    left: clamp(r?.left, 0, 60), right: clamp(r?.right, 0, 60),
    boxes, blurAll: !!r?.blurAll,
  };
}

/**
 * Re-encodes an uploaded image. Decoding + re-encoding drops EXIF/GPS/ICC metadata and any
 * trailing or polyglot payload. EXIF orientation is applied first so the picture stays upright.
 */
export async function sanitizeImage(buf: Buffer, mime: "image/jpeg" | "image/png"): Promise<{ bytes: Buffer; width: number; height: number }> {
  try {
    const pipeline = sharp(buf, { failOn: "error", limitInputPixels: MAX_PIXELS }).rotate();
    const out = mime === "image/png"
      ? await pipeline.png({ compressionLevel: 9 }).toBuffer({ resolveWithObject: true })
      : await pipeline.jpeg({ quality: 88, mozjpeg: true }).toBuffer({ resolveWithObject: true });
    return { bytes: out.data, width: out.info.width, height: out.info.height };
  } catch {
    throw new FileValidationError("image_invalid");
  }
}

/** Public preview: downscaled, metadata-free, with the requested regions irreversibly blacked out. */
export async function makeRedactedPreview(sanitized: Buffer, redaction?: RedactionConfig): Promise<Buffer> {
  const cfg = normalizeRedaction(redaction);
  const base = sharp(sanitized, { limitInputPixels: MAX_PIXELS }).rotate().resize({ width: 900, withoutEnlargement: true });
  const { data, info } = await base.jpeg({ quality: 72 }).toBuffer({ resolveWithObject: true });
  const W = info.width, H = info.height;

  const rects: string[] = [];
  const rect = (x: number, y: number, w: number, h: number) =>
    `<rect x="${Math.floor(x)}" y="${Math.floor(y)}" width="${Math.ceil(w)}" height="${Math.ceil(h)}" fill="#000"/>`;
  if (cfg.top) rects.push(rect(0, 0, W, (H * cfg.top) / 100));
  if (cfg.bottom) rects.push(rect(0, H - (H * cfg.bottom) / 100, W, (H * cfg.bottom) / 100));
  if (cfg.left) rects.push(rect(0, 0, (W * cfg.left) / 100, H));
  if (cfg.right) rects.push(rect(W - (W * cfg.right) / 100, 0, (W * cfg.right) / 100, H));
  for (const b of cfg.boxes) rects.push(rect((W * b.x) / 100, (H * b.y) / 100, (W * b.w) / 100, (H * b.h) / 100));

  let img = sharp(data);
  if (cfg.blurAll) img = img.blur(6);
  if (rects.length) {
    const svg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">${rects.join("")}</svg>`);
    img = sharp(await img.jpeg({ quality: 72 }).toBuffer()).composite([{ input: svg, top: 0, left: 0 }]);
  }
  // Re-encode last so the black boxes are baked into pixels (no vector layer survives).
  return img.jpeg({ quality: 70 }).toBuffer();
}
