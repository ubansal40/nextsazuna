import { formatPrice } from "../format";

/**
 * Order emails — the admin alert and the customer confirmation.
 *
 * Ported from the Express app's `order-email-templates.js`: same information,
 * same business rules (notably the high-value COD flag), rendered against the
 * Ceremony palette rather than the old `sazuna-design.css` one.
 *
 * Email HTML is its own discipline: no CSS variables, no external stylesheets,
 * tables for layout, everything inlined. That is why the tokens are literal
 * here and nowhere else in this codebase.
 *
 * Deliberately not `server-only`: these are pure functions of their input, and
 * keeping them importable is what makes them checkable without a running app.
 * The transport (lib/email.ts) and the data-gathering (lib/order-notifications)
 * carry that guard instead.
 */

/** Ceremony, inlined. Kept in one place so the two emails cannot drift. */
const C = {
  canvas: "#FBF8F3",
  surface: "#FFFFFF",
  ink: "#191512",
  body: "#2A2320",
  muted: "#6E6559",
  line: "#E6DCC9",
  lineSoft: "#EFE7D8",
  primary: "#7A2226",
  primaryDeep: "#5B1A1E",
  accent: "#C9A15A",
  success: "#3F7B3F",
  successSoft: "#E7F0E4",
  warningSoft: "#F6ECD3",
  warningInk: "#8A6A22",
} as const;

const SANS = `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif`;
const SERIF = `"Iowan Old Style", Garamond, Baskerville, "Times New Roman", Times, serif`;

/**
 * A cash order above this is worth the founder's attention before dispatch.
 * Ported verbatim from the Express app.
 */
const HIGH_VALUE_COD_MINOR = 50_000 * 100;

const PAYMENT_LABEL: Record<string, string> = {
  cod: "Cash on Delivery",
  esewa: "eSewa",
  khalti: "Khalti",
  fonepay: "Fonepay",
  cybersource: "Card",
  card: "Card",
  bank_transfer: "Bank Transfer",
  upi: "UPI",
};

const STATUS_LABEL: Record<string, string> = {
  pending: "Pending",
  paid: "Paid",
  failed: "Failed",
  refunded: "Refunded",
};

export interface OrderEmailLine {
  name: string;
  sku: string | null;
  quantity: number;
  lineTotalMinor: number;
}

export interface OrderEmailContext {
  orderNumber: string;
  customerName: string;
  phone: string;
  email: string;
  address: string;
  lines: OrderEmailLine[];
  subtotalMinor: number;
  discountMinor: number;
  extrasMinor: number;
  totalMinor: number;
  couponCode: string | null;
  paymentMethod: string;
  paymentStatus: string;
  /** Absolute URL to the customer's receipt, token included. */
  receiptUrl: string;
  brandName: string;
  brandShort: string;
  supportPhone: string | null;
}

export interface RenderedEmail {
  subject: string;
  text: string;
  html: string;
}

const money = (minor: number) => formatPrice(minor / 100) ?? "रु 0";

