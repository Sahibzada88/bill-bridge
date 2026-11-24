import "server-only";
import nodemailer, { type Transporter } from "nodemailer";
import { after } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { serverEnv, publicEnv } from "@/lib/env";
import { dictionaries, makeT, type Locale, type MessageKey } from "@/lib/i18n";
import { safeRedirectPath } from "@/lib/utils";

/**
 * Email via Gmail SMTP using a Google *App Password* (not your normal password).
 * Create one at https://myaccount.google.com/apppasswords (needs 2-Step Verification).
 * Everything here is optional: with no GMAIL_* variables set, emails are simply skipped.
 */
export function emailConfigured(): boolean {
  const e = serverEnv();
  return !!(e.GMAIL_USER && e.GMAIL_APP_PASSWORD);
}

let transporter: Transporter | null = null;
function getTransport(): Transporter {
  if (transporter) return transporter;
  const e = serverEnv();
  transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    // Google shows app passwords as "abcd efgh ijkl mnop"; the spaces are not part of the password.
    auth: { user: e.GMAIL_USER, pass: e.GMAIL_APP_PASSWORD.replace(/\s+/g, "") },
    connectionTimeout: 10_000, greetingTimeout: 10_000, socketTimeout: 15_000,
  });
  return transporter;
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export interface Rendered { subject: string; text: string; html: string }

/** Pure function (unit-tested): builds a localized notification email. Only dictionary text + a validated link are used. */
export function renderNotificationEmail(type: string, link: string | null, locale: Locale, siteUrl: string): Rendered {
  const t = makeT(locale);
  const key = `nt.${type}` as MessageKey;
  const message = key in dictionaries[locale] ? t(key) : t("nt.title");
  const url = `${siteUrl.replace(/\/$/, "")}${safeRedirectPath(link, "/dashboard")}`;
  const dir = locale === "ur" ? "rtl" : "ltr";
  const subject = `${t("app.name")} · ${message}`.slice(0, 200);
  const text = `${message}\n\n${t("email.open")}: ${url}\n\n— ${t("app.name")}\n${t("email.footer")}`;
  const html = `<!doctype html><html lang="${locale}" dir="${dir}"><body style="margin:0;background:#f7f2e8;font-family:system-ui,-apple-system,'Segoe UI',Tahoma,sans-serif;color:#1c2520">
<div style="max-width:520px;margin:0 auto;padding:24px"><div style="background:#fff;border:1px solid #dedacd;border-radius:10px;padding:24px">
<p style="margin:0 0 4px;font-weight:700;color:#1f4d3a;font-size:18px">${esc(t("app.name"))}</p>
<p style="font-size:16px;line-height:1.7;margin:16px 0">${esc(message)}</p>
<p style="margin:24px 0"><a href="${esc(url)}" style="background:#1f4d3a;color:#fff;text-decoration:none;padding:12px 20px;border-radius:6px;font-weight:600;display:inline-block">${esc(t("email.open"))}</a></p>
<p style="font-size:12px;color:#55615a;margin:0">${esc(t("email.footer"))}</p></div></div></body></html>`;
  return { subject, text, html };
}

let flushing = false;

/**
 * Sends pending outbox emails (claimed atomically in SQL, so concurrent calls never double-send).
 * Best-effort: failures are retried up to 3 times by the database.
 */
export async function flushEmailOutbox(limit = 10): Promise<{ sent: number; failed: number }> {
  if (!emailConfigured() || flushing) return { sent: 0, failed: 0 };
  flushing = true;
  let sent = 0, failed = 0;
  try {
    const admin = createAdminClient();
    const { data, error } = await admin.rpc("claim_email_outbox", { p_limit: limit });
    if (error) { console.error("[email] claim failed", error.message); return { sent, failed }; }
    for (const row of (data ?? []) as { id: number; email: string; locale: string; type: string; link: string | null }[]) {
      const locale: Locale = row.locale === "ur" ? "ur" : "en";
      try {
        const msg = renderNotificationEmail(row.type, row.link, locale, publicEnv.siteUrl);
        await getTransport().sendMail({ from: `"${makeT(locale)("app.name")}" <${serverEnv().GMAIL_USER}>`, to: row.email, subject: msg.subject, text: msg.text, html: msg.html });
        await admin.rpc("finish_email", { p_id: row.id, p_ok: true });
        sent++;
      } catch (e) {
        failed++;
        await admin.rpc("finish_email", { p_id: row.id, p_ok: false, p_error: e instanceof Error ? e.message : "send failed" });
      }
    }
  } finally {
    flushing = false;
  }
  return { sent, failed };
}

/** Call from Server Actions / Route Handlers: sends queued emails AFTER the response, so users never wait on SMTP. */
export function kickEmails(): void {
  if (!emailConfigured()) return;
  try { after(() => flushEmailOutbox()); } catch { /* outside a request scope: the cron route/next action will flush */ }
}

/** Forward a contact-form message to the site owner's inbox (reply-to = the visitor). */
export async function sendContactEmail(m: { name: string; email: string; message: string }): Promise<void> {
  if (!emailConfigured()) return;
  const e = serverEnv();
  const clean = (s: string) => s.replace(/[\r\n]+/g, " ").slice(0, 120); // no header injection
  await getTransport().sendMail({
    from: `"${makeT("en")("app.name")}" <${e.GMAIL_USER}>`,
    to: e.CONTACT_TO || e.GMAIL_USER,
    replyTo: m.email,
    subject: `Contact form: ${clean(m.name)}`,
    text: `From: ${clean(m.name)} <${m.email}>\n\n${m.message}`,
  });
}

/** Used by scripts/doctor to verify the Gmail credentials really work. */
export async function verifyGmail(): Promise<void> {
  await getTransport().verify();
}
