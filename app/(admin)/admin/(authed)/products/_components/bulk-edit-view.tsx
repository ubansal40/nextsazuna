"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icon, useToast } from "@/components/ui";
import { MultiSelect } from "@/components/admin/multi-select";
import { ProductThumb } from "@/components/admin/product-thumb";
import { ConfirmDialog } from "@/components/admin/confirm-dialog";
import { Switch } from "@/components/admin/switch";
import { cn } from "@/lib/cn";
import type { ProductEditorOptions, BulkProductSummary, BulkSetMode } from "@/lib/admin/catalog";
import { applyBulkEdit } from "../_actions";

/**
 * Bulk edit — /admin/products/bulk?ids=…
 *
 * The spec reaches this screen from the products list's bulk bar and from the
 * picker's tray, and draws it as the shared card editor with one card per
 * product. That is right for three products and wrong for three hundred: the
 * reason anybody selects three hundred is that they want to make ONE change to
 * all of them, and thirty screens of identical cards is not a way to do it.
 *
 * So this is the same idea with the repetition taken out: one change form, the
 * selection listed beneath it so it can be checked and trimmed. Every field is
 * behind its own tick — an untouched control sends nothing, so an empty select
 * can never be mistaken for "clear the material on 300 products".
 *
 * Name, SKU, weights and price are absent on purpose. They are per-product by
 * definition, and a bulk price would be the most destructive control here.
 */

type SetChange = { mode: BulkSetMode; ids: string[] };

const MODE_LABELS: { value: BulkSetMode; label: string }[] = [
  { value: "add", label: "Add to existing" },
  { value: "remove", label: "Remove from existing" },
  { value: "replace", label: "Replace with" },
];

