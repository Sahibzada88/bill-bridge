import { describe, it, expect } from "vitest";
import sharp from "sharp";
import { PDFDocument, PDFName, PDFString } from "pdf-lib";
import { validateUpload, matchesSignature, sanitizeDisplayName, MAX_FILE_BYTES, FileValidationError } from "@/lib/security/files";
import { sanitizePdf, scanPdfBytes, normalizePdfNames } from "@/lib/security/pdf";
import { sanitizeImage, makeRedactedPreview, normalizeRedaction } from "@/lib/security/images";
import { sha256Hex, randomId } from "@/lib/security/hash";

const png = (w = 40, h = 40, color = "#ffffff") =>
  sharp({ create: { width: w, height: h, channels: 3, background: color } }).png().toBuffer();
const jpgWithExif = () =>
  sharp({ create: { width: 60, height: 60, channels: 3, background: "#cccccc" } })
    .withExif({ IFD0: { ImageDescription: "SECRET-HOME-ADDRESS", Copyright: "owner" } })
    .jpeg().toBuffer();

async function cleanPdf(pages = 1) {
  const d = await PDFDocument.create();
  for (let i = 0; i < pages; i++) d.addPage([300, 300]).drawText(`Bill page ${i + 1}`, { x: 20, y: 200 });
  return Buffer.from(await d.save({ useObjectStreams: false }));
}
const expectCode = async (p: Promise<unknown>, code: string) => {
  await expect(p).rejects.toBeInstanceOf(FileValidationError);
  await p.catch((e: FileValidationError) => expect(e.code).toBe(code));
};

