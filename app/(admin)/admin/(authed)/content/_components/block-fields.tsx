"use client";

import { flushSync } from "react-dom";
import { Icon } from "@/components/ui";
import { ImageField } from "@/components/admin/image-field";
import { Switch } from "@/components/admin/switch";
import { cn } from "@/lib/cn";
import { ITEM_KEY, selectOptions, type FieldDef, type RepeaterItem } from "@/lib/admin/homepage-schema";

/**
 * One renderer for every field in the homepage builder.
 *
 * Seven block types share five repeaters, three image fields and four CTA
 * fieldsets. Written as seven bespoke forms, each of those would be
 * reimplemented seven times and would drift; written once against `FieldDef`,
 * adding a field to a block is a line of data in `homepage-schema.ts`.
 *
 * Values are addressed by a single config key, never a dotted path. The stored
 * shape is only ever one level deep inside a repeater item, and a path resolver
 * would be machinery for a nesting level that does not exist.
 */

type Row = Record<string, unknown>;

const fieldClass =
  "min-h-[42px] w-full rounded-lg border border-line bg-raised px-2.5 text-[13px] text-heading outline-none placeholder:text-muted focus-visible:border-accent";

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/** A CTA is `{show,text,href}` — the parser drops it when `show` is false or
 *  `text` is blank, so the three are edited as one thing. */
function ctaOf(value: unknown): { show: boolean; text: string; href: string } {
  const c = (value ?? {}) as Row;
  return { show: c.show !== false, text: str(c.text), href: str(c.href) };
}

