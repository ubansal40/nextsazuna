"use client";

import { useState, useTransition } from "react";
import { Icon } from "@/components/ui";
import { cn } from "@/lib/cn";
import type { PublicCustomer } from "@/lib/customer-projection";
import { saveProfile } from "../_actions";

/**
 * Profile form — Sazuna Account.dc.html §Profile.
 *
 * Every field here is one the customer may edit. Phone, name and email are
 * shown above it as read-only facts rather than being omitted, because "why
 * can't I change my number?" is a better question to have answered on the page
 * than to have to ask.
 */

const fieldClass =
  "w-full rounded-[var(--sz-radius-btn-lg)] border border-line bg-canvas px-3.5 text-control text-heading outline-none min-h-12 transition-[border-color,box-shadow] duration-[var(--sz-dur)] ease-[var(--sz-ease-out)] focus-visible:border-accent focus-visible:shadow-[var(--sz-ring-focus-soft)]";
const labelClass = "mb-[7px] block text-control-sm font-semibold text-body";

const FIELDS = [
  { name: "address_line1", label: "Address", max: 255, span: true },
  { name: "address_line2", label: "Address line 2", max: 255, span: true },
  { name: "city", label: "City", max: 120 },
  { name: "state", label: "Province", max: 120 },
  { name: "postal_code", label: "Postal code", max: 30 },
  { name: "country", label: "Country", max: 100 },
  { name: "dob", label: "Date of birth", type: "date" },
  { name: "anniversary", label: "Anniversary", type: "date" },
  { name: "ring_size", label: "Ring size", max: 40 },
  { name: "bangle_size", label: "Bangle size", max: 40 },
] as const;

export function ProfileForm({ customer }: { customer: PublicCustomer }) {
  const [values, setValues] = useState<Record<string, string>>({
    address_line1: customer.addressLine1,
    address_line2: customer.addressLine2,
    city: customer.city,
    state: customer.state,
    postal_code: customer.postalCode,
    country: customer.country,
    dob: customer.dob,
    anniversary: customer.anniversary,
    ring_size: customer.ringSize,
    bangle_size: customer.bangleSize,
  });
  const [status, setStatus] = useState<"idle" | "saved" | "error">("idle");
  const [pending, startTransition] = useTransition();

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setStatus("idle");
    startTransition(async () => {
      const result = await saveProfile(values);
      setStatus(result === "saved" || result === "nothing" ? "saved" : "error");
    });
  }

  return (
    <form onSubmit={submit} noValidate className="mt-3.5">
      <div className="grid gap-4 grid-cols-2 policy-stacked:grid-cols-1">
        {FIELDS.map((field) => (
          <div key={field.name} className={"span" in field && field.span ? "col-span-2 policy-stacked:col-span-1" : undefined}>
            <label htmlFor={`p-${field.name}`} className={labelClass}>
              {field.label}
            </label>
            <input
              id={`p-${field.name}`}
              type={"type" in field ? field.type : "text"}
              value={values[field.name] ?? ""}
              maxLength={"max" in field ? field.max : undefined}
              onChange={(event) =>
                setValues((current) => ({ ...current, [field.name]: event.target.value }))
              }
              className={fieldClass}
            />
          </div>
        ))}
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="inline-flex cursor-pointer items-center justify-center rounded-[var(--sz-radius-control)] bg-primary-700 px-7 text-control font-semibold text-white min-h-12 transition-colors duration-[var(--sz-dur-fast)] hover:bg-primary-800 disabled:opacity-[var(--sz-disabled-opacity)]"
        >
          {pending ? "Saving…" : "Save changes"}
        </button>

        {status !== "idle" && (
          <p
            role="status"
            className={cn(
              "m-0 flex items-center gap-1.5 text-sm",
              status === "saved" ? "text-success" : "text-error",
            )}
          >
            <Icon name={status === "saved" ? "check" : "alert"} size={15} strokeWidth={2} />
            {status === "saved" ? "Saved." : "We couldn't save that. Please try again."}
          </p>
        )}
      </div>
    </form>
  );
}
