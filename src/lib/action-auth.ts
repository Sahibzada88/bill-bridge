import "server-only";
import { getSession } from "@/lib/auth";
import { locationState } from "@/lib/location-server";
import type { Role } from "@/types";

/**
 * For Server Actions: returns the verified session when it has the role and is not suspended, else null.
 * (Admin-only database functions additionally re-check role + MFA inside Postgres via is_admin().)
 */
export async function requireRoleForAction(role: Role | "any") {
  const s = await getSession();
  if (!s || s.profile.is_suspended) return null;
  if (role !== "any" && s.profile.role !== role) return null;
  // Defense in depth: the UI already blocks, but a direct call must not bypass the location requirement.
  if ((await locationState(s.profile.role)).blocking) return null;
  return s;
}
