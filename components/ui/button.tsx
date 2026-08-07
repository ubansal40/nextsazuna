import { cva, type VariantProps } from "class-variance-authority";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * Ceremony button — spec §Component · Button.
 *
 * Focus is deliberately absent from these classes: the global `:focus-visible`
 * rule in globals.css applies `--sz-focus-ring` to every interactive element, so
 * no component restyles its own ring.
 */
const button = cva(
  [
    "inline-flex items-center justify-center gap-2",
    "font-semibold cursor-pointer border",
    "transition-colors duration-[var(--sz-dur)] ease-[var(--sz-ease-out)]",
    "disabled:cursor-not-allowed disabled:opacity-[var(--sz-disabled-opacity)]",
  ],
  {
    variants: {
      variant: {
        primary: "text-white bg-primary-700 border-primary-700 hover:bg-primary-800 hover:border-primary-800",
        secondary: "text-primary-700 bg-transparent border-primary-700 hover:bg-primary-50",
        ghost: "text-primary-700 bg-transparent border-transparent hover:bg-primary-50",
        danger: "text-white bg-error border-error hover:bg-danger-hover hover:border-danger-hover",
        link: "text-primary-700 bg-transparent border-transparent hover:underline",
        /** Square icon-only action — 44px tap target, neutral outline. */
        icon: "text-primary-700 bg-transparent border-line hover:bg-primary-50 hover:border-primary-700",
      },
      size: {
        sm: "text-[length:var(--sz-text-control-sm)] rounded-[var(--sz-radius-btn-sm)] px-[14px] py-[8px]",
        md: "text-[length:var(--sz-text-control)] rounded-[var(--sz-radius-control)] px-[20px] py-[11px]",
        lg: "text-[length:var(--sz-text-base)] rounded-[var(--sz-radius-btn-lg)] px-[26px] py-[14px]",
        icon: "size-[var(--sz-control-h)] rounded-[var(--sz-radius-control)] p-0",
      },
    },
    compoundVariants: [
      // Ghost sits tighter than a filled button of the same size.
      { variant: "ghost", size: "md", class: "px-[16px]" },
      // A link button keeps the vertical rhythm but loses horizontal padding.
      { variant: "link", size: "md", class: "px-[4px]" },
    ],
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof button> {
  /** Renders a spinner, disables the button and marks it busy. */
  loading?: boolean;
  children?: ReactNode;
}

export function Button({
  className,
  variant,
  size,
  loading = false,
  disabled,
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      type="button"
      disabled={disabled ?? loading}
      aria-busy={loading || undefined}
      className={cn(button({ variant, size }), loading && "cursor-progress", className)}
      {...props}
    >
      {loading && <Spinner />}
      {children}
    </button>
  );
}

function Spinner() {
  return (
    <span
      aria-hidden="true"
      className="inline-block size-[15px] rounded-[var(--sz-radius-pill)] border-2 border-white/40 border-t-white animate-spin"
    />
  );
}

export { button as buttonVariants };
