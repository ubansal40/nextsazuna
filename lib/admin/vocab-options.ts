/**
 * Offering a managed vocabulary in a `<select>` without losing what is already
 * stored. Pure, and free of `server-only` so `scripts/check-pricing.mts` can
 * exercise it.
 *
 * `getProductEditorOptions` offers the taxonomy — the materials and purities the
 * owner curates — rather than every string the catalogue has ever held. That is
 * right for choosing a value and wrong for displaying one: a product bought in
 * 2024 on "Gold", or a pricing rule written against a material since renamed,
 * still carries a value the list no longer contains.
 *
 * A `<select>` whose `value` matches no `<option>` does not error. It renders
 * the first option instead — so the screen shows "Any material" while the rule
 * it is editing actually says "Yellow Gold". Nothing is thrown, nothing is
 * logged, and the operator is simply told something untrue about their own data.
 *
 * So the stored value is always among the options. It is appended rather than
 * sorted in, and labelled, because an entry that is not in the vocabulary is
 * worth noticing: it is either history to leave alone or a gap in the taxonomy
 * to fill.
 */

export interface VocabOption {
  value: string;
  label: string;
}

/** Shown after a value that is no longer part of the managed vocabulary. */
export const OFF_VOCABULARY_SUFFIX = " — not in taxonomy";

/**
 * The vocabulary as options, guaranteed to contain `current`.
 *
 * A blank `current` means "nothing chosen" and adds no option — every caller
 * renders its own empty choice ("—", "Any", "— none —") with its own wording.
 * Matching is exact: these strings are compared against product and rule columns
 * elsewhere, and a case-insensitive match here would offer a value that then
 * matches nothing there.
 */
export function withCurrentValue(vocabulary: readonly string[], current: string): VocabOption[] {
  const options = vocabulary.map((name) => ({ value: name, label: name }));
  const value = (current ?? "").trim();
  if (!value) return options;
  if (vocabulary.some((name) => name === value)) return options;
  return [...options, { value, label: `${value}${OFF_VOCABULARY_SUFFIX}` }];
}
