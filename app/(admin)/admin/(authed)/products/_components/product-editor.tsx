"use client";

import { useRef, useState, useTransition } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icon, useToast } from "@/components/ui";
import { MultiSelect } from "@/components/admin/multi-select";
import { cn } from "@/lib/cn";
import type { AdminProductDetail } from "@/lib/admin/product-detail";
import type { ProductEditorOptions } from "@/lib/admin/catalog";
import { saveProductAction } from "../_editor-actions";

/**
 * Product create / edit — the shared product card from Sazuna Admin Products.dc
 * .html. One card here (an edit, or a single new product); the spec's multi-card
 * batch add and Excel autofill layer onto this same card and are a follow-up.
 *
 * The one deliberate deviation from the mock: Category is the spec's own
 * multi-select popover (the tag picker), not a single dropdown — a product sits
 * in several categories, and the storefront browses the whole tree.
 */

interface Photo {
  url: string;
  raw: boolean;
}

const fieldClass =
  "min-h-10 w-full rounded-[var(--sz-admin-radius-control)] border border-line bg-admin-canvas px-2.5 text-[13px] text-body outline-none placeholder:text-muted focus-visible:border-primary-700 focus-visible:shadow-[var(--sz-ring-focus-soft)]";
const labelClass = "mb-1 block text-xs font-semibold text-body";

function unique(values: (string | undefined | null)[]): string[] {
  return [...new Set(values.filter((v): v is string => !!v))];
}

