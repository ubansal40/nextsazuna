import { cn } from "@/lib/cn";

/**
 * Status pill — the `adx-tbl` chip from Sazuna Admin.dc.html.
 *
 * A small set of semantic tones drawn from the palette's soft surfaces, so every
 * admin table styles a status the same way. Order statuses become configurable
 * (with their own colours) in a later phase; this covers the fixed states —
 * product lifecycle, payment status — that a table needs today.
 */

export type ChipTone = "success" | "warning" | "error" | "info" | "neutral";

const TONE: Record<ChipTone, string> = {
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  error: "bg-error-soft text-error",
  info: "bg-info-soft text-info",
  neutral: "bg-surface text-muted",
};

export function Chip({
  tone = "neutral",
  className,
  children,
}: {
  tone?: ChipTone;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-pill px-2.5 py-0.5 text-[11px] font-semibold capitalize",
        TONE[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
