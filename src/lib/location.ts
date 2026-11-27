import { z } from "zod";

export type LocationPolicy = "required" | "requested" | "off";
export const LOCATION_COOKIE = "bb_loc_pending";

/** What the browser may send to /api/location. Everything is range-checked (never trust the client). */
export const locationPayloadSchema = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("granted"),
    latitude: z.number().finite().min(-90).max(90),
    longitude: z.number().finite().min(-180).max(180),
    accuracy: z.number().finite().min(0).max(1_000_000).optional(),
  }),
  z.object({ status: z.literal("denied") }),
  z.object({ status: z.literal("unavailable") }),
  z.object({ status: z.literal("dismissed") }),
]);
export type LocationPayload = z.infer<typeof locationPayloadSchema>;

export interface IpGeo {
  country: string | null; region: string | null; city: string | null;
  latitude: number | null; longitude: number | null;
}

const clean = (v: string | null, max: number): string | null => {
  if (!v) return null;
  let s = v;
  try { s = decodeURIComponent(v); } catch { /* keep raw */ }
  s = s.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, max);
  return s || null;
};
const num = (v: string | null, lo: number, hi: number): number | null => {
  if (v === null || v.trim() === "") return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= lo && n <= hi ? n : null;
};

/** Approximate location from the hosting platform's geo headers (Vercel; Cloudflare country as a fallback). */
export function parseIpGeo(h: { get(name: string): string | null }): IpGeo {
  const country = clean(h.get("x-vercel-ip-country") ?? h.get("cf-ipcountry"), 8);
  return {
    country: country && country !== "XX" && country !== "T1" ? country : null,
    region: clean(h.get("x-vercel-ip-country-region"), 80),
    city: clean(h.get("x-vercel-ip-city"), 80),
    latitude: num(h.get("x-vercel-ip-latitude"), -90, 90),
    longitude: num(h.get("x-vercel-ip-longitude"), -180, 180),
  };
}

export function mapUrl(lat: number, lon: number): string {
  return `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=15/${lat}/${lon}`;
}