export function ProductEditor({
  product,
  options,
}: {
  product?: AdminProductDetail;
  options: ProductEditorOptions;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const isEdit = Boolean(product);

  const [name, setName] = useState(product?.name ?? "");
  const [sku, setSku] = useState(product?.sku ?? "");
  const [material, setMaterial] = useState(product?.material ?? "");
  const [purity, setPurity] = useState(product?.purity ?? "");
  const [salePrice, setSalePrice] = useState(product?.salePrice ?? "");
  const [gross, setGross] = useState(product?.grossWeight ?? "");
  const [net, setNet] = useState(product?.netWeight ?? "");
  const [diamond, setDiamond] = useState(product?.diamondWeight ?? "");
  const [stone, setStone] = useState(product?.stoneWeight ?? "");
  const [categoryIds, setCategoryIds] = useState<string[]>((product?.categoryIds ?? []).map(String));
  const [tagIds, setTagIds] = useState<string[]>((product?.tagIds ?? []).map(String));
  const [photos, setPhotos] = useState<Photo[]>((product?.imageUrls ?? []).map((url) => ({ url, raw: false })));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [uploading, setUploading] = useState(false);
  const [pending, startTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  const materialOptions = unique([material, ...options.materials]);
  const purityOptions = unique([purity, ...options.purities]);

  async function onFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      const body = new FormData();
      body.set("sku", sku || "product");
      for (const file of Array.from(files)) body.append("images", file);
      const res = await fetch("/admin/products/upload", { method: "POST", body });
      const data = (await res.json()) as { urls?: string[]; error?: string };
      if (!res.ok || !data.urls) {
        toast("error", data.error ?? "Upload failed.");
        return;
      }
      setPhotos((current) => [...current, ...data.urls!.map((url) => ({ url, raw: true }))]);
    } catch {
      toast("error", "Upload failed.");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function setCover(index: number) {
    setPhotos((current) => {
      if (index === 0) return current;
      const next = [...current];
      const [moved] = next.splice(index, 1);
      return [moved, ...next];
    });
  }
  function removePhoto(index: number) {
    setPhotos((current) => current.filter((_, i) => i !== index));
  }

  function save() {
    setErrors({});
    startTransition(async () => {
      const result = await saveProductAction(product?.id ?? null, {
        name,
        sku,
        material,
        purity,
        stoneType: product?.stoneType ?? "",
        description: product?.description ?? "",
        salePrice,
        grossWeight: gross,
        netWeight: net,
        diamondWeight: diamond,
        stoneWeight: stone,
        categoryIds: categoryIds.map(Number),
        tagIds: tagIds.map(Number),
        imageUrls: photos.map((p) => p.url),
      });
      if (!result.ok) {
        if (result.field) setErrors({ [result.field]: result.error });
        toast("error", result.error);
        return;
      }
      toast(
        "success",
        result.processing
          ? "Saved — the photos are processing and will appear shortly."
          : isEdit
            ? "Product updated."
            : "Product created.",
      );
      router.push("/admin/products");
      router.refresh();
    });
  }

  return (
    <div className="mx-auto max-w-[820px] pb-24">
      <div className="mb-4 flex items-center gap-2">
        <Link href="/admin/products" className="inline-flex size-9 items-center justify-center rounded-[var(--sz-admin-radius-control)] border border-line bg-raised text-muted hover:border-primary-700">
          <Icon name="arrow-left" size={16} />
        </Link>
        <h2 className="font-display text-2xl font-medium text-heading">{isEdit ? "Edit product" : "Add product"}</h2>
      </div>

      <div className="overflow-hidden rounded-[var(--sz-admin-radius-card)] border border-line bg-raised">
        {/* Card bar */}
        <div className="flex flex-wrap items-center gap-3 border-b border-line-soft bg-admin-canvas px-4 py-2.5">
          <span className="font-mono text-[11px] font-semibold text-muted">{isEdit ? sku || "EDIT" : "NEW"}</span>
          <label className="flex items-center gap-1.5 text-xs font-semibold text-body">
            Material
            <select value={material} onChange={(e) => setMaterial(e.target.value)} className="min-h-8 rounded-[7px] border border-line bg-raised px-2 text-[12.5px] text-body">
              <option value="">—</option>
              {materialOptions.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-1.5 text-xs font-semibold text-body">
            Purity
            <select value={purity} onChange={(e) => setPurity(e.target.value)} className="min-h-8 rounded-[7px] border border-line bg-raised px-2 font-mono text-[12.5px] text-body">
              <option value="">—</option>
              {purityOptions.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </label>
        </div>

        <div className="space-y-4 p-4">
          {/* Photos */}
          <div>
            <p className="mb-1.5 font-mono text-[11px] font-semibold uppercase tracking-wide text-muted">Photos</p>
            <div className="flex flex-wrap gap-2.5">
              {photos.map((photo, index) => (
                <div key={photo.url} className="group relative size-[72px] overflow-hidden rounded-[10px] border border-line bg-admin-canvas">
                  <Image src={photo.url} alt="" width={72} height={72} unoptimized className="size-full object-cover" />
                  {index === 0 && (
                    <span className="absolute left-1 top-1 rounded bg-primary-800/90 px-1 font-mono text-[8px] font-semibold text-white">COVER</span>
                  )}
                  <div className="absolute inset-0 flex items-center justify-center gap-1 bg-heading/50 opacity-0 transition-opacity group-hover:opacity-100">
                    {index !== 0 && (
                      <button type="button" onClick={() => setCover(index)} aria-label="Set as cover" title="Set as cover" className="inline-flex size-7 items-center justify-center rounded-full bg-white text-primary-700">
                        <Icon name="check" size={14} strokeWidth={2.5} />
                      </button>
                    )}
                    <button type="button" onClick={() => removePhoto(index)} aria-label="Remove photo" title="Remove" className="inline-flex size-7 items-center justify-center rounded-full bg-white text-error">
                      <Icon name="trash" size={14} />
                    </button>
                  </div>
                </div>
              ))}
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                className="flex size-[72px] flex-col items-center justify-center gap-1 rounded-[10px] border border-dashed border-line text-muted hover:border-primary-700 hover:text-primary-700 disabled:opacity-[var(--sz-disabled-opacity)]"
              >
                {uploading ? (
                  <span className="size-4 animate-spin rounded-pill border-2 border-line border-t-primary-700" />
                ) : (
                  <Icon name="plus" size={18} />
                )}
                <span className="text-[11px] font-semibold">{uploading ? "…" : "Add"}</span>
              </button>
              <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => onFiles(e.target.files)} />
            </div>
          </div>

          {/* Name */}
          <Field label="Product name *" error={errors.name}>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Solitaire Halo Ring" aria-invalid={!!errors.name} className={cn(fieldClass, errors.name && "border-error")} />
          </Field>

          {/* SKU + Category */}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="SKU *" error={errors.sku}>
              <input value={sku} onChange={(e) => setSku(e.target.value)} placeholder="DGR-0000" aria-invalid={!!errors.sku} className={cn(fieldClass, "font-mono", errors.sku && "border-error")} />
            </Field>
            <Field label="Categories *" error={errors.categories}>
              <MultiSelect
                ariaLabel="Categories"
                placeholder="Select categories…"
                options={options.categories.map((c) => ({ value: String(c.id), label: c.name }))}
                selected={categoryIds}
                onChange={setCategoryIds}
              />
            </Field>
          </div>

          {/* Sale price + Tags */}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Sale price (रु) *" error={errors.salePrice}>
              <input value={salePrice} onChange={(e) => setSalePrice(e.target.value)} inputMode="decimal" placeholder="9999" aria-invalid={!!errors.salePrice} className={cn(fieldClass, "font-mono", errors.salePrice && "border-error")} />
            </Field>
            <Field label="Tags">
              <MultiSelect
                ariaLabel="Tags"
                placeholder="Select tags…"
                options={options.tags.map((t) => ({ value: String(t.id), label: t.name }))}
                selected={tagIds}
                onChange={setTagIds}
              />
            </Field>
          </div>

          {/* Weights */}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Field label="Gross g"><input value={gross} onChange={(e) => setGross(e.target.value)} inputMode="decimal" placeholder="4.20" className={cn(fieldClass, "font-mono")} /></Field>
            <Field label="Net g *" error={errors.netWeight}><input value={net} onChange={(e) => setNet(e.target.value)} inputMode="decimal" placeholder="3.85" aria-invalid={!!errors.netWeight} className={cn(fieldClass, "font-mono", errors.netWeight && "border-error")} /></Field>
            <Field label="Dia ct"><input value={diamond} onChange={(e) => setDiamond(e.target.value)} inputMode="decimal" placeholder="0.75" className={cn(fieldClass, "font-mono")} /></Field>
            <Field label="Stn ct"><input value={stone} onChange={(e) => setStone(e.target.value)} inputMode="decimal" placeholder="0.40" className={cn(fieldClass, "font-mono")} /></Field>
          </div>
        </div>
      </div>

      {/* Sticky footer */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-raised/95 backdrop-blur lg:left-[var(--sz-admin-side-w)]">
        <div className="mx-auto flex max-w-[820px] items-center justify-end gap-2.5 px-4 py-3">
          <Link href="/admin/products" className="inline-flex min-h-11 items-center rounded-[var(--sz-admin-radius-control)] border border-line bg-raised px-4 text-[13px] font-semibold text-body no-underline hover:border-primary-700 hover:no-underline">
            Cancel
          </Link>
          <button
            type="button"
            onClick={save}
            disabled={pending}
            aria-busy={pending || undefined}
            className="inline-flex min-h-11 items-center gap-2 rounded-[var(--sz-admin-radius-control)] bg-primary-700 px-5 text-[13px] font-semibold text-white hover:bg-primary-800 disabled:cursor-progress disabled:opacity-[var(--sz-disabled-opacity)]"
          >
            {pending && <span className="size-4 animate-spin rounded-pill border-2 border-white/40 border-t-white" />}
            {pending ? "Saving…" : isEdit ? "Save changes" : "Create product"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <div>
      <span className={labelClass}>{label}</span>
      {children}
      {error && <p className="mt-1 text-xs text-error" role="alert">{error}</p>}
    </div>
  );
}