function escape(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function firstName(full: string): string {
  return full.trim().split(/\s+/)[0] || "there";
}

/** Wraps body content in the shell both emails share. */
function shell(ctx: OrderEmailContext, inner: string): string {
  return `<!doctype html>
<html><body style="margin:0;padding:0;background:${C.canvas};">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.canvas};padding:24px 12px;">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:${C.surface};border:1px solid ${C.line};border-radius:14px;overflow:hidden;">
<tr><td style="background:${C.primaryDeep};padding:20px 24px;">
<span style="font-family:${SERIF};font-size:20px;color:${C.surface};letter-spacing:.01em;">${escape(ctx.brandName)}</span>
<span style="font-family:${SANS};font-size:11px;color:${C.accent};letter-spacing:.14em;text-transform:uppercase;display:block;margin-top:4px;">Certified diamonds</span>
</td></tr>
<tr><td style="padding:24px;">${inner}</td></tr>
<tr><td style="border-top:1px solid ${C.lineSoft};padding:16px 24px;font-family:${SANS};font-size:12px;color:${C.muted};">
${escape(ctx.brandName)}${ctx.supportPhone ? ` · ${escape(ctx.supportPhone)}` : ""}
</td></tr>
</table>
</td></tr></table>
</body></html>`;
}

function lineRows(ctx: OrderEmailContext): string {
  return ctx.lines
    .map(
      (line) => `<tr>
<td style="padding:8px 0;border-bottom:1px solid ${C.lineSoft};font-family:${SANS};font-size:14px;color:${C.body};">
${escape(line.name)}${line.sku ? `<br><span style="font-size:12px;color:${C.muted};">${escape(line.sku)}</span>` : ""}${line.quantity > 1 ? `<span style="font-size:12px;color:${C.muted};"> × ${line.quantity}</span>` : ""}
</td>
<td align="right" style="padding:8px 0;border-bottom:1px solid ${C.lineSoft};font-family:${SANS};font-size:14px;color:${C.body};white-space:nowrap;">${money(line.lineTotalMinor)}</td>
</tr>`,
    )
    .join("");
}

function totalsRows(ctx: OrderEmailContext): string {
  const row = (label: string, value: string, colour: string = C.muted) =>
    `<tr><td style="padding:3px 0;font-family:${SANS};font-size:13px;color:${colour};">${label}</td>
<td align="right" style="padding:3px 0;font-family:${SANS};font-size:13px;color:${colour};white-space:nowrap;">${value}</td></tr>`;

  return [
    row("Subtotal", money(ctx.subtotalMinor)),
    ctx.discountMinor > 0
      ? row(`Promo${ctx.couponCode ? ` (${escape(ctx.couponCode)})` : ""}`, `−${money(ctx.discountMinor)}`, C.success)
      : "",
    ctx.extrasMinor > 0 ? row("Gift wrap / surcharge", money(ctx.extrasMinor)) : "",
    `<tr><td style="padding:10px 0 0;border-top:1px solid ${C.line};font-family:${SANS};font-size:14px;font-weight:600;color:${C.ink};">Total</td>
<td align="right" style="padding:10px 0 0;border-top:1px solid ${C.line};font-family:${SANS};font-size:16px;font-weight:600;color:${C.primary};white-space:nowrap;">${money(ctx.totalMinor)}</td></tr>`,
  ].join("");
}

function plainSummary(ctx: OrderEmailContext): string {
  const lines = ctx.lines.map(
    (line) => `  ${line.name}${line.quantity > 1 ? ` × ${line.quantity}` : ""} — ${money(line.lineTotalMinor)}`,
  );
  return [
    ...lines,
    "",
    `  Subtotal: ${money(ctx.subtotalMinor)}`,
    ctx.discountMinor > 0 ? `  Promo${ctx.couponCode ? ` (${ctx.couponCode})` : ""}: −${money(ctx.discountMinor)}` : "",
    ctx.extrasMinor > 0 ? `  Gift wrap / surcharge: ${money(ctx.extrasMinor)}` : "",
    `  Total: ${money(ctx.totalMinor)}`,
  ]
    .filter(Boolean)
    .join("\n");
}

/** The founder reads this every morning. Everything needed to act is in it. */
export function buildAdminAlertEmail(ctx: OrderEmailContext): RenderedEmail {
  const payment = PAYMENT_LABEL[ctx.paymentMethod] ?? ctx.paymentMethod;
  const status = STATUS_LABEL[ctx.paymentStatus] ?? ctx.paymentStatus;
  const highValueCod = ctx.paymentMethod === "cod" && ctx.totalMinor >= HIGH_VALUE_COD_MINOR;

  const subject = `New order ${ctx.orderNumber} · ${money(ctx.totalMinor)} · ${payment}`;

  const text = [
    `New order ${ctx.orderNumber}`,
    "",
    `Customer: ${ctx.customerName}`,
    `Phone:    ${ctx.phone}`,
    ctx.email ? `Email:    ${ctx.email}` : "",
    `Address:  ${ctx.address}`,
    "",
    `Payment:  ${payment} (${status})`,
    highValueCod ? "*** HIGH-VALUE CASH ON DELIVERY — confirm before dispatch ***" : "",
    "",
    plainSummary(ctx),
  ]
    .filter(Boolean)
    .join("\n");

  const html = shell(
    ctx,
    `${
      highValueCod
        ? `<div style="background:${C.warningSoft};color:${C.warningInk};font-family:${SANS};font-size:13px;font-weight:600;padding:10px 12px;border-radius:8px;margin-bottom:16px;">High-value cash order — confirm before dispatch.</div>`
        : ""
    }
<p style="margin:0 0 4px;font-family:${SERIF};font-size:20px;color:${C.ink};">New order ${escape(ctx.orderNumber)}</p>
<p style="margin:0 0 18px;font-family:${SANS};font-size:13px;color:${C.muted};">${escape(payment)} · ${escape(status)}</p>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:18px;">
<tr><td style="font-family:${SANS};font-size:13px;color:${C.muted};padding:2px 0;">Customer</td><td align="right" style="font-family:${SANS};font-size:13px;color:${C.body};">${escape(ctx.customerName)}</td></tr>
<tr><td style="font-family:${SANS};font-size:13px;color:${C.muted};padding:2px 0;">Phone</td><td align="right" style="font-family:${SANS};font-size:13px;color:${C.body};">${escape(ctx.phone)}</td></tr>
${ctx.email ? `<tr><td style="font-family:${SANS};font-size:13px;color:${C.muted};padding:2px 0;">Email</td><td align="right" style="font-family:${SANS};font-size:13px;color:${C.body};">${escape(ctx.email)}</td></tr>` : ""}
<tr><td style="font-family:${SANS};font-size:13px;color:${C.muted};padding:2px 0;vertical-align:top;">Address</td><td align="right" style="font-family:${SANS};font-size:13px;color:${C.body};">${escape(ctx.address)}</td></tr>
</table>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${lineRows(ctx)}${totalsRows(ctx)}</table>`,
  );

  return { subject, text, html };
}

/** Sent to the customer once the order is real. */
export function buildCustomerConfirmationEmail(ctx: OrderEmailContext): RenderedEmail {
  const payment = PAYMENT_LABEL[ctx.paymentMethod] ?? ctx.paymentMethod;
  const subject = `Your ${ctx.brandShort} order ${ctx.orderNumber} is confirmed`;

  const text = [
    `Hi ${firstName(ctx.customerName)},`,
    "",
    `Thank you — your order ${ctx.orderNumber} is confirmed.`,
    ctx.paymentMethod === "cod"
      ? `You'll pay ${money(ctx.totalMinor)} in cash when it arrives.`
      : `Payment received via ${payment}.`,
    "",
    plainSummary(ctx),
    "",
    `Delivering to: ${ctx.address}`,
    "",
    `View your order: ${ctx.receiptUrl}`,
    "",
    `We'll be in touch shortly to arrange delivery.`,
    ctx.supportPhone ? `Questions? Call ${ctx.supportPhone}.` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const html = shell(
    ctx,
    `<p style="margin:0 0 4px;font-family:${SERIF};font-size:20px;color:${C.ink};">Thank you, ${escape(firstName(ctx.customerName))}.</p>
<p style="margin:0 0 18px;font-family:${SANS};font-size:14px;color:${C.muted};">
Your order <strong style="color:${C.body};">${escape(ctx.orderNumber)}</strong> is confirmed.
${ctx.paymentMethod === "cod" ? `You&rsquo;ll pay <strong style="color:${C.body};">${money(ctx.totalMinor)}</strong> in cash when it arrives.` : `Payment received via ${escape(payment)}.`}
</p>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:18px;">${lineRows(ctx)}${totalsRows(ctx)}</table>

<p style="margin:0 0 18px;font-family:${SANS};font-size:13px;color:${C.muted};">Delivering to<br><span style="color:${C.body};">${escape(ctx.address)}</span></p>

<a href="${escape(ctx.receiptUrl)}" style="display:inline-block;background:${C.primary};color:${C.surface};font-family:${SANS};font-size:14px;font-weight:600;text-decoration:none;padding:12px 22px;border-radius:9px;">View your order</a>

<p style="margin:18px 0 0;font-family:${SANS};font-size:13px;color:${C.muted};">We&rsquo;ll be in touch shortly to arrange delivery.${ctx.supportPhone ? ` Questions? Call ${escape(ctx.supportPhone)}.` : ""}</p>`,
  );

  return { subject, text, html };
}
