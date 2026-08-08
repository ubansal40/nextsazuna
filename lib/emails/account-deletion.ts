/**
 * The data-deletion request email.
 *
 * Deliberately not `server-only` and free of I/O, like lib/emails/order.ts, so
 * it renders as a pure function in scripts/check-order-emails.mts-style checks.
 *
 * There is no database row behind this. The Express app treats a deletion
 * request as a message to a human, because acting on one means going through
 * order records by hand — so the email IS the queue, and it has to carry
 * everything needed to find the person.
 */

export interface DeletionRequestContext {
  email: string;
  phone: string;
  name: string;
  reason: string;
  sourceIp: string;
  userAgent: string;
  brandName: string;
  /** ISO timestamp of the request. Passed in so the builder stays pure. */
  receivedAt: string;
}

export interface RenderedEmail {
  subject: string;
  text: string;
  html: string;
}

function escape(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function buildAccountDeletionEmail(ctx: DeletionRequestContext): RenderedEmail {
  const rows: [string, string][] = [
    ["Email", ctx.email],
    ["Phone", ctx.phone || "—"],
    ["Name", ctx.name || "—"],
    ["Reason", ctx.reason || "—"],
    ["Received", ctx.receivedAt],
    ["Source IP", ctx.sourceIp || "—"],
    ["User agent", ctx.userAgent || "—"],
  ];

  const text = [
    `Data deletion request — ${ctx.brandName}`,
    "",
    ...rows.map(([label, value]) => `${label}: ${value}`),
    "",
    "Confirm receipt within 3 business days and complete deletion within 30 days.",
    "Tax records that must be retained are listed on /account-deletion.",
  ].join("\n");

  const html = `<!doctype html>
<html><body style="margin:0;padding:24px;background:#FBF8F3;font-family:system-ui,sans-serif;color:#2A2320;">
<h1 style="font-size:18px;color:#191512;margin:0 0 4px;">Data deletion request</h1>
<p style="margin:0 0 16px;font-size:13px;color:#6E6559;">
Confirm receipt within <strong>3 business days</strong>, complete within <strong>30 days</strong>.
</p>
<table cellpadding="0" cellspacing="0" style="border-collapse:collapse;font-size:14px;">
${rows
  .map(
    ([label, value]) => `<tr>
<td style="padding:6px 16px 6px 0;color:#6E6559;vertical-align:top;white-space:nowrap;">${escape(label)}</td>
<td style="padding:6px 0;color:#2A2320;">${escape(value) || "&mdash;"}</td>
</tr>`,
  )
  .join("\n")}
</table>
</body></html>`;

  return {
    subject: `Data deletion request — ${ctx.email}`,
    text,
    html,
  };
}
