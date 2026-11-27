import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined, set: () => {}, delete: () => {} }), headers: async () => new Headers() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({}) }));
vi.mock("@/lib/security/ip", () => ({ getClientIpHash: async () => "h", getUserAgent: async () => "ua" }));
const policy = { v: "required" as "required" | "requested" | "off" };
vi.mock("@/lib/env", async () => {
  const actual = await vi.importActual<typeof import("@/lib/env")>("@/lib/env");
  return { ...actual, serverEnv: () => ({ LOCATION_POLICY: policy.v }) };
});
const state = { pending: true, role: "donor" as "donor" | "requester" | "admin", suspended: false };
vi.mock("@/lib/auth", () => ({ getSession: async () => (state.role ? { userId: "u1", profile: { role: state.role, is_suspended: state.suspended } } : null) }));

import { locationPayloadSchema, parseIpGeo, mapUrl } from "@/lib/location";
import { isBlockingFor } from "@/lib/location-server";

const hdr = (o: Record<string, string>) => new Headers(o);

describe("approximate location from network headers", () => {
  it("reads Vercel geo headers (percent-encoded city decoded)", () => {
    const g = parseIpGeo(hdr({ "x-vercel-ip-country": "PK", "x-vercel-ip-country-region": "IS", "x-vercel-ip-city": "Rawalpindi", "x-vercel-ip-latitude": "33.5973", "x-vercel-ip-longitude": "73.0479" }));
    expect(g).toEqual({ country: "PK", region: "IS", city: "Rawalpindi", latitude: 33.5973, longitude: 73.0479 });
    expect(parseIpGeo(hdr({ "x-vercel-ip-city": "S%C3%A3o%20Paulo" })).city).toBe("São Paulo");
  });
  it("falls back to Cloudflare country and ignores unknown markers", () => {
    expect(parseIpGeo(hdr({ "cf-ipcountry": "PK" })).country).toBe("PK");
    expect(parseIpGeo(hdr({ "cf-ipcountry": "XX" })).country).toBeNull();
  });
  it("returns nulls locally (no headers) and rejects out-of-range / junk coordinates", () => {
    expect(parseIpGeo(hdr({}))).toEqual({ country: null, region: null, city: null, latitude: null, longitude: null });
    const bad = parseIpGeo(hdr({ "x-vercel-ip-latitude": "999", "x-vercel-ip-longitude": "abc" }));
    expect(bad.latitude).toBeNull(); expect(bad.longitude).toBeNull();
  });
  it("strips control characters and truncates hostile header values", () => {
    const g = parseIpGeo(hdr({ "x-vercel-ip-city": "Lahore%0D%0ABcc%3A%20x" + "a".repeat(500) }));
    expect(g.city).not.toMatch(/[\r\n]/);
    expect(g.city!.length).toBeLessThanOrEqual(80);
  });
});

describe("what the browser may send", () => {
  it("accepts a valid GPS fix, refusals and dismissal", () => {
    expect(locationPayloadSchema.safeParse({ status: "granted", latitude: 33.68, longitude: 73.04, accuracy: 20 }).success).toBe(true);
    for (const status of ["denied", "unavailable", "dismissed"]) expect(locationPayloadSchema.safeParse({ status }).success).toBe(true);
  });
  it("rejects impossible, non-numeric and unknown input", () => {
    for (const bad of [
      { status: "granted", latitude: 91, longitude: 0 }, { status: "granted", latitude: 0, longitude: 181 },
      { status: "granted", latitude: "33.6", longitude: 73 }, { status: "granted", latitude: null, longitude: 1 },
      { status: "granted", latitude: 1, longitude: 1, accuracy: -5 }, { status: "granted", latitude: 1 },
      { status: "teleport" }, {}, "granted", null,
    ]) expect(locationPayloadSchema.safeParse(bad).success, JSON.stringify(bad)).toBe(false);
  });
  it("cannot carry a user id or other extra fields through", () => {
    const r = locationPayloadSchema.parse({ status: "granted", latitude: 1, longitude: 2, user_id: "someone-else", source: "ip" }) as Record<string, unknown>;
    expect(r.user_id).toBeUndefined(); expect(r.source).toBeUndefined();
  });
  it("map links contain only numbers", () => {
    expect(mapUrl(33.6844, 73.0479)).toBe("https://www.openstreetmap.org/?mlat=33.6844&mlon=73.0479#map=15/33.6844/73.0479");
  });
});

describe("who is blocked until they share location", () => {
  it("required: donors and requesters are blocked, admins never are (no lockout)", () => {
    expect(isBlockingFor("donor", "required")).toBe(true);
    expect(isBlockingFor("requester", "required")).toBe(true);
    expect(isBlockingFor("admin", "required")).toBe(false);
  });
  it("requested / off: nobody is blocked", () => {
    for (const r of ["donor", "requester", "admin"] as const) { expect(isBlockingFor(r, "requested")).toBe(false); expect(isBlockingFor(r, "off")).toBe(false); }
  });
});

describe("server actions honour the location requirement", () => {
  beforeEach(() => { policy.v = "required"; state.role = "donor"; state.suspended = false; });
  it("blocks a donor whose location is still pending, even if the UI is bypassed", async () => {
    vi.resetModules();
    vi.doMock("next/headers", () => ({ cookies: async () => ({ get: () => ({ value: "1" }), set() {}, delete() {} }), headers: async () => new Headers() }));
    const { requireRoleForAction } = await import("@/lib/action-auth");
    expect(await requireRoleForAction("donor")).toBeNull();
    expect(await requireRoleForAction("any")).toBeNull();
  });
  it("allows the same donor once location was shared (cookie cleared)", async () => {
    vi.resetModules();
    vi.doMock("next/headers", () => ({ cookies: async () => ({ get: () => undefined, set() {}, delete() {} }), headers: async () => new Headers() }));
    const { requireRoleForAction } = await import("@/lib/action-auth");
    expect(await requireRoleForAction("donor")).not.toBeNull();
  });
  it("never blocks an admin, and policy off blocks nobody", async () => {
    vi.resetModules();
    vi.doMock("next/headers", () => ({ cookies: async () => ({ get: () => ({ value: "1" }), set() {}, delete() {} }), headers: async () => new Headers() }));
    state.role = "admin";
    let { requireRoleForAction } = await import("@/lib/action-auth");
    expect(await requireRoleForAction("admin")).not.toBeNull();
    state.role = "donor"; policy.v = "off";
    vi.resetModules();
    ({ requireRoleForAction } = await import("@/lib/action-auth"));
    expect(await requireRoleForAction("donor")).not.toBeNull();
  });
});