describe("upload validation", () => {
  it("accepts a real PNG and JPEG and reports the detected type", async () => {
    expect((await validateUpload(await png(), "image/png")).mime).toBe("image/png");
    expect((await validateUpload(await jpgWithExif(), "image/jpeg")).ext).toBe("jpg");
  });
  it("accepts a real PDF", async () => {
    expect((await validateUpload(await cleanPdf(), "application/pdf")).ext).toBe("pdf");
  });
  it("rejects a declared-type mismatch (PNG labelled as PDF)", async () => {
    await expectCode(validateUpload(await png(), "application/pdf"), "type_mismatch");
  });
  it("rejects executables and scripts even when labelled as images", async () => {
    await expectCode(validateUpload(Buffer.from("MZ\x90\x00\x03\x00\x00\x00 fake exe"), "image/png"), "unsupported_type");
    await expectCode(validateUpload(Buffer.from("<script>alert(1)</script>"), "image/jpeg"), "unsupported_type");
    await expectCode(validateUpload(Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'><script>1</script></svg>"), "image/svg+xml"), "unsupported_type");
  });
  it("rejects empty and oversize files", async () => {
    await expectCode(validateUpload(Buffer.alloc(0), "image/png"), "empty_file");
    await expectCode(validateUpload(Buffer.alloc(MAX_FILE_BYTES + 1, 1), "image/png"), "file_too_large");
  });
  it("signature helper recognizes each format", async () => {
    expect(matchesSignature(await png(), "image/png")).toBe(true);
    expect(matchesSignature(await png(), "image/jpeg")).toBe(false);
    expect(matchesSignature(await cleanPdf(), "application/pdf")).toBe(true);
  });
  it("sanitizes display names (no path traversal, no control chars)", () => {
    expect(sanitizeDisplayName("../../etc/passwd")).toBe("passwd");
    expect(sanitizeDisplayName("C:\\Users\\x\\bill<script>.png")).toBe("billscript.png");
    expect(sanitizeDisplayName("")).toBe("document");
    expect(sanitizeDisplayName("a".repeat(500)).length).toBeLessThanOrEqual(80);
  });
});

describe("image sanitization", () => {
  it("removes EXIF metadata (verified by re-reading the output)", async () => {
    const src = await jpgWithExif();
    expect((await sharp(src).metadata()).exif).toBeDefined();           // precondition: source HAS exif
    expect(src.includes(Buffer.from("SECRET-HOME-ADDRESS"))).toBe(true);
    const { bytes } = await sanitizeImage(src, "image/jpeg");
    expect((await sharp(bytes).metadata()).exif).toBeUndefined();
    expect(bytes.includes(Buffer.from("SECRET-HOME-ADDRESS"))).toBe(false);
  });
  it("rejects corrupt images", async () => {
    await expectCode(sanitizeImage(Buffer.from([0xff, 0xd8, 0xff, 0x00, 0x01, 0x02]), "image/jpeg"), "image_invalid");
  });
});

describe("redacted preview", () => {
  it("irreversibly blacks out the requested band and leaves the rest visible", async () => {
    const src = await png(800, 800, "#ffffff");
    const prev = await makeRedactedPreview(src, { top: 40 });
    const { data, info } = await sharp(prev).raw().toBuffer({ resolveWithObject: true });
    const px = (x: number, y: number) => data[(y * info.width + x) * info.channels];
    expect(px(10, 10)).toBeLessThan(30);                      // inside the masked band => black
    expect(px(10, info.height - 10)).toBeGreaterThan(220);    // outside => still white
    expect((await sharp(prev).metadata()).exif).toBeUndefined();
    expect(info.width).toBeLessThanOrEqual(900);
  });
  it("clamps hostile redaction input", () => {
    const n = normalizeRedaction({ top: 9999, bottom: -5, boxes: Array.from({ length: 50 }, () => ({ x: -1, y: 500, w: 10, h: 10 })) });
    expect(n.top).toBe(60);
    expect(n.bottom).toBe(0);
    expect(n.boxes.length).toBe(8);
    expect(n.boxes[0].y).toBe(100);
  });
});

describe("PDF safety", () => {
  it("accepts and rebuilds a clean PDF, clearing metadata", async () => {
    const d = await PDFDocument.create();
    d.setAuthor("Real Name Author"); d.setTitle("My private bill");
    d.addPage([200, 200]);
    const { bytes, pages } = await sanitizePdf(Buffer.from(await d.save()));
    expect(pages).toBe(1);
    const re = await PDFDocument.load(bytes);
    expect(re.getAuthor() ?? "").toBe("");
    expect(re.getTitle() ?? "").toBe("");
    expect(bytes.includes(Buffer.from("Real Name Author"))).toBe(false);
  });
  it("rejects a PDF with a JavaScript OpenAction", async () => {
    const d = await PDFDocument.create(); d.addPage();
    d.catalog.set(PDFName.of("OpenAction"), d.context.obj({ S: "JavaScript", JS: PDFString.of("app.alert(1)") }));
    await expectCode(sanitizePdf(Buffer.from(await d.save({ useObjectStreams: false }))), "pdf_active_content");
  });
  it("rejects JavaScript hidden inside compressed object streams (parsed-object scan)", async () => {
    const d = await PDFDocument.create(); d.addPage();
    d.catalog.set(PDFName.of("Names"), d.context.obj({ JavaScript: d.context.obj({ Names: [PDFString.of("x"), d.context.obj({ S: "JavaScript", JS: PDFString.of("1") })] }) }));
    const bytes = Buffer.from(await d.save({ useObjectStreams: true }));
    await expectCode(sanitizePdf(bytes), "pdf_active_content");
  });
  it("defeats #xx name obfuscation (/J#53 == /JS)", () => {
    expect(normalizePdfNames("/S /J#61vaScript")).toContain("/JavaScript");
    expect(scanPdfBytes(Buffer.from("%PDF-1.4\n1 0 obj<</S/J#61vaScript/J#53(x)>>endobj", "latin1"))).toBe("pdf_active_content");
  });
  it("rejects encrypted PDFs", () => {
    expect(scanPdfBytes(Buffer.from("%PDF-1.7 trailer<</Encrypt 5 0 R>>", "latin1"))).toBe("pdf_encrypted");
  });
  it("strips link annotations from the rebuilt document", async () => {
    const d = await PDFDocument.create();
    const page = d.addPage();
    const link = d.context.obj({ Type: "Annot", Subtype: "Link", Rect: [0, 0, 50, 50], A: { S: "URI", URI: PDFString.of("http://evil.example") } });
    page.node.set(PDFName.of("Annots"), d.context.obj([d.context.register(link)]));
    const { bytes } = await sanitizePdf(Buffer.from(await d.save({ useObjectStreams: false })));
    expect(bytes.toString("latin1")).not.toContain("evil.example");
    expect(bytes.toString("latin1")).not.toContain("/Annots");
  });
  it("rejects PDFs over the page limit and garbage", async () => {
    await expectCode(sanitizePdf(await cleanPdf(11)), "pdf_too_many_pages");
    await expectCode(sanitizePdf(Buffer.from("%PDF-1.4 this is not really a pdf")), "pdf_invalid");
  });
});

describe("hashing", () => {
  it("sha256 matches the known vector and detects duplicates", () => {
    expect(sha256Hex("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    expect(sha256Hex(Buffer.from("x"))).toBe(sha256Hex("x"));
  });
  it("random ids are unique and filename-safe", () => {
    const a = randomId(), b = randomId();
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[0-9a-f]{32}$/);
  });
});
