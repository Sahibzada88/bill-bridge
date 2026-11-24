import { describe, it, expect } from "vitest";
import { registerSchema, requestSchema, paymentSchema, passwordSchema, browseSchema, profileSchema, messageSchema, redactionSchema } from "@/lib/validation";
import { safeRedirectPath, sanitizeSearchTerm, progressPct, formatPKR } from "@/lib/utils";
import { isSameOrigin } from "@/lib/security/csrf";

const validReg = { fullName: "Ayesha Khan", email: "A@Example.com ", password: "correct-horse9", confirmPassword: "correct-horse9", role: "donor", acceptTerms: true };

describe("registration", () => {
  it("accepts valid input and normalizes email", () => {
    const r = registerSchema.parse(validReg);
    expect(r.email).toBe("a@example.com");
  });
  it("can never register as admin (role escalation at signup)", () => {
    expect(registerSchema.safeParse({ ...validReg, role: "admin" }).success).toBe(false);
  });
  it("rejects weak passwords, mismatches and missing consent", () => {
    expect(passwordSchema.safeParse("short1").success).toBe(false);
    expect(passwordSchema.safeParse("onlyletterspassword").success).toBe(false);
    expect(passwordSchema.safeParse("1234567890123").success).toBe(false);
    expect(registerSchema.safeParse({ ...validReg, confirmPassword: "different-pass9" }).success).toBe(false);
    expect(registerSchema.safeParse({ ...validReg, acceptTerms: false }).success).toBe(false);
  });
  it("strips unknown keys (mass assignment)", () => {
    const r = registerSchema.parse({ ...validReg, is_admin: true, id: "x" }) as Record<string, unknown>;
    expect(r.is_admin).toBeUndefined();
    expect(r.id).toBeUndefined();
  });
});

describe("request input", () => {
  const ok = { title: "Electricity bill help", description: "I lost my job and cannot pay this month.", utilityType: "electricity",
    providerName: "IESCO", city: "Islamabad", amountDue: "4500.50", dueDate: "2026-12-01", consumerRef: "12 34567 8901234" };
  it("accepts a valid request and coerces the amount", () => { expect(requestSchema.parse(ok).amountDue).toBe(4500.5); });
  it("rejects bad amounts, refs and dates", () => {
    expect(requestSchema.safeParse({ ...ok, amountDue: 0 }).success).toBe(false);
    expect(requestSchema.safeParse({ ...ok, amountDue: 500001 }).success).toBe(false);
    expect(requestSchema.safeParse({ ...ok, amountDue: 10.123 }).success).toBe(false);
    expect(requestSchema.safeParse({ ...ok, consumerRef: "<script>" }).success).toBe(false);
    expect(requestSchema.safeParse({ ...ok, dueDate: "tomorrow" }).success).toBe(false);
    expect(requestSchema.safeParse({ ...ok, utilityType: "crypto" }).success).toBe(false);
  });
  it("cannot smuggle protected columns", () => {
    const r = requestSchema.parse({ ...ok, lifecycle: "completed", amount_paid: 5000, verification_status: "completed", requester_id: "x" }) as Record<string, unknown>;
    for (const k of ["lifecycle", "amount_paid", "verification_status", "requester_id"]) expect(r[k]).toBeUndefined();
  });
});

describe("payment input", () => {
  const ok = { reservationId: "7b6f6c2e-3b7d-4c7e-9a52-1f1b1c3a8e10", amount: "2000", method: "easypaisa", transactionRef: "TX-123456", paidAt: "2026-11-20T10:00:00Z", receiptDocumentId: "7b6f6c2e-3b7d-4c7e-9a52-1f1b1c3a8e11" };
  it("accepts valid", () => expect(paymentSchema.safeParse(ok).success).toBe(true));
  it("rejects injection-looking refs, negative amounts, bad methods, non-uuid ids", () => {
    expect(paymentSchema.safeParse({ ...ok, transactionRef: "x'; drop table payments;--" }).success).toBe(false);
    expect(paymentSchema.safeParse({ ...ok, amount: -5 }).success).toBe(false);
    expect(paymentSchema.safeParse({ ...ok, method: "wallet" }).success).toBe(false);
    expect(paymentSchema.safeParse({ ...ok, reservationId: "1 OR 1=1" }).success).toBe(false);
  });
});

describe("misc validation", () => {
  it("browse filters are bounded and defaulted", () => {
    expect(browseSchema.parse({}).page).toBe(1);
    expect(browseSchema.safeParse({ page: 99999 }).success).toBe(false);
    expect(browseSchema.safeParse({ sort: "price; drop" }).success).toBe(false);
    expect(browseSchema.safeParse({ type: "nuclear" }).success).toBe(false);
  });
  it("profile phone format", () => {
    expect(profileSchema.safeParse({ fullName: "Ali Raza", phone: "+92 300 1234567", city: "Lahore", bio: "", locale: "ur" }).success).toBe(true);
    expect(profileSchema.safeParse({ fullName: "Ali Raza", phone: "abc", city: "", bio: "", locale: "en" }).success).toBe(false);
  });
  it("messages are length-bounded", () => {
    const id = "7b6f6c2e-3b7d-4c7e-9a52-1f1b1c3a8e10";
    expect(messageSchema.safeParse({ threadId: id, body: "" }).success).toBe(false);
    expect(messageSchema.safeParse({ threadId: id, body: "x".repeat(2001) }).success).toBe(false);
  });
  it("redaction percentages are clamped by schema", () => {
    expect(redactionSchema.safeParse({ top: 80 }).success).toBe(false);
    expect(redactionSchema.parse({}).top).toBe(0);
  });
});

describe("utils", () => {
  it("safeRedirectPath blocks open redirects", () => {
    for (const bad of ["//evil.com", "https://evil.com", "/\\evil.com", "javascript:alert(1)", "/ok\r\nSet-Cookie: x=1", "evil.com"]) {
      expect(safeRedirectPath(bad)).toBe("/dashboard");
    }
    expect(safeRedirectPath("/requests/123?x=1")).toBe("/requests/123?x=1");
    expect(safeRedirectPath(null, "/home")).toBe("/home");
  });
  it("search sanitizer strips filter metacharacters", () => {
    expect(sanitizeSearchTerm("a,b).or(role.eq.admin")).not.toMatch(/[,().]/);
    expect(sanitizeSearchTerm("100% _ match")).not.toMatch(/[%_]/);
    expect(sanitizeSearchTerm("بجلی بل")).toBe("بجلی بل");
    expect(sanitizeSearchTerm("x".repeat(500)).length).toBeLessThanOrEqual(80);
  });
  it("progress and currency", () => {
    expect(progressPct(2500, 5000)).toBe(50);
    expect(progressPct(0, 0)).toBe(0);
    expect(progressPct(9999, 5000)).toBe(100);
    expect(formatPKR(5000)).toMatch(/5,000/);
  });
});

describe("CSRF origin check", () => {
  const mk = (h: Record<string, string>) => new Request("http://localhost/api/x", { method: "POST", headers: h });
  it("accepts same origin, rejects cross-site / missing / malformed", () => {
    expect(isSameOrigin(mk({ origin: "https://app.example", host: "app.example" }))).toBe(true);
    expect(isSameOrigin(mk({ origin: "https://evil.example", host: "app.example" }))).toBe(false);
    expect(isSameOrigin(mk({ host: "app.example" }))).toBe(false);
    expect(isSameOrigin(mk({ origin: "null", host: "app.example" }))).toBe(false);
    expect(isSameOrigin(mk({ origin: "https://app.example.evil.com", host: "app.example" }))).toBe(false);
  });
});
