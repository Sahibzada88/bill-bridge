import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { serverEnv } from "@/lib/env";

/**
 * One interface, two backends:
 *  - "database": file bytes are kept as base64 in public.document_blobs (service-role only table).
 *                Zero extra setup. Paths are prefixed "db:". Best for small deployments.
 *  - "storage":  private Supabase Storage bucket "documents" (signed URLs).
 * Reads are decided by the PATH prefix, so you can switch the backend later without losing old files.
 */
export type Backend = "database" | "storage";
export const BUCKET = "documents";
export const isDbPath = (path: string) => path.startsWith("db:");

export function activeBackend(): Backend {
  return serverEnv().STORAGE_BACKEND;
}

/** Build a new random path for the active backend. */
export function newPath(base: string, suffix: string): string {
  return activeBackend() === "database" ? `db:${base}${suffix}` : `${base}${suffix}`;
}

export async function putFile(path: string, bytes: Buffer, mime: string): Promise<void> {
  const admin = createAdminClient();
  if (isDbPath(path)) {
    const { error } = await admin.from("document_blobs").insert({ path, mime_type: mime, data_base64: bytes.toString("base64") });
    if (error) throw new Error(`blob insert failed: ${error.message}`);
    return;
  }
  const { error } = await admin.storage.from(BUCKET).upload(path, bytes, { contentType: mime, upsert: false, cacheControl: "0" });
  if (error) throw new Error(`storage upload failed: ${error.message}`);
}

export async function getDbFile(path: string): Promise<{ bytes: Buffer; mime: string } | null> {
  const admin = createAdminClient();
  const { data, error } = await admin.from("document_blobs").select("mime_type, data_base64").eq("path", path).maybeSingle();
  if (error || !data) return null;
  return { bytes: Buffer.from(data.data_base64, "base64"), mime: data.mime_type };
}

export async function signedStorageUrl(path: string, ttlSeconds: number): Promise<string | null> {
  const { data, error } = await createAdminClient().storage.from(BUCKET).createSignedUrl(path, ttlSeconds);
  return error || !data?.signedUrl ? null : data.signedUrl;
}

export async function removeFiles(paths: string[]): Promise<void> {
  if (!paths.length) return;
  const admin = createAdminClient();
  const dbPaths = paths.filter(isDbPath);
  const stPaths = paths.filter((p) => !isDbPath(p));
  if (dbPaths.length) await admin.from("document_blobs").delete().in("path", dbPaths);
  if (stPaths.length) await admin.storage.from(BUCKET).remove(stPaths);
}
