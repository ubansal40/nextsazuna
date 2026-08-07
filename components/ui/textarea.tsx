import type { TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/cn";
import { Field, controlBox, controlState, type FieldProps } from "./field";

export interface TextareaProps
  extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "className">,
    Pick<FieldProps, "label" | "helper" | "error"> {
  className?: string;
  fieldClassName?: string;
}

export function Textarea({
  label,
  helper,
  error,
  className,
  fieldClassName,
  id,
  disabled,
  rows = 3,
  ...props
}: TextareaProps) {
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
      <textarea
        id={id}
        rows={rows}
        disabled={disabled}
        aria-invalid={hasError || undefined}
        className={cn(controlBox, controlState(hasError), "resize-y", className)}
        {...props}
      />
    </Field>
  );
}
