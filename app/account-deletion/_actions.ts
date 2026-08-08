"use server";

import { headers } from "next/headers";
import { alertRecipients, sendMail } from "@/lib/email";
import { buildAccountDeletionEmail } from "@/lib/emails/account-deletion";
import { rateLimit, requestIp } from "@/lib/rate-limit";

export type DeletionRequestResult = "sent" | "invalid" | "throttled" | "error";

/**
 * The same email check the Express app uses on both sides of the wire.
 *
 * Deliberately loose: this is a "did you fumble the @" check, not an attempt to
 * validate an address, which only sending to it can do.
 */
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Request erasure of personal data.
 *
 * A Server Action is a public endpoint, so nothing the client sends is trusted:
 * every field is re-trimmed and re-truncated here at the lengths the form
 * advertises, and the email is re-validated regardless of what the browser did.
 *
 * No database write, matching the Express app. Acting on one of these means
 * going through order records by hand, so the request is a message to a human
 * rather than a row in a queue nobody drains — see lib/emails/account-deletion.
 */
export async function requestAccountDeletion(input: {
  email: string;
  phone: string;
  name: string;
  reason: string;
}): Promise<DeletionRequestResult> {
  // The maxlengths on the inputs mirror these exactly. Truncating server-side
  // is what makes the client-side limit a convenience rather than a control.
  const email = String(input.email ?? "").trim().slice(0, 200);
  const phone = String(input.phone ?? "").trim().slice(0, 30);
  const name = String(input.name ?? "").trim().slice(0, 120);
  const reason = String(input.reason ?? "").trim().slice(0, 2000);

  if (!email || !EMAIL.test(email)) return "invalid";

  const requestHeaders = await headers();
  const ip = requestIp(requestHeaders);

  // This one sends mail to the founder's inbox, so it is worth more than a
  // token limit — an unthrottled form here is a way to flood it.
  const limit = rateLimit(`deletion:${ip}`, { limit: 3, windowMs: 10 * 60_000 });
  if (!limit.ok) return "throttled";

  try {
    const mail = buildAccountDeletionEmail({
      email,
      phone,
      name,
      reason,
      sourceIp: ip,
      userAgent: (requestHeaders.get("user-agent") ?? "").slice(0, 400),
      brandName: "Sazuna Jewellers",
      receivedAt: new Date().toISOString(),
    });

    const result = await sendMail({
      // Same inbox as the order alerts — one place the founder already watches.
      to: alertRecipients(),
      subject: mail.subject,
      text: mail.text,
      html: mail.html,
      // So a reply goes to the person who asked, not into the void.
      replyTo: email,
    });

    /**
     * "skipped" means SMTP is not configured. Telling the requester their
     * request was received when nothing was sent would be a lie on a page about
     * honouring data rights, so it surfaces as an error and the page offers the
     * direct email address instead.
     */
    if (result !== "sent") {
      console.error(`[account-deletion] request from ${email} was not delivered (${result})`);
      return "error";
    }

    return "sent";
  } catch (error) {
    console.error("[account-deletion] failed", error);
    return "error";
  }
}
