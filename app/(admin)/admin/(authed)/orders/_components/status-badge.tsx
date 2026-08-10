import type { StatusColour } from "@/lib/admin/order-status-colours";

/**
 * The palette a status colour token resolves to.
 *
 * Statuses store a token name, not a hex, so this is the one place a colour
 * becomes CSS — and every value here is an existing ceremony token. Adding a
 * colour means adding it to `STATUS_COLOURS` and to this map, not writing a
 * literal into a component.
 */
export const STATUS_CHIP: Record<StatusColour, string> = {
  gold: "text-[var(--sz-admin-gold-ink)] bg-warning-soft border-accent-soft",
  green: "text-success-ink bg-success-soft border-success-border",
  red: "text-error bg-error-soft border-error-border",
  muted: "text-muted bg-surface border-line",
  ink: "text-heading bg-surface border-line",
  info: "text-info bg-info-soft border-line",
};

/** The dot beside a status name in the manage-statuses drawer. */
export const STATUS_DOT: Record<StatusColour, string> = {
  gold: "bg-accent",
  green: "bg-success",
  red: "bg-error",
  muted: "bg-muted",
  ink: "bg-heading",
  info: "bg-info",
};
