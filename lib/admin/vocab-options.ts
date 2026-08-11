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
 *
 * The same rule serves the filter drawers, for a different reason. There the
 * taxonomy decides what is offered and in what order, but a value it no longer
 * contains has to stay reachable: 752 products still carry "Gold", and a filter
 * that cannot find a quarter of the catalogue is not a working filter. Appending
 * them keeps every product findable and puts the cleanup work on screen.
 */

export interface VocabOption {
  value: string;
  label: string;
}

/** Shown after a value that is no longer part of the managed vocabulary. */
export const OFF_VOCABULARY_SUFFIX = " — not in taxonomy";

/**
 * The vocabulary as options, followed by any of `alsoInUse` that has left it.
 *
 * Blank entries add nothing — every caller renders its own empty choice ("—",
 * "Any", "All materials") with its own wording. Matching is exact: these strings
 * are compared against product and rule columns elsewhere, and a
 * case-insensitive match here would offer a value that then matches nothing
 * there.
 */
export function withValuesInUse(
  vocabulary: readonly string[],
  alsoInUse: readonly string[],
): VocabOption[] {
  const options = vocabulary.map((name) => ({ value: name, label: name }));
  const known = new Set(vocabulary);
  const seen = new Set<string>();

  for (const raw of alsoInUse) {
    const value = (raw ?? "").trim();
    if (!value || known.has(value) || seen.has(value)) continue;
    seen.add(value);
    options.push({ value, label: `${value}${OFF_VOCABULARY_SUFFIX}` });
  }
  return options;
}

/** The vocabulary as options, guaranteed to contain the one stored value an
 *  editor is showing. */
export function withCurrentValue(vocabulary: readonly string[], current: string): VocabOption[] {
  return withValuesInUse(vocabulary, current ? [current] : []);
}
