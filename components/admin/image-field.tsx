"use client";

import { useId, useRef, useState } from "react";
import Image from "next/image";
import { Icon, useToast } from "@/components/ui";
import { cn } from "@/lib/cn";

/**
 * The 1:1 taxonomy image control from Sazuna Admin Taxonomy.dc.html — a 92px
 * square that is either the current artwork or a dashed "Upload" target, beside
 * the filename and the Replace / Remove pair.
 *
 * Shared by the categories and the collections drawer because the spec draws
 * one control for both. The upload happens immediately (the drawer needs a
 * preview), but the URL is only *stored* when the drawer is saved, so cancelling
 * leaves the category untouched — the cost is an unreferenced file, which is the
 * right trade against a half-saved category.
 *
 * `kind` is passed through to the route, which authorizes that section: a
 * staffer with `categories` alone cannot upload through the collections drawer.
 */
export function ImageField({
  value,
  onChange,
  kind,
  slug,
  hint = "Used on the storefront listing card. Anything not square is centre-cropped.",
  className,
}: {
  value: string | null;
  onChange: (url: string | null) => void;
  kind: "categories" | "collections";
  slug: string;
  hint?: string;
  className?: string;
}) {
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const inputId = useId();

  async function upload(file: File) {
    setBusy(true);
    try {
      const body = new FormData();
      body.append("image", file);
      body.append("kind", kind);
      body.append("slug", slug || kind);
      const response = await fetch("/admin/taxonomy/image", { method: "POST", body });
      const payload = (await response.json()) as { url?: string; error?: string };
      if (!response.ok || !payload.url) {
        toast("error", payload.error ?? "Upload failed. Please try again.");
        return;
      }
      onChange(payload.url);
    } catch {
      toast("error", "Upload failed. Please check your connection.");
    } finally {
      setBusy(false);
      // Clear the input so re-picking the same file fires `change` again.
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  const fileName = value ? value.split("/").pop() : "No image yet";

  return (
    <div className={className}>
      <p className="mb-1.5 text-xs font-semibold text-body">
        Image <span className="font-medium text-muted">· square 1:1</span>
      </p>

      <input
        ref={inputRef}
        id={inputId}
        type="file"
        accept="image/*"
        className="sr-only"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void upload(file);
        }}
      />

      <div className="flex items-start gap-[11px]">
        {value ? (
          <span className="inline-flex size-[92px] shrink-0 items-center justify-center overflow-hidden rounded-[10px] border border-line bg-[radial-gradient(120%_120%_at_30%_25%,var(--sz-surface-raised),var(--sz-accent-soft))]">
            <Image src={value} alt="" width={92} height={92} className="size-full object-cover" unoptimized />
          </span>
        ) : (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={busy}
            aria-label="Upload image"
            className="inline-flex size-[92px] shrink-0 flex-col items-center justify-center gap-1 rounded-[10px] border-[1.5px] border-dashed border-line bg-canvas text-primary-700 hover:border-primary-700 hover:bg-primary-50 disabled:opacity-60"
          >
            <Icon name="plus" size={18} strokeWidth={2} />
            <span className="text-[10.5px] font-semibold">Upload</span>
          </button>
        )}

        <span className="min-w-0 flex-1">
          <span className="block truncate font-mono text-[11px] text-muted">{busy ? "Uploading…" : fileName}</span>
          <span className="mt-[7px] flex gap-[7px]">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={busy}
              className="inline-flex min-h-10 items-center rounded-lg border border-line bg-raised px-[13px] text-xs font-semibold text-primary-700 hover:border-primary-700 hover:bg-primary-50 disabled:opacity-60"
            >
              {value ? "Replace" : "Upload"}
            </button>
            {value && (
              <button
                type="button"
                onClick={() => onChange(null)}
                disabled={busy}
                className={cn("min-h-10 px-2 text-xs font-semibold text-error hover:underline disabled:opacity-60")}
              >
                Remove
              </button>
            )}
          </span>
          <span className="mt-1.5 block text-[11px] leading-normal text-muted">{hint}</span>
        </span>
      </div>
    </div>
  );
}
