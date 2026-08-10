import { cn } from "@/lib/cn";

export interface RadioOption {
  value: string;
  label: string;
  /** Optional colour dot — used by the metal picker (yellow / white / rose). */
  swatch?: string;
  disabled?: boolean;
}

export interface RadioGroupProps {
  name: string;
  /** Group label, rendered above the options. */
  legend?: string;
  options: RadioOption[];
  defaultValue?: string;
  onChange?: (value: string) => void;
  className?: string;
}

/**
 * Radio group — spec §Component · Input & forms.
 *
 * The spec renders this as the gold-colour picker, so an option may carry a
 * `swatch` colour dot. One component covers both the plain radio group and the
 * metal picker rather than duplicating the interaction and focus handling.
 */
export function RadioGroup({
  name,
  legend,
  options,
  defaultValue,
  onChange,
  className,
}: RadioGroupProps) {
  return (
    <fieldset className={cn("border-0 p-0 m-0", className)}>
      {legend && (
        <legend className="text-[length:var(--sz-text-control-sm)] font-semibold text-body mb-[10px] p-0">
          {legend}
        </legend>
      )}
      <div className="flex gap-2">
        {options.map((option) => (
          <label
            key={option.value}
            className={cn(
              "relative flex-1 flex items-center gap-[9px]",
              "text-[length:var(--sz-text-control-sm)] text-body",
              "bg-raised border border-line rounded-[var(--sz-radius-control)]",
              "px-[11px] py-[10px]",
              "transition-colors duration-[var(--sz-dur)] ease-[var(--sz-ease-out)]",
              "has-[:focus-visible]:shadow-[var(--sz-focus-ring)]",
              // The drawn option is ~42px tall — under the 44px the system names
              // as a tap target, and this is a primary mobile control (the metal
              // picker). The hit area is grown with a pseudo-element rather than
              // a min-height so the option's drawn box does not change: the
              // options sit in a row, so the extra height overlaps nothing, and
              // the label's own box still hits, making the target the union.
              "before:absolute before:inset-x-0 before:top-1/2 before:h-[var(--sz-control-h)]",
              "before:-translate-y-1/2 before:content-['']",
              option.disabled
                ? "cursor-not-allowed opacity-[var(--sz-disabled-opacity)]"
                : "cursor-pointer hover:border-accent has-[:checked]:border-accent",
            )}
          >
            <input
              type="radio"
              name={name}
              value={option.value}
              defaultChecked={defaultValue === option.value}
              disabled={option.disabled}
              onChange={onChange ? () => onChange(option.value) : undefined}
              className="sr-only peer"
            />
            <span
              aria-hidden="true"
              className={cn(
                "inline-flex items-center justify-center shrink-0",
                "size-[var(--sz-radio)] rounded-[var(--sz-radius-pill)] border border-control-ring",
                "peer-checked:[&>span]:scale-100",
              )}
            >
              <span
                className={cn(
                  "size-[9px] rounded-[var(--sz-radius-pill)] bg-primary-700",
                  "scale-0 transition-transform duration-[var(--sz-dur-fast)] ease-[var(--sz-ease-out)]",
                )}
              />
            </span>
            <span className="inline-flex items-center gap-1.5">
              {option.swatch && (
                <span
                  aria-hidden="true"
                  className="size-[10px] rounded-[var(--sz-radius-pill)]"
                  style={{ background: option.swatch }}
                />
              )}
              {option.label}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/** The metal options the spec names, wired to the metal tokens. */
export const METAL_OPTIONS: RadioOption[] = [
  { value: "yellow", label: "Yellow", swatch: "var(--sz-metal-yellow)" },
  { value: "white", label: "White", swatch: "var(--sz-metal-white)" },
  { value: "rose", label: "Rose", swatch: "var(--sz-metal-rose)" },
];
