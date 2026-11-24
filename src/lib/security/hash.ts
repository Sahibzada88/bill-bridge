import { createHash, randomBytes } from "node:crypto";

export function sha256Hex(data: Buffer | Uint8Array | string): string {
  return createHash("sha256").update(data).digest("hex");
}

/** Salted hash so raw IP addresses are never stored. */
export function hashIp(ip: string, salt: string): string {
  return createHash("sha256").update(`${salt}:${ip}`).digest("hex").slice(0, 32);
}

/** Unguessable, filename-safe random id (128 bits). */
export function randomId(bytes = 16): string {
  return randomBytes(bytes).toString("hex");
}
