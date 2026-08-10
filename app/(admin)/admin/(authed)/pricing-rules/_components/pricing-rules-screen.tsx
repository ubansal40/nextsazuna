"use client";

import { useState, useTransition } from "react";
import { Icon, useToast } from "@/components/ui";
import { ConfirmDialog } from "@/components/admin/confirm-dialog";
import { Switch } from "@/components/admin/switch";
import { cn } from "@/lib/cn";
import { formatPrice } from "@/lib/format";
import type { PricingRuleRow, PricingRuleInput, WeightBand, RuleTestResult } from "@/lib/admin/pricing-rules";
import type { ProductEditorOptions } from "@/lib/admin/catalog";
import {
  saveRuleAction,
  deleteRuleAction,
  setRuleActiveAction,
  reorderRulesAction,
  testRuleAction,
  type RulesResult,
} from "../_actions";

/**
 * Pricing Rules — Sazuna Admin Pricing Rules.dc.html.
 *
 * Rules are evaluated in priority order and the first match wins, so the list
 * order IS the model: dragging a row rewrites priorities. Narrow bands belong
 * at the top, a catch-all at the bottom — the empty state says exactly that,
 * because a list authored in the wrong order silently prices everything from
 * one rule.
 *
 * The nudge at the top counts products no active rule matches. Those products'
 * prices cannot be derived at all, which is invisible anywhere else in the
 * admin.
 */

const BLANK_BAND: WeightBand = { min: "", max: "" };
const BLANK: PricingRuleInput = {
  name: "",
  formula: "",
  priority: 0,
  isActive: true,
  material: "",
  purity: "",
  categoryId: null,
  grossWeight: { ...BLANK_BAND },
  netWeight: { ...BLANK_BAND },
  diamondWeight: { ...BLANK_BAND },
  stoneWeight: { ...BLANK_BAND },
};

/** The variables a formula may use, as the spec's insert chips. */
const VARIABLES = ["net_weight", "gross_weight", "diamond_weight", "stone_weight"];

const BANDS = [
  { key: "grossWeight", label: "Gross weight" },
  { key: "netWeight", label: "Net weight" },
  { key: "diamondWeight", label: "Diamond weight" },
  { key: "stoneWeight", label: "Stone weight" },
] as const;

