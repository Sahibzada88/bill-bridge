import { fileTypeFromBuffer } from "file-type";

import { MAX_FILE_BYTES } from "./files-constants";
export { MAX_FILE_BYTES };
export const ALLOWED_MIME = ["image/jpeg", "image/png", "application/pdf"] as const;
export type AllowedMime = (typeof ALLOWED_MIME)[number];

export class FileValidationError extends Error {
  constructor(public code: string, message?: string) {
    super(message ?? code);
    this.name = "FileValidationError";
  }
}

/** Magic-byte check for the three formats we accept (independent of the file-type library). */
export function matchesSignature(buf: Uint8Array, mime: AllowedMime): boolean {
  if (mime === "image/jpeg") return buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
  if (mime === "image/png") {
    const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    return buf.length > 8 && sig.every((b, i) => buf[i] === b);
  }
  // PDF header may be preceded by up to 1024 bytes of junk per spec; we require it at the start (stricter).
  return buf.length > 5 && buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46 && buf[4] === 0x2d;
}

/**
 * Validates size, declared MIME, and real file signature. The *detected* type is authoritative;
 * a declared type that disagrees with it is rejected (extension spoofing).
 */
export async function validateUpload(buf: Buffer, declaredMime: string | null | undefined): Promise<{ mime: AllowedMime; ext: "jpg" | "png" | "pdf" }> {
  if (buf.length === 0) throw new FileValidationError("empty_file");
  if (buf.length > MAX_FILE_BYTES) throw new FileValidationError("file_too_large");

  const detected = await fileTypeFromBuffer(buf);
  const mime = detected?.mime;
  if (!mime || !(ALLOWED_MIME as readonly string[]).includes(mime)) throw new FileValidationError("unsupported_type");
  const allowed = mime as AllowedMime;
  if (!matchesSignature(buf, allowed)) throw new FileValidationError("bad_signature");
  if (declaredMime && declaredMime !== allowed) throw new FileValidationError("type_mismatch");
  return { mime: allowed, ext: allowed === "image/jpeg" ? "jpg" : allowed === "image/png" ? "png" : "pdf" };
}

/** Display name only (never used as a storage path): strip path parts and unsafe characters. */
export function sanitizeDisplayName(name: string | null | undefined): string {
  const base = (name ?? "document").split(/[\\/]/).pop() ?? "document";
  const cleaned = base.normalize("NFKC").replace(/[^\p{L}\p{N}._ -]/gu, "").replace(/\.{2,}/g, ".").trim();
  return (cleaned || "document").slice(0, 80);
}
