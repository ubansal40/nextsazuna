import "server-only";

import nodemailer, { type Transporter } from "nodemailer";

/**
 * Transactional email.
 *
 * SMTP via nodemailer, configured exactly as the Express app's
 * `order-alert.js` reads it, so the same environment works for both.
 *
 * Unconfigured is a supported state, not an error. If SMTP is not set up,
 * `send` reports that it did nothing and the caller carries on — an order must
 * never fail because a mail server is unreachable. The customer has their
 * receipt on screen either way.
 */

export interface Mail {
  to: string | string[];
  subject: string;
  text: string;
  html: string;
  replyTo?: string;
}

export type SendResult = "sent" | "skipped" | "failed";

interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  from: string;
}

/** Split a comma or semicolon separated recipient list. */
function addresses(raw: string | undefined): string[] {
  return (raw ?? "")
    .split(/[,;]/)
    .map((address) => address.trim())
    .filter((address) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(address));
}

function config(): SmtpConfig | null {
  const host = (process.env.ORDER_ALERT_SMTP_HOST ?? process.env.SMTP_HOST ?? "").trim();
  const user = (process.env.ORDER_ALERT_SMTP_USER ?? process.env.SMTP_USER ?? "").trim();
  const pass = (process.env.ORDER_ALERT_SMTP_PASS ?? process.env.SMTP_PASS ?? "").trim();
  const from = (process.env.ORDER_ALERT_FROM_EMAIL ?? user).trim();
  const secure = (process.env.ORDER_ALERT_SMTP_SECURE ?? "").trim().toLowerCase() === "true";
  const port = Number.parseInt(
    process.env.ORDER_ALERT_SMTP_PORT ?? process.env.SMTP_PORT ?? (secure ? "465" : "587"),
    10,
  );

  // Same guard as the reference: without a host and a sender there is nothing
  // to attempt.
  if (!host || !from) return null;

  return { host, port: Number.isFinite(port) ? port : 587, secure, user, pass, from };
}

/** Who receives the "new order" alert. */
export function alertRecipients(): string[] {
  return addresses(
    process.env.ORDER_ALERT_RECIPIENTS ?? process.env.ADMIN_ORDER_ALERT_RECIPIENTS,
  );
}

export function isEmailConfigured(): boolean {
  return config() !== null;
}

let cached: Transporter | undefined;

function transport(smtp: SmtpConfig): Transporter {
  // One pooled transport per process; creating a connection per email is slow
  // and gets throttled by most providers.
  cached ??= nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.secure,
    auth: smtp.user ? { user: smtp.user, pass: smtp.pass } : undefined,
    pool: true,
    maxConnections: 2,
  });
  return cached;
}

export async function sendMail(mail: Mail): Promise<SendResult> {
  const smtp = config();
  if (!smtp) return "skipped";

  const to = Array.isArray(mail.to) ? mail.to.filter(Boolean) : [mail.to].filter(Boolean);
  if (!to.length) return "skipped";

  try {
    await transport(smtp).sendMail({
      from: smtp.from,
      to,
      subject: mail.subject,
      text: mail.text,
      html: mail.html,
      replyTo: mail.replyTo,
    });
    return "sent";
  } catch (error) {
    // Logged, never thrown: the order is already placed and paid. A failed
    // notification is a problem for us to chase, not a failure to show the
    // customer.
    console.error("[email] send failed", { subject: mail.subject, error });
    return "failed";
  }
}
