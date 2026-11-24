import { describe, it, expect } from "vitest";
import { en } from "@/lib/i18n/en";
import { ur } from "@/lib/i18n/ur";
import { makeT, errorMessage, dirFor, isLocale } from "@/lib/i18n";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

describe("localization", () => {
  it("English and Urdu define exactly the same keys", () => {
    expect(Object.keys(ur).sort()).toEqual(Object.keys(en).sort());
  });
  it("no Urdu value is empty or left as the English text", () => {
    for (const k of Object.keys(en) as (keyof typeof en)[]) {
      expect(ur[k].trim().length, k).toBeGreaterThan(0);
    }
  });
  it("placeholders match between languages", () => {
    const ph = (s: string) => (s.match(/\{[a-z]+\}/g) ?? []).sort().join(",");
    for (const k of Object.keys(en) as (keyof typeof en)[]) expect(ph(ur[k]), k).toBe(ph(en[k]));
  });
  it("interpolates variables and maps workflow error codes", () => {
    expect(makeT("en")("dn.reserve", { m: 20 })).toContain("20");
    expect(errorMessage(makeT("en"), "already_reserved")).toMatch(/another donor/i);
    expect(errorMessage(makeT("ur"), "already_reserved")).toBe(ur["err.already_reserved"]);
    expect(errorMessage(makeT("en"), "totally_unknown_code")).toBe(en["err.unknown"]);
    expect(errorMessage(makeT("en"), undefined)).toBe(en["err.unknown"]);
  });
  it("Urdu is right-to-left; locale guard rejects junk", () => {
    expect(dirFor("ur")).toBe("rtl"); expect(dirFor("en")).toBe("ltr");
    expect(isLocale("fr")).toBe(false); expect(isLocale("ur")).toBe(true);
  });
  it("every error code raised by the SQL functions has a translated message", () => {
    const sql = readFileSync(path.join(process.cwd(), "supabase/migrations/20260101000002_functions.sql"), "utf8");
    const codes = new Set([...sql.matchAll(/raise exception '([a-z_]+)'/g)].map((m) => m[1]));
    expect(codes.size).toBeGreaterThan(30);
    const missing = [...codes].filter((c) => !(`err.${c}` in en));
    expect(missing).toEqual([]);
  });
});

describe("repository hygiene", () => {
  const root = process.cwd();
  const walk = (dir: string, out: string[] = []) => {
    for (const f of readdirSync(dir)) {
      if (["node_modules", ".next", ".git"].includes(f)) continue;
      const p = path.join(dir, f);
      if (statSync(p).isDirectory()) walk(p, out);
      else out.push(p);
    }
    return out;
  };
  it("contains no GitHub workflows or automation", () => {
    expect(statSync(root).isDirectory()).toBe(true);
    const files = walk(root).map((f) => path.relative(root, f));
    expect(files.filter((f) => f.startsWith(".github"))).toEqual([]);
    expect(files.filter((f) => /(^|\/)(\.gitlab-ci|azure-pipelines|Jenkinsfile|\.circleci)/.test(f))).toEqual([]);
  });
  it("never exposes the service role key through a NEXT_PUBLIC_ variable or client file", () => {
    const files = walk(path.join(root, "src")).filter((f) => /\.(ts|tsx)$/.test(f));
    for (const f of files) {
      const src = readFileSync(f, "utf8");
      expect(src, f).not.toMatch(/NEXT_PUBLIC_[A-Z_]*SERVICE/);
      if (/^\s*["']use client["']/.test(src)) {
        expect(src, f).not.toMatch(/SUPABASE_SERVICE_ROLE_KEY|supabase\/admin|serverEnv/);
      }
    }
    expect(readFileSync(path.join(root, ".env.example"), "utf8")).not.toMatch(/NEXT_PUBLIC_[A-Z_]*SERVICE/);
  });
  it("contains no committed secrets", () => {
    const files = walk(root).filter((f) => !/package-lock|\.zip$|\.png$|\.jpg$/.test(f));
    for (const f of files) {
      const src = readFileSync(f, "utf8");
      expect(src, f).not.toMatch(/eyJhbGciOi[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/); // JWT-shaped keys
      expect(src, f).not.toMatch(/sb_secret_[A-Za-z0-9]{10,}/);
    }
  });
});