export function FieldRow({
  field,
  value,
  onChange,
  onUploading,
  slug,
  required,
}: {
  field: FieldDef;
  value: unknown;
  /** For an image this fires when the upload lands, however much later — so it
   *  must update the block or item it was rendered for, as it is by then. */
  onChange: (next: unknown) => void;
  /** An image upload started (true) or settled (false); the builder holds Save. */
  onUploading?: (busy: boolean) => void;
  /** Names the uploaded file readably. */
  slug: string;
  /** True when the parser drops this item without it. */
  required?: boolean;
}) {
  const label = (
    <span className="mb-1.5 flex flex-wrap items-baseline gap-x-1.5 text-xs font-semibold text-body">
      {field.label}
      {required && <span className="text-[10.5px] font-medium text-error">required</span>}
      {"help" in field && field.help && (
        <span className="text-[10.5px] font-medium text-muted">{field.help}</span>
      )}
    </span>
  );

  switch (field.kind) {
    case "image":
      return (
        <ImageField
          kind="content"
          shape={field.shape}
          slug={slug}
          value={str(value) || null}
          onChange={(url) => onChange(url ?? "")}
          onBusyChange={onUploading}
          hint={
            field.shape === "wide"
              ? "Shown edge-to-edge. Anything not 16:9 is centre-cropped."
              : "Anything not square is centre-cropped."
          }
        />
      );

    case "textarea":
      return (
        <label className="block">
          {label}
          <textarea
            rows={3}
            value={str(value)}
            onChange={(e) => onChange(e.target.value)}
            className={cn(fieldClass, "py-2 leading-relaxed", required && !str(value).trim() && "border-error")}
          />
        </label>
      );

    case "select": {
      // The stored value is always among the options — see `selectOptions`.
      const current = str(value);
      return (
        <label className="block">
          {label}
          <select value={current} onChange={(e) => onChange(e.target.value)} className={fieldClass}>
            {selectOptions(field.options, current).map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      );
    }

    case "number": {
      // Typed in the field's unit, stored in the parser's — see `scale`.
      const scale = field.scale ?? 1;
      return (
        <label className="block">
          {label}
          <input
            type="number"
            inputMode={scale === 1 ? "numeric" : "decimal"}
            min={field.min}
            max={field.max}
            step={scale === 1 ? undefined : "any"}
            value={typeof value === "number" ? value / scale : ""}
            onChange={(e) => {
              const typed = e.target.value;
              onChange(typed === "" ? "" : scale === 1 ? Number(typed) : Math.round(Number(typed) * scale));
            }}
            className={cn(fieldClass, "font-mono")}
          />
        </label>
      );
    }

    case "cta": {
      const cta = ctaOf(value);
      return (
        <fieldset className="rounded-lg border border-line-soft p-2.5">
          <legend className="px-1 text-xs font-semibold text-body">{field.label}</legend>
          <Switch
            label={`Show the ${field.label.toLowerCase()}`}
            checked={cta.show}
            onChange={(show) => onChange({ ...cta, show })}
          />
          {cta.show && (
            <div className="mt-2.5 grid gap-2.5 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1.5 block text-[11px] font-semibold text-muted">Button text</span>
                <input
                  value={cta.text}
                  onChange={(e) => onChange({ ...cta, text: e.target.value })}
                  className={fieldClass}
                />
              </label>
              <label className="block">
                <span className="mb-1.5 block text-[11px] font-semibold text-muted">Button link</span>
                <input
                  value={cta.href}
                  onChange={(e) => onChange({ ...cta, href: e.target.value })}
                  className={cn(fieldClass, "font-mono text-[12px]")}
                />
              </label>
            </div>
          )}
          {cta.show && !cta.text.trim() && (
            <p className="mt-1.5 text-[10.5px] text-muted">
              A button with no text is not shown.
            </p>
          )}
        </fieldset>
      );
    }

    // text and href share an input; href only differs in the hint and the font.
    default:
      return (
        <label className="block">
          {label}
          <input
            value={str(value)}
            onChange={(e) => onChange(e.target.value)}
            placeholder={field.kind === "href" ? "/jewellery or https://…" : undefined}
            className={cn(
              fieldClass,
              field.kind === "href" && "font-mono text-[12px]",
              required && !str(value).trim() && "border-error",
            )}
          />
        </label>
      );
  }
}

/** Keys for items added in this tab — a module counter, so no two Repeaters
 *  (or two mounts of one) ever hand out the same key. */
let addedItems = 0;

/**
 * A repeatable list of sub-items — slides, tiles, badges, cards, quotes.
 *
 * Reorder is buttons, not drag: HTML5 drag does not fire on touch, and this
 * admin is used on a phone. Removal stops at the schema's `min` because below
 * it the parser drops the entire block, and losing a whole homepage section to
 * a stray tap is not a recoverable mistake.
 *
 * Every change is addressed to an item by its key (`ITEM_KEY`), never its
 * position, and applied through an updater to the list as it is when React
 * gets to it. The handlers are captured at render — an image upload's for as
 * long as the upload takes — so a position or a list captured with them would,
 * applied late, write into whichever item had moved there, put back items
 * since removed, and undo edits made meanwhile.
 */
export function Repeater({
  field,
  items,
  onChange,
  onUploading,
  slug,
}: {
  field: Extract<FieldDef, { kind: "repeater" }>;
  items: RepeaterItem[];
  onChange: (update: (latest: RepeaterItem[]) => RepeaterItem[]) => void;
  onUploading?: (busy: boolean) => void;
  slug: string;
}) {
  // An item without a key (nothing should reach here unkeyed) falls back to its
  // position, which is what every item was keyed by before.
  const keyOf = (item: RepeaterItem, index: number) => item[ITEM_KEY] ?? `at-${index}`;
  const indexOf = (list: RepeaterItem[], key: string) => list.findIndex((item, n) => keyOf(item, n) === key);

  /**
   * Move an item one place, and keep focus on the button that was pressed.
   *
   * Keyed, React moves the item's own element — and the browser drops focus
   * from anything it moves. So the move is committed at once and focus handed
   * back to that same button (or its twin, once the item reaches the end), and
   * a keyboard user can keep pressing to walk the item along.
   */
  const move = (key: string, delta: number, button: HTMLButtonElement) => {
    flushSync(() =>
      onChange((latest) => {
        const from = indexOf(latest, key);
        const to = from + delta;
        if (from < 0 || to < 0 || to >= latest.length) return latest;
        const next = [...latest];
        const [moved] = next.splice(from, 1);
        next.splice(to, 0, moved);
        return next;
      }),
    );
    const target = button.disabled ? button.parentElement?.querySelector<HTMLButtonElement>("button:not(:disabled)") : button;
    target?.focus();
  };

  // `min` is re-checked against the latest list, not only by the disabled
  // button: two quick taps both land before the button re-renders.
  const remove = (key: string) =>
    onChange((latest) => (latest.length > field.min ? latest.filter((item, n) => keyOf(item, n) !== key) : latest));

  const edit = (key: string, path: string, value: unknown) =>
    onChange((latest) => latest.map((item, n) => (keyOf(item, n) === key ? { ...item, [path]: value } : item)));

  function add() {
    addedItems += 1;
    const key = `added-${addedItems}`;
    onChange((latest) => [...latest, { [ITEM_KEY]: key }]);
  }

  return (
    <div>
      <p className="mb-1.5 text-xs font-semibold text-body">{field.label}</p>
      <div className="flex flex-col gap-2.5">
        {items.map((item, i) => {
          const key = keyOf(item, i);
          return (
            <div key={key} className="rounded-lg border border-line bg-canvas p-2.5">
              <div className="mb-2.5 flex items-center gap-1">
                <span className="font-mono text-[10px] font-semibold uppercase tracking-[.08em] text-muted">
                  {field.itemLabel} {i + 1}
                </span>
                <span className="ml-auto flex items-center gap-1">
                  <button
                    type="button"
                    onClick={(e) => move(key, -1, e.currentTarget)}
                    disabled={i === 0}
                    aria-label={`Move ${field.itemLabel} ${i + 1} up`}
                    className={rowAction}
                  >
                    <Icon name="chevron-up" size={15} />
                  </button>
                  <button
                    type="button"
                    onClick={(e) => move(key, 1, e.currentTarget)}
                    disabled={i === items.length - 1}
                    aria-label={`Move ${field.itemLabel} ${i + 1} down`}
                    className={rowAction}
                  >
                    <Icon name="chevron-down" size={15} />
                  </button>
                  <button
                    type="button"
                    onClick={() => remove(key)}
                    disabled={items.length <= field.min}
                    title={
                      items.length <= field.min
                        ? `A ${field.label.toLowerCase().replace(/s$/, "")} block needs at least ${field.min}.`
                        : `Remove ${field.itemLabel} ${i + 1}`
                    }
                    aria-label={`Remove ${field.itemLabel} ${i + 1}`}
                    className={cn(rowAction, "text-error")}
                  >
                    <Icon name="trash" size={15} />
                  </button>
                </span>
              </div>

              <div className="flex flex-col gap-2.5">
                {field.fields.map((sub) => (
                  <FieldRow
                    key={sub.path}
                    field={sub}
                    required={sub.path === field.requiredPath}
                    slug={`${slug}-${field.itemLabel}-${i + 1}`}
                    value={item[sub.path]}
                    onChange={(next) => edit(key, sub.path, next)}
                    onUploading={onUploading}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <button
        type="button"
        onClick={add}
        className="mt-2.5 inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-dashed border-line px-3 text-[12.5px] font-semibold text-primary-700 hover:border-primary-700 hover:bg-primary-50"
      >
        <Icon name="plus" size={14} /> Add {field.itemLabel}
      </button>
    </div>
  );
}

const rowAction =
  "inline-flex size-8 max-[760px]:size-11 items-center justify-center rounded-[7px] text-muted hover:bg-surface hover:text-primary-700 disabled:opacity-[var(--sz-disabled-opacity)] disabled:hover:bg-transparent disabled:hover:text-muted";
