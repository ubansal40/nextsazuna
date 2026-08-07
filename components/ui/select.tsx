import type { SelectHTMLAttributes } from "react";
import { cn } from "@/lib/cn";
import { Field, controlBox, controlState, type FieldProps } from "./field";
import { Icon } from "./icon";

export interface SelectProps
  extends Omit<SelectHTMLAttributes<HTMLSelectElement>, "className">,
    Pick<FieldProps, "label" | "helper" | "error"> {
  className?: string;
  fieldClassName?: string;
}

/**
 * Native select with the platform chevron suppressed and the Ceremony one drawn
 * on top — spec §Component · Input & forms. Native is deliberate: it keeps the
 * mobile picker, keyboard behaviour and screen-reader semantics for free.
 */
export function Select({
  label,
  helper,
  error,
  className,
  fieldClassName,
  id,
  disabled,
  children,
  ...props
}: SelectProps) {
  const hasError = Boolean(error);
  return (
    <Field
      label={label}
      helper={helper}
      error={error}
      htmlFor={id}
      disabled={disabled}
      className={fieldClassName}
    >
      <div className="relative">
        <select
          id={id}
          disabled={disabled}
          aria-invalid={hasError || undefined}
          className={cn(
            controlBox,
            controlState(hasError),
            "appearance-none cursor-pointer pr-[38px] disabled:cursor-not-allowed",
            className,
          )}
          {...props}
        >
          {children}
        </select>
        <Icon
          name="chevron-down"
          size={18}
          className="absolute right-[13px] top-1/2 -translate-y-1/2 pointer-events-none text-muted"
        />
      </div>
    </Field>
  );
}
