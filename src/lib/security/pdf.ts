import { PDFDocument, PDFName } from "pdf-lib";
import { FileValidationError } from "./files";

export const MAX_PDF_PAGES = 10;

/** Name keys that indicate active/dangerous content. */
const DANGEROUS_KEYS = new Set([
  "JS", "JavaScript", "Launch", "OpenAction", "AA", "EmbeddedFile", "EmbeddedFiles", "RichMedia",
  "XFA", "GoToR", "GoToE", "ImportData", "SubmitForm", "Movie", "Sound", "3D", "AcroForm", "FileAttachment",
]);

/** Decode #xx escapes inside PDF names so "/J#53" cannot hide "/JS" from the byte scan. */
export function normalizePdfNames(raw: string): string {
  return raw.replace(/\/([^\s/<>[\](){}%]*)/g, (_m, name: string) =>
    "/" + name.replace(/#([0-9a-fA-F]{2})/g, (_x, h: string) => String.fromCharCode(parseInt(h, 16))),
  );
}

export function scanPdfBytes(buf: Buffer): string | null {
  const text = normalizePdfNames(buf.toString("latin1"));
  if (/\/Encrypt\b/.test(text)) return "pdf_encrypted";
  for (const k of ["JavaScript", "JS", "Launch", "OpenAction", "EmbeddedFile", "RichMedia", "XFA", "GoToR"]) {
    if (new RegExp(`/${k}(?![A-Za-z0-9])`).test(text)) return "pdf_active_content";
  }
  return null;
}

const DANGEROUS_RE = new RegExp(`/(?:${[...DANGEROUS_KEYS].map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})(?![A-Za-z0-9])`);

/**
 * Serialize an object and look for dangerous names. For streams only the stream DICTIONARY is
 * inspected (never the body). NB: a PDFDict has its own internal `dict` Map property, so streams
 * must be told apart by their `contents`, not by the presence of `dict`.
 */
function objectLooksDangerous(obj: unknown): boolean {
  const o = obj as { contents?: unknown; dict?: { toString(): string } };
  const isStream = o && typeof o === "object" && "contents" in o && o.dict;
  const text = isStream ? o.dict!.toString() : String(obj);
  if (text === "[object Map]" || text === "[object Object]") {
    // Fail closed if serialization ever stops producing real PDF syntax.
    throw new FileValidationError("pdf_invalid");
  }
  return DANGEROUS_RE.test(normalizePdfNames(text));
}

/**
 * Safe PDF processing:
 *  1. reject encrypted files and files containing active content (byte scan + parsed-object scan),
 *  2. REBUILD a brand-new document by copying only page content (drops document-level scripts,
 *     actions, attachments, forms, outlines and metadata),
 *  3. drop all annotations and page-level additional actions,
 *  4. clear metadata.
 * Returns the sanitized PDF bytes and the page count.
 */
export async function sanitizePdf(input: Buffer): Promise<{ bytes: Buffer; pages: number }> {
  const flagged = scanPdfBytes(input);
  if (flagged) throw new FileValidationError(flagged);

  let src: PDFDocument;
  let pageCount: number;
  try {
    src = await PDFDocument.load(input, { ignoreEncryption: false, throwOnInvalidObject: true, updateMetadata: false });
    pageCount = src.getPageCount();
  } catch {
    throw new FileValidationError("pdf_invalid");
  }

  // Parsed-object scan: also sees objects that were hidden inside compressed object streams.
  for (const [, obj] of src.context.enumerateIndirectObjects()) {
    if (objectLooksDangerous(obj)) throw new FileValidationError("pdf_active_content");
  }
  if (objectLooksDangerous(src.catalog)) throw new FileValidationError("pdf_active_content");

  if (pageCount < 1) throw new FileValidationError("pdf_invalid");
  if (pageCount > MAX_PDF_PAGES) throw new FileValidationError("pdf_too_many_pages");

  // Remove annotations and page actions from the SOURCE pages first, so their objects are never
  // copied (deleting the reference after copying would leave orphaned objects in the output).
  for (const page of src.getPages()) {
    page.node.delete(PDFName.of("Annots"));
    page.node.delete(PDFName.of("AA"));
  }

  const out = await PDFDocument.create({ updateMetadata: false });
  const copied = await out.copyPages(src, src.getPageIndices());
  for (const page of copied) out.addPage(page);
  out.setTitle("");
  out.setAuthor("");
  out.setSubject("");
  out.setKeywords([]);
  out.setProducer("");
  out.setCreator("");

  const bytes = Buffer.from(await out.save({ useObjectStreams: false }));
  // Defense in depth: the output must also pass the byte scan.
  const again = scanPdfBytes(bytes);
  if (again) throw new FileValidationError(again);
  return { bytes, pages: pageCount };
}