export function PricingRulesScreen({
  initialRules,
  initialUnpriced,
  options,
}: {
  initialRules: PricingRuleRow[];
  initialUnpriced: number;
  options: ProductEditorOptions;
}) {
  const { toast } = useToast();
  const [rules, setRules] = useState(initialRules);
  const [unpriced, setUnpriced] = useState(initialUnpriced);
  const [editing, setEditing] = useState<{ id: number | null; input: PricingRuleInput } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<PricingRuleRow | null>(null);
  const [dragId, setDragId] = useState<number | null>(null);
  const [busy, startTransition] = useTransition();

  function handle(result: RulesResult, ok?: string) {
    if (result.ok) {
      setRules(result.rules);
      setUnpriced(result.unpriced);
      if (ok) toast("success", ok);
    } else {
      toast("error", result.error);
    }
  }

  const run = (action: () => Promise<RulesResult>, ok?: string) =>
    startTransition(async () => handle(await action(), ok));

  function onDrop(target: PricingRuleRow) {
    if (dragId === null || dragId === target.id) return;
    const from = rules.findIndex((r) => r.id === dragId);
    const to = rules.findIndex((r) => r.id === target.id);
    setDragId(null);
    if (from < 0 || to < 0) return;
    const next = [...rules];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);

    // Roll the list straight back if the write is refused. Here that matters
    // more than tidiness: the displayed order IS the evaluation priority, so a
    // screen left ahead of the database claims prices are derived by a rule
    // ladder the pricing engine is not using.
    const before = rules;
    setRules(next);
    startTransition(async () => {
      const result = await reorderRulesAction(next.map((r) => r.id));
      if (result.ok) {
        setRules(result.rules);
        setUnpriced(result.unpriced);
      } else {
        setRules(before);
        toast("error", result.error);
      }
    });
  }

  const setInput = (patch: Partial<PricingRuleInput>) =>
    editing && setEditing({ ...editing, input: { ...editing.input, ...patch } });

  const liveError = editing ? clientFormulaHint(editing.input.formula) : null;

  return (
    <div className="mx-auto max-w-[900px]">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-2xl font-medium text-heading">Pricing Rules</h2>
          <p className="mt-1 text-[12.5px] text-muted">
            Rules turn a SKU&rsquo;s weights into its price. Narrow bands first, a catch-all last — the first match wins.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setEditing({ id: null, input: { ...BLANK, priority: rules.length + 1 } })}
          className="inline-flex min-h-11 items-center gap-2 rounded-[var(--sz-admin-radius-control)] bg-primary-700 px-4 text-[13px] font-semibold text-white hover:bg-primary-800"
        >
          <Icon name="plus" size={16} strokeWidth={2} /> Add rule
        </button>
      </div>

      {unpriced > 0 && (
        <div role="status" className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-error-border bg-error-soft px-3.5 py-3">
          <span className="text-[12.5px] leading-relaxed text-body">
            <strong className="text-heading">
              {unpriced.toLocaleString("en-IN")} product{unpriced === 1 ? "" : "s"} have no matching rule
            </strong>{" "}
            — their price can&rsquo;t be derived. Add a catch-all rule at the lowest priority, or widen an existing rule.
          </span>
        </div>
      )}

      {rules.length === 0 ? (
        <div className="rounded-[var(--sz-admin-radius-card)] border border-line bg-raised px-4 py-10 text-center">
          <p className="font-display text-lg font-medium text-heading">No pricing rules yet</p>
          <p className="mx-auto mt-2 max-w-[46ch] text-[13px] leading-relaxed text-muted">
            Rules turn a SKU&rsquo;s weights into its sale price. Write one rule per pricing behaviour — narrow bands
            first, a catch-all last — and the first match wins.
          </p>
          <button
            type="button"
            onClick={() => setEditing({ id: null, input: { ...BLANK, priority: 1 } })}
            className="mt-4 inline-flex min-h-11 items-center rounded-[var(--sz-admin-radius-control)] bg-primary-700 px-5 text-[13px] font-semibold text-white hover:bg-primary-800"
          >
            Add your first rule
          </button>
        </div>
      ) : (
        <ul className="space-y-2">
          {rules.map((rule) => (
            <li
              key={rule.id}
              draggable
              onDragStart={() => setDragId(rule.id)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => onDrop(rule)}
              onDragEnd={() => setDragId(null)}
              className={cn(
                "rounded-[var(--sz-admin-radius-card)] border border-line bg-raised p-3",
                dragId === rule.id && "opacity-50",
                !rule.isActive && "opacity-70",
              )}
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="cursor-grab text-muted" title="Drag to reorder" aria-hidden="true">
                  <Icon name="sort" size={15} />
                </span>
                <span className="w-6 shrink-0 font-mono text-[10px] font-semibold text-muted">{rule.priority}</span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-1.5">
                    <span className="text-[13px] font-semibold text-heading">{rule.name}</span>
                    {rule.isCatchAll && (
                      <span className="rounded-pill bg-warning-soft px-1.5 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-[0.06em] text-[var(--sz-admin-gold-ink)]">
                        Catch-all
                      </span>
                    )}
                    {rule.formulaError && (
                      <span className="rounded-pill bg-error-soft px-1.5 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-[0.06em] text-error">
                        Formula invalid
                      </span>
                    )}
                  </span>
                  <span className="mt-1 flex flex-wrap gap-1">
                    {conditionChips(rule).map((chip) => (
                      <span
                        key={chip}
                        className="rounded-[5px] border border-line bg-raised px-1.5 py-0.5 font-mono text-[10.5px] text-primary-700"
                      >
                        {chip}
                      </span>
                    ))}
                  </span>
                  <span className="mt-1 block truncate font-mono text-[11px] text-muted">{rule.formula}</span>
                </span>
                <Switch
                  checked={rule.isActive}
                  onChange={(v) => run(() => setRuleActiveAction(rule.id, v))}
                  label={`Activate ${rule.name}`}
                />
                <button
                  type="button"
                  onClick={() => setEditing({ id: rule.id, input: toInput(rule) })}
                  aria-label={`Edit ${rule.name}`}
                  className="inline-flex size-9 items-center justify-center rounded-[7px] text-muted hover:bg-admin-canvas hover:text-body"
                >
                  <Icon name="wrench" size={15} />
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmDelete(rule)}
                  aria-label={`Delete ${rule.name}`}
                  className="inline-flex size-9 items-center justify-center rounded-[7px] text-muted hover:bg-error-soft hover:text-error"
                >
                  <Icon name="trash" size={15} />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {rules.length > 0 && (
        <p className="mt-2 font-mono text-[11px] text-muted">
          Row order is priority · drag a rule to reorder · the first match wins.
        </p>
      )}

      {editing && (
        <>
          <button type="button" aria-label="Close" onClick={() => setEditing(null)} className="fixed inset-0 z-40 bg-[var(--sz-overlay)]" />
          <aside
            role="dialog"
            aria-modal="true"
            aria-label={editing.id ? "Edit pricing rule" : "New pricing rule"}
            className="fixed inset-y-0 right-0 z-50 flex w-[min(452px,100vw)] flex-col bg-raised shadow-[var(--sz-shadow-drawer)]"
          >
            <div className="flex items-center justify-between border-b border-line px-4 py-3.5">
              <h3 className="font-display text-md font-medium text-heading">
                {editing.id ? "Edit rule" : "New rule"}
              </h3>
              <button
                type="button"
                onClick={() => setEditing(null)}
                aria-label="Close"
                className="inline-flex size-9 items-center justify-center rounded-[7px] text-muted hover:bg-admin-canvas"
              >
                <Icon name="close" size={18} />
              </button>
            </div>

            <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
              <label className="block">
                <span className={labelClass}>Rule name *</span>
                <input
                  value={editing.input.name}
                  onChange={(e) => setInput({ name: e.target.value })}
                  placeholder="e.g. 18KT diamond · light band"
                  className={fieldClass}
                />
              </label>
              <div className="flex items-center gap-3">
                <label className="block w-28">
                  <span className={labelClass}>Priority</span>
                  <input
                    value={editing.input.priority}
                    onChange={(e) => setInput({ priority: Number(e.target.value.replace(/\D/g, "")) || 0 })}
                    inputMode="numeric"
                    className={cn(fieldClass, "font-mono")}
                  />
                </label>
                <label className="mt-4 flex items-center gap-2">
                  <Switch
                    checked={editing.input.isActive}
                    onChange={(v) => setInput({ isActive: v })}
                    label="Rule is active"
                  />
                  <span className="text-[12.5px] font-semibold text-body">Active</span>
                </label>
              </div>

              <p className={sectionLabel}>Attribute conditions</p>
              <div className="grid grid-cols-2 gap-2.5">
                <label className="block">
                  <span className={labelClass}>Material</span>
                  <select
                    value={editing.input.material}
                    onChange={(e) => setInput({ material: e.target.value })}
                    className={fieldClass}
                  >
                    <option value="">Any</option>
                    {options.materials.map((m) => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className={labelClass}>Purity</span>
                  <select
                    value={editing.input.purity}
                    onChange={(e) => setInput({ purity: e.target.value })}
                    className={fieldClass}
                  >
                    <option value="">Any</option>
                    {options.purities.map((p) => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                </label>
                <label className="col-span-2 block">
                  <span className={labelClass}>Category</span>
                  <select
                    value={editing.input.categoryId ?? ""}
                    onChange={(e) => setInput({ categoryId: e.target.value ? Number(e.target.value) : null })}
                    className={fieldClass}
                  >
                    <option value="">Any</option>
                    {options.categories.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </label>
              </div>

              <p className={sectionLabel}>Weight ranges</p>
              <p className="-mt-1 text-[11.5px] leading-relaxed text-muted">
                Every pair is optional. Leave both blank to ignore that weight — one side blank means &ldquo;over&rdquo;
                or &ldquo;under&rdquo;.
              </p>
              <div className="space-y-2">
                {BANDS.map(({ key, label }) => (
                  <div key={key} className="flex items-center gap-2">
                    <span className="w-[104px] shrink-0 text-[11.5px] font-semibold text-body">{label}</span>
                    <input
                      value={editing.input[key].min}
                      onChange={(e) => setInput({ [key]: { ...editing.input[key], min: e.target.value } } as Partial<PricingRuleInput>)}
                      inputMode="decimal"
                      placeholder="min"
                      aria-label={`${label} minimum`}
                      className={cn(fieldClass, "font-mono")}
                    />
                    <input
                      value={editing.input[key].max}
                      onChange={(e) => setInput({ [key]: { ...editing.input[key], max: e.target.value } } as Partial<PricingRuleInput>)}
                      inputMode="decimal"
                      placeholder="max"
                      aria-label={`${label} maximum`}
                      className={cn(fieldClass, "font-mono")}
                    />
                  </div>
                ))}
              </div>

              <p className={sectionLabel}>Formula</p>
              <textarea
                value={editing.input.formula}
                onChange={(e) => setInput({ formula: e.target.value })}
                spellCheck={false}
                rows={3}
                placeholder="net_weight * 9800 * 1.14 + diamond_weight * 82000"
                aria-invalid={liveError ? true : undefined}
                aria-describedby="pr-formula-help"
                className={cn(fieldClass, "resize-y py-2 font-mono", liveError && "border-error")}
              />
              <div id="pr-formula-help" className="min-h-[18px]">
                {editing.input.formula.trim() === "" ? null : liveError ? (
                  <span role="alert" className="text-[11.5px] text-error">{liveError}</span>
                ) : (
                  <span className="text-[11.5px] text-success">Formula is valid</span>
                )}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {VARIABLES.map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setInput({ formula: `${editing.input.formula}${editing.input.formula ? " " : ""}${v}` })}
                    aria-label={`Insert ${v}`}
                    className="rounded-[5px] border border-line bg-raised px-1.5 py-1 font-mono text-[10.5px] text-primary-700 hover:border-accent"
                  >
                    {v}
                  </button>
                ))}
              </div>
              <p className="font-mono text-[10.5px] text-muted">Operators: + − * / ( )</p>

              <p className={sectionLabel}>Test this rule</p>
              {/* Keyed on the rule: the tester owns its SKU, its weights and its
                  result, and keying it means opening a different rule gets a
                  fresh instance rather than a price computed from the previous
                  rule's formula sitting under this rule's heading. */}
              <RuleTester key={editing.id ?? "new"} formula={editing.input.formula} />
            </div>

            <div className="flex gap-2.5 border-t border-line px-4 py-3.5">
              <button
                type="button"
                onClick={() => setEditing(null)}
                className="min-h-11 flex-1 rounded-[var(--sz-admin-radius-control)] border border-line text-[13px] font-semibold text-body hover:border-primary-700"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  const { id, input } = editing;
                  setEditing(null);
                  run(() => saveRuleAction(id, input), id ? "Rule saved." : "Rule added.");
                }}
                className="min-h-11 flex-1 rounded-[var(--sz-admin-radius-control)] bg-primary-700 text-[13px] font-semibold text-white hover:bg-primary-800 disabled:opacity-50"
              >
                Save rule
              </button>
            </div>
          </aside>
        </>
      )}

      <ConfirmDialog
        open={confirmDelete !== null}
        title="Delete this rule?"
        tone="danger"
        confirmLabel="Delete"
        busy={busy}
        onCancel={() => setConfirmDelete(null)}
        onConfirm={() => {
          const target = confirmDelete;
          setConfirmDelete(null);
          if (target) run(() => deleteRuleAction(target.id), "Rule deleted.");
        }}
        body={
          confirmDelete && (
            <>
              <strong className="text-body">{confirmDelete.name}</strong> will be removed. Products already saved keep
              their prices — rules only apply when a product is saved.
            </>
          )
        }
      />
    </div>
  );
}

/**
 * The drawer's "Test this rule" panel.
 *
 * Its own component so the SKU, the weights and the result belong to the rule
 * being edited rather than to the screen — the caller keys it on the rule id, so
 * there is no state left over to reset and no way for a result to outlive the
 * formula that produced it.
 *
 * It also runs its own transition: a formula test is not a save, and disabling
 * it while an unrelated reorder is in flight served no purpose.
 */
function RuleTester({ formula }: { formula: string }) {
  const [result, setResult] = useState<RuleTestResult | null>(null);
  const [sku, setSku] = useState("");
  const [weights, setWeights] = useState({ gross: "", net: "", diamond: "", stone: "" });
  const [testing, startTest] = useTransition();

  return (
    <div className="rounded-[10px] border border-line-soft bg-canvas p-2.5">
      <div className="flex gap-2">
        <input
          value={sku}
          onChange={(e) => setSku(e.target.value.toUpperCase())}
          placeholder="DGR-1000"
          aria-label="Test by SKU"
          className={cn(fieldClass, "font-mono uppercase")}
        />
        <button
          type="button"
          disabled={testing}
          onClick={() => startTest(async () => setResult(await testRuleAction(formula, { sku, ...weights })))}
          className="min-h-11 shrink-0 rounded-lg bg-body px-4 text-[13px] font-semibold text-canvas hover:bg-heading disabled:opacity-50"
        >
          Test
        </button>
      </div>
      <div className="mt-2 grid grid-cols-4 gap-1.5">
        {(["gross", "net", "diamond", "stone"] as const).map((k) => (
          <label key={k} className="block">
            <span className="mb-0.5 block font-mono text-[9px] uppercase tracking-[0.06em] text-muted">{k}</span>
            <input
              value={weights[k]}
              onChange={(e) => setWeights({ ...weights, [k]: e.target.value })}
              inputMode="decimal"
              placeholder="0.00"
              aria-label={`Test ${k} weight`}
              className={cn(fieldClass, "font-mono")}
            />
          </label>
        ))}
      </div>
      <p className="mt-1.5 text-[10.5px] text-muted">
        A SKU wins over typed weights. This tests the formula, not which rule would win.
      </p>
      {result && (
        <p
          role="status"
          className={cn(
            "mt-2 rounded-lg px-2.5 py-2 text-[12.5px]",
            result.ok ? "bg-success-soft text-success-ink" : "bg-error-soft text-error",
          )}
        >
          {result.ok ? (
            <>
              <strong className="font-mono">{formatPrice(result.price ?? "0") ?? "—"}</strong>{" "}
              <span className="font-mono text-[10.5px] opacity-80">
                (net {result.weights.net}, dia {result.weights.diamond})
              </span>
            </>
          ) : (
            result.message
          )}
        </p>
      )}
    </div>
  );
}

/** The spec's condition chips: what this rule actually narrows on. */
function conditionChips(rule: PricingRuleRow): string[] {
  const chips: string[] = [];
  if (rule.material) chips.push(rule.material);
  if (rule.purity) chips.push(rule.purity);
  if (rule.categoryName) chips.push(rule.categoryName);
  for (const { key, label } of BANDS) {
    const b = rule[key];
    if (b.min || b.max) {
      const short = label.replace(" weight", "");
      chips.push(`${short} ${b.min || "0"}–${b.max || "∞"}`);
    }
  }
  return chips;
}

/**
 * A cheap client-side read of formula validity, for the live "Formula is valid"
 * line. The authoritative check is `formulaError` on the server, which is what
 * actually refuses a save — this only exists so the author gets feedback while
 * typing, without a round trip per keystroke.
 */
function clientFormulaHint(formula: string): string | null {
  const trimmed = formula.trim();
  if (!trimmed) return "A formula is required.";
  if (trimmed.length > 500) return "That formula is too long.";
  const stripped = trimmed.replace(/\b(gross_weight|net_weight|diamond_weight|stone_weight|gwt|nwt|dwt|stnwt|gross|net|diamond|stone)\b/g, "0");
  if (/[^0-9+\-*/().\s]/.test(stripped)) return "Only weights, numbers and + − * / ( ) are allowed.";
  let depth = 0;
  for (const ch of stripped) {
    if (ch === "(") depth += 1;
    if (ch === ")") depth -= 1;
    if (depth < 0) return "Unbalanced brackets.";
  }
  return depth === 0 ? null : "Unbalanced brackets.";
}

function toInput(rule: PricingRuleRow): PricingRuleInput {
  return {
    name: rule.name,
    formula: rule.formula,
    priority: rule.priority,
    isActive: rule.isActive,
    material: rule.material ?? "",
    purity: rule.purity ?? "",
    categoryId: rule.categoryId,
    grossWeight: rule.grossWeight,
    netWeight: rule.netWeight,
    diamondWeight: rule.diamondWeight,
    stoneWeight: rule.stoneWeight,
  };
}

const sectionLabel = "mt-1 font-mono text-[10px] uppercase tracking-[0.12em] text-accent-strong";
const labelClass = "mb-1 block text-xs font-semibold text-body";
const fieldClass =
  "min-h-11 w-full rounded-[var(--sz-admin-radius-control)] border border-line bg-admin-canvas px-2.5 text-[13px] text-body outline-none placeholder:text-muted focus-visible:border-primary-700";
