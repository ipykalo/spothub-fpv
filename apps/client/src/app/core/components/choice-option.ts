/**
 * One entry in a picker or a filter row: the value it stands for and how it
 * reads. Shared by `Autocomplete` and `FilterChips`, so a list of options is
 * built once and handed to either.
 */
export interface ChoiceOption<T> {
  readonly value: T;
  readonly label: string;
  /** Material Icons ligature, shown before the label. */
  readonly icon?: string;
  /** Secondary text — shown muted, and searched along with the label. */
  readonly hint?: string;
}

/**
 * Options from an enum's values and its label table, in the order given.
 *
 * Nearly every picker in the app is an enum with a label map in
 * `@spothub/shared`, so this is the one place that pairing is written.
 */
export function choicesFrom<T extends string>(
  values: readonly T[],
  labels: Readonly<Record<T, string>>,
  icons?: Readonly<Record<T, string>>,
): readonly ChoiceOption<T>[] {
  return values.map((value) => ({
    value,
    label: labels[value],
    ...(icons ? { icon: icons[value] } : {}),
  }));
}
