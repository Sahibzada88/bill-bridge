import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

describe("supabase/setup_all.sql", () => {
  it("is exactly the concatenation of the migrations (regenerate with: npm run build:sql)", () => {
    const before = readFileSync("supabase/setup_all.sql", "utf8");
    execFileSync(process.execPath, ["scripts/build-sql.mjs"], { stdio: "pipe" });
    const after = readFileSync("supabase/setup_all.sql", "utf8");
    expect(after).toBe(before);
    expect(after).toContain("20260101000004_files_in_db_and_email.sql");
  });
});
