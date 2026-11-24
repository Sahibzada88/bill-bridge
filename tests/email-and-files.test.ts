import { describe, it, expect, vi, beforeEach } from "vitest";
import sharp from "sharp";

vi.mock("server-only", () => ({}));

// ---- in-memory fake of the parts of supabase-js that file-store uses ----
const blobs = new Map<string, { mime_type: string; data_base64: string }>();
const fakeAdmin = {
  from: (table: string) => {
    if (table !== "document_blobs") throw new Error("unexpected table " + table);
    return {
      insert: async (row: { path: string; mime_type: string; data_base64: string }) => {
        if (blobs.has(row.path)) return { error: { message: "duplicate key" } };
        blobs.set(row.path, { mime_type: row.mime_type, data_base64: row.data_base64 });
        return { error: null };
      },
      select: () => ({ eq: (_c: string, path: string) => ({ maybeSingle: async () => ({ data: blobs.get(path) ?? null, error: null }) }) }),
      delete: () => ({ in: async (_c: string, paths: string[]) => { paths.forEach((p) => blobs.delete(p)); return { error: null }; } }),
    };
  },
  storage: { from: () => { throw new Error("storage must not be touched for db: paths"); } },
};
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => fakeAdmin }));

const envState: Record<string, string> = { STORAGE_BACKEND: "database", GMAIL_USER: "", GMAIL_APP_PASSWORD: "" };
vi.mock("@/lib/env", async () => {
  const actual = await vi.importActual<typeof import("@/lib/env")>("@/lib/env");
  return { ...actual, serverEnv: () => ({ ...envState, SUPABASE_SERVICE_ROLE_KEY: "x".repeat(40) }), publicEnv: { ...actual.publicEnv, siteUrl: "https://bills.example/" } };
});

import { newPath, putFile, getDbFile, removeFiles, isDbPath } from "@/lib/file-store";
import { renderNotificationEmail, emailConfigured } from "@/lib/email";
import { ipSalt } from "@/lib/security/ip";

beforeEach(() => blobs.clear());

describe("files stored as base64 in the database", () => {
  it("round-trips a real image byte-for-byte", async () => {
    const png = await sharp({ create: { width: 64, height: 64, channels: 3, background: "#336699" } }).png().toBuffer();
    const path = newPath("req-1/abc", ".png");
    expect(path.startsWith("db:")).toBe(true);
    await putFile(path, png, "image/png");
    const stored = blobs.get(path)!;
    expect(stored.data_base64).toBe(png.toString("base64"));          // really base64 text in the row
    const back = await getDbFile(path);
    expect(back!.mime).toBe("image/png");
    expect(back!.bytes.equals(png)).toBe(true);                       // identical bytes => image can be re-created
    const meta = await sharp(back!.bytes).metadata();
    expect([meta.width, meta.height]).toEqual([64, 64]);
  });
  it("round-trips a PDF and arbitrary binary", async () => {
    const bin = Buffer.from(Array.from({ length: 5000 }, (_, i) => (i * 37) % 256));
    await putFile("db:bin", bin, "application/pdf");
    expect((await getDbFile("db:bin"))!.bytes.equals(bin)).toBe(true);
  });
  it("refuses to overwrite, returns null when missing, and deletes", async () => {
    await putFile("db:a", Buffer.from("one"), "image/png");
    await expect(putFile("db:a", Buffer.from("two"), "image/png")).rejects.toThrow();
    expect(await getDbFile("db:nope")).toBeNull();
    await removeFiles(["db:a"]);
    expect(await getDbFile("db:a")).toBeNull();
  });
  it("routes by path prefix, and storage backend produces plain paths", () => {
    expect(isDbPath("db:x")).toBe(true);
    expect(isDbPath("req/abc.jpg")).toBe(false);
    envState.STORAGE_BACKEND = "storage";
    expect(newPath("req/abc", ".jpg")).toBe("req/abc.jpg");
    envState.STORAGE_BACKEND = "database";
  });
});

describe("notification emails (Gmail)", () => {
  it("is disabled until both GMAIL_USER and GMAIL_APP_PASSWORD are set", () => {
    expect(emailConfigured()).toBe(false);
    envState.GMAIL_USER = "me@gmail.com"; expect(emailConfigured()).toBe(false);
    envState.GMAIL_APP_PASSWORD = "abcd efgh ijkl mnop"; expect(emailConfigured()).toBe(true);
    envState.GMAIL_USER = ""; envState.GMAIL_APP_PASSWORD = "";
  });
  it("renders English with an absolute link on the site's own domain", () => {
    const m = renderNotificationEmail("payment_submitted", "/dashboard/requester/requests/123", "en", "https://bills.example/");
    expect(m.subject).toContain("BillBridge");
    expect(m.text).toContain("https://bills.example/dashboard/requester/requests/123");
    expect(m.html).toContain('dir="ltr"');
  });
  it("renders Urdu right-to-left", () => {
    const m = renderNotificationEmail("new_message", "/dashboard/messages/1", "ur", "https://bills.example");
    expect(m.html).toContain('dir="rtl"'); expect(m.html).toContain('lang="ur"');
    expect(m.subject).toContain("بل برج");
  });
  it("can never be turned into a phishing/open-redirect email via the link field", () => {
    for (const bad of ["https://evil.example/login", "//evil.example", "javascript:alert(1)", "/ok\r\nBcc: x@evil.example"]) {
      const m = renderNotificationEmail("new_message", bad, "en", "https://bills.example");
      expect(m.text).not.toContain("evil.example");
      expect(m.html).not.toContain("evil.example");
      expect(m.text).toContain("https://bills.example/dashboard");
    }
  });
  it("escapes HTML and falls back to a generic message for unknown types", () => {
    const m = renderNotificationEmail('<img src=x onerror=alert(1)>', null, "en", "https://bills.example");
    expect(m.html).not.toContain("<img");
    expect(m.subject).not.toMatch(/[\r\n]/);
  });
});

describe("IP hashing salt", () => {
  it("derives a stable salt from the service key when IP_HASH_SALT is not set", () => {
    expect(ipSalt()).toBe(ipSalt());
    expect(ipSalt()).toMatch(/^[0-9a-f]{64}$/);
  });
});
