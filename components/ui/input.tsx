import type { InputHTMLAttributes } from "react";
import { cn } from "@/lib/cn";
import { Field, controlBox, controlState, type FieldProps } from "./field";

export interface InputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "className">,
    Pick<FieldProps, "label" | "helper" | "error"> {
  className?: string;
  /** Applied to the outer Field wrapper rather than the <input>. */
  fieldClassName?: string;
}

export function Input({
  label,
  helper,
  error,
  className,
  fieldClassName,
  id,
  disabled,
  ...props
}: InputProps) {
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
      <input
        id={id}
        disabled={disabled}
        aria-invalid={hasError || undefined}
        aria-describedby={id ? (hasError ? `${id}-error` : helper ? `${id}-helper` : undefined) : undefined}
        className={cn(controlBox, controlState(hasError), className)}
        {...props}
      />
    </Field>
  );
}