export function BulkEditView({
  products,
  options,
  truncated,
}: {
  products: BulkProductSummary[];
  options: ProductEditorOptions;
  /** How many ids the URL carried beyond the cap, if any. */
  truncated: number;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [selection, setSelection] = useState(products);
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();

  const [onMaterial, setOnMaterial] = useState(false);
  const [material, setMaterial] = useState("");
  const [onPurity, setOnPurity] = useState(false);
  const [purity, setPurity] = useState("");
  const [onCategories, setOnCategories] = useState(false);
  const [categories, setCategories] = useState<SetChange>({ mode: "add", ids: [] });
  const [onTags, setOnTags] = useState(false);
  const [tags, setTags] = useState<SetChange>({ mode: "add", ids: [] });
  const [onAlways, setOnAlways] = useState(false);
  const [always, setAlways] = useState(true);

  const ids = useMemo(() => selection.map((p) => p.id), [selection]);

  const changes = useMemo(() => {
    const next: {
      material?: string;
      purity?: string;
      categories?: { mode: BulkSetMode; ids: number[] };
      tags?: { mode: BulkSetMode; ids: number[] };
      alwaysAvailable?: boolean;
    } = {};
    if (onMaterial) next.material = material;
    if (onPurity) next.purity = purity;
    if (onCategories) next.categories = { mode: categories.mode, ids: categories.ids.map(Number) };
    if (onTags) next.tags = { mode: tags.mode, ids: tags.ids.map(Number) };
    if (onAlways) next.alwaysAvailable = always;
    return next;
  }, [onMaterial, material, onPurity, purity, onCategories, categories, onTags, tags, onAlways, always]);

  const changedFields = Object.keys(changes).length;
  const ready = changedFields > 0 && selection.length > 0;

  const summary = useMemo(() => {
    const parts: string[] = [];
    const label = (list: { id: number; name: string }[], picked: string[]) =>
      list.filter((x) => picked.includes(String(x.id))).map((x) => x.name).join(", ") || "nothing";
    if (onMaterial) parts.push(`Material → ${material || "(cleared)"}`);
    if (onPurity) parts.push(`Purity → ${purity || "(cleared)"}`);
    if (onCategories) {
      const verb = categories.mode === "add" ? "Add categories" : categories.mode === "remove" ? "Remove categories" : "Replace categories with";
      parts.push(`${verb}: ${label(options.categories, categories.ids)}`);
    }
    if (onTags) {
      const verb = tags.mode === "add" ? "Add tags" : tags.mode === "remove" ? "Remove tags" : "Replace tags with";
      parts.push(`${verb}: ${label(options.tags, tags.ids)}`);
    }
    if (onAlways) parts.push(`Always available → ${always ? "on" : "off"}`);
    return parts;
  }, [onMaterial, material, onPurity, purity, onCategories, categories, onTags, tags, onAlways, always, options]);

  function apply() {
    setConfirming(false);
    startTransition(async () => {
      const result = await applyBulkEdit(ids, changes);
      if (!result.ok) {
        toast("error", result.error);
        return;
      }
      toast("success", `${result.products} product${result.products === 1 ? "" : "s"} updated.`);
      router.push("/admin/products");
      router.refresh();
    });
  }

  return (
    <div className="mx-auto max-w-[880px] pb-28">
      <div className="mb-4 flex items-start gap-2">
        <Link
          href="/admin/products"
          aria-label="Back to all products"
          className="mt-0.5 inline-flex size-9 shrink-0 items-center justify-center rounded-[var(--sz-admin-radius-control)] border border-line bg-raised text-muted no-underline hover:border-primary-700 hover:no-underline"
        >
          <Icon name="arrow-left" size={16} />
        </Link>
        <div>
          <h2 className="font-display text-2xl font-medium text-heading">Bulk edit</h2>
          <p className="mt-0.5 font-mono text-[11.5px] text-muted">
            {selection.length} product{selection.length === 1 ? "" : "s"} selected — one change, applied to every one
          </p>
        </div>
      </div>

      {selection.length === 0 ? (
        <div className="rounded-[var(--sz-admin-radius-card)] border border-line bg-raised px-4 py-14 text-center">
          <p className="text-sm font-semibold text-heading">Nothing selected</p>
          <p className="mt-1 text-[13px] text-muted">
            Pick some products on the list first, then choose Edit from the bulk bar.
          </p>
          <Link
            href="/admin/products"
            className="mt-4 inline-flex min-h-11 items-center rounded-[var(--sz-admin-radius-control)] bg-primary-700 px-4 text-[13px] font-semibold text-white no-underline hover:bg-primary-800 hover:no-underline"
          >
            Back to all products
          </Link>
        </div>
      ) : (
        <>
          {truncated > 0 && (
            <p
              role="status"
              className="mb-4 rounded-[var(--sz-admin-radius-control)] border border-accent-soft bg-warning-soft px-3 py-2 text-[12.5px] text-[var(--sz-admin-gold-ink)]"
            >
              {truncated.toLocaleString("en-IN")} more product{truncated === 1 ? " was" : "s were"} left out — bulk edit
              takes 500 at a time.
            </p>
          )}

          {/* The change */}
          <div className="overflow-hidden rounded-[var(--sz-admin-radius-card)] border border-line bg-raised">
            <div className="border-b border-line-soft px-4 py-3">
              <h3 className="text-[13px] font-semibold text-heading">Apply to all {selection.length}</h3>
              <p className="mt-0.5 text-[12px] text-muted">
                Tick a field to change it. Anything left unticked stays exactly as it is.
              </p>
            </div>

            <div className="divide-y divide-line-soft">
              <Row label="Material" on={onMaterial} setOn={setOnMaterial}>
                <SelectField
                  value={material}
                  disabled={!onMaterial}
                  onChange={setMaterial}
                  ariaLabel="New material"
                  options={[{ value: "", label: "— none —" }, ...options.materials.map((m) => ({ value: m, label: m }))]}
                />
              </Row>

              <Row label="Purity" on={onPurity} setOn={setOnPurity}>
                <SelectField
                  value={purity}
                  disabled={!onPurity}
                  onChange={setPurity}
                  ariaLabel="New purity"
                  mono
                  options={[{ value: "", label: "— none —" }, ...options.purities.map((p) => ({ value: p, label: p }))]}
                />
              </Row>

              <Row label="Categories" on={onCategories} setOn={setOnCategories}>
                <div className={cn("space-y-2", !onCategories && "pointer-events-none opacity-[var(--sz-disabled-opacity)]")}>
                  <SelectField
                    value={categories.mode}
                    disabled={!onCategories}
                    onChange={(mode) => setCategories((c) => ({ ...c, mode: mode as BulkSetMode }))}
                    ariaLabel="How to apply the categories"
                    options={MODE_LABELS}
                  />
                  <MultiSelect
                    ariaLabel="Categories"
                    placeholder="Select categories…"
                    options={options.categories.map((c) => ({ value: String(c.id), label: c.name }))}
                    selected={categories.ids}
                    onChange={(next) => setCategories((c) => ({ ...c, ids: next }))}
                  />
                </div>
              </Row>

              <Row label="Tags" on={onTags} setOn={setOnTags}>
                <div className={cn("space-y-2", !onTags && "pointer-events-none opacity-[var(--sz-disabled-opacity)]")}>
                  <SelectField
                    value={tags.mode}
                    disabled={!onTags}
                    onChange={(mode) => setTags((t) => ({ ...t, mode: mode as BulkSetMode }))}
                    ariaLabel="How to apply the tags"
                    options={MODE_LABELS}
                  />
                  <MultiSelect
                    ariaLabel="Tags"
                    placeholder="Select tags…"
                    options={options.tags.map((t) => ({ value: String(t.id), label: t.name }))}
                    selected={tags.ids}
                    onChange={(next) => setTags((t) => ({ ...t, ids: next }))}
                  />
                </div>
              </Row>

              <Row
                label="Always available"
                hint="Exempts these from the daily stock sync drafting them when they are absent from the export."
                on={onAlways}
                setOn={setOnAlways}
              >
                <span className="flex items-center gap-2.5">
                  <Switch checked={always} onChange={setAlways} label="Always available" disabled={!onAlways} />
                  <span className={cn("text-[13px]", onAlways ? "text-body" : "text-muted")}>{always ? "On" : "Off"}</span>
                </span>
              </Row>
            </div>
          </div>

          {/* The selection */}
          <div className="mt-4 overflow-hidden rounded-[var(--sz-admin-radius-card)] border border-line bg-raised">
            <div className="flex items-center justify-between gap-3 border-b border-line-soft px-4 py-3">
              <h3 className="text-[13px] font-semibold text-heading">Selection</h3>
              <span className="font-mono text-[11.5px] text-muted">
                {selection.length} product{selection.length === 1 ? "" : "s"}
              </span>
            </div>
            <ul className="max-h-[420px] divide-y divide-line-soft overflow-y-auto">
              {selection.map((product) => (
                <li key={product.id} className="flex items-center gap-3 px-4 py-2.5">
                  <ProductThumb src={product.imageUrl} alt={product.name} size={32} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-medium text-heading">{product.name}</span>
                    <span className="block font-mono text-[11px] text-muted">
                      {product.sku}
                      {product.purity ? ` · ${product.purity}` : ""}
                      {product.material ? ` · ${product.material}` : ""}
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={() => setSelection((current) => current.filter((p) => p.id !== product.id))}
                    aria-label={`Remove ${product.name} from the selection`}
                    title="Remove from selection"
                    className="inline-flex size-8 shrink-0 items-center justify-center rounded-[7px] text-muted hover:bg-admin-canvas hover:text-error"
                  >
                    <Icon name="close" size={15} />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}

      {/* Sticky footer */}
      {selection.length > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-raised/95 backdrop-blur lg:left-[var(--sz-admin-side-w)]">
          <div className="mx-auto flex max-w-[880px] items-center gap-2.5 px-4 py-3">
            <span className="mr-auto text-[12px] text-muted">
              {changedFields === 0
                ? "Tick a field above to change it"
                : `${changedFields} field${changedFields === 1 ? "" : "s"} will change on ${selection.length} product${selection.length === 1 ? "" : "s"}`}
            </span>
            <Link
              href="/admin/products"
              className="inline-flex min-h-11 items-center rounded-[var(--sz-admin-radius-control)] border border-line bg-raised px-4 text-[13px] font-semibold text-body no-underline hover:border-primary-700 hover:no-underline"
            >
              Cancel
            </Link>
            <button
              type="button"
              onClick={() => setConfirming(true)}
              disabled={!ready || pending}
              aria-busy={pending || undefined}
              className="inline-flex min-h-11 items-center gap-2 rounded-[var(--sz-admin-radius-control)] bg-primary-700 px-5 text-[13px] font-semibold text-white hover:bg-primary-800 disabled:cursor-not-allowed disabled:opacity-[var(--sz-disabled-opacity)]"
            >
              {pending && <span className="size-4 animate-spin rounded-pill border-2 border-white/40 border-t-white" />}
              {pending ? "Applying…" : `Update all ${selection.length}`}
            </button>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirming}
        title={`Update ${selection.length} product${selection.length === 1 ? "" : "s"}?`}
        confirmLabel="Apply"
        busy={pending}
        onCancel={() => setConfirming(false)}
        onConfirm={apply}
        body={
          <>
            <ul className="ml-4 list-disc space-y-1">
              {summary.map((line) => (
                <li key={line} className="text-body">
                  {line}
                </li>
              ))}
            </ul>
            <p className="mt-2">This cannot be undone from here — it is one change across the whole selection.</p>
          </>
        }
      />
    </div>
  );
}

function Row({
  label,
  hint,
  on,
  setOn,
  children,
}: {
  label: string;
  hint?: string;
  on: boolean;
  setOn: (next: boolean) => void;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-2.5 px-4 py-3.5 sm:grid-cols-[220px_1fr] sm:items-start sm:gap-4">
      <label className="flex items-start gap-2.5">
        <input
          type="checkbox"
          checked={on}
          onChange={(e) => setOn(e.target.checked)}
          className="mt-0.5 size-4 shrink-0 accent-[var(--sz-primary-700)]"
        />
        <span>
          <span className={cn("block text-[13px] font-semibold", on ? "text-heading" : "text-muted")}>{label}</span>
          {hint && <span className="mt-0.5 block text-[11.5px] text-muted">{hint}</span>}
        </span>
      </label>
      <div>{children}</div>
    </div>
  );
}

function SelectField({
  value,
  onChange,
  options,
  disabled,
  ariaLabel,
  mono,
}: {
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  disabled: boolean;
  ariaLabel: string;
  mono?: boolean;
}) {
  return (
    <select
      value={value}
      disabled={disabled}
      aria-label={ariaLabel}
      onChange={(e) => onChange(e.target.value)}
      className={cn(
        "min-h-10 w-full rounded-[var(--sz-admin-radius-control)] border border-line bg-admin-canvas px-2.5 text-[13px] text-body outline-none focus-visible:border-primary-700 disabled:opacity-[var(--sz-disabled-opacity)]",
        mono && "font-mono",
      )}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
