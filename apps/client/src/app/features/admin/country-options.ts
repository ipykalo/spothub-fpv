import { COUNTRY_CODES, countryName } from '@spothub/shared';

import type { ChoiceOption } from '../../core/components/choice-option';

/**
 * Every country not already on the list, by name, for the picker that adds
 * one: "Russia · RU". Typing either the name or the code finds it.
 */
export function countryOptions(
  excluded: readonly string[],
): readonly ChoiceOption<string>[] {
  return COUNTRY_CODES.filter((code) => !excluded.includes(code))
    .map((code) => ({ value: code, label: countryName(code), hint: code }))
    .sort((a, b) => a.label.localeCompare(b.label, 'en'));
}

/** How a pilot's country reads in the table, with whether it is a restricted one. */
export function countryOf(
  code: string | null,
  blocked: readonly string[],
): { readonly name: string; readonly restricted: boolean } | null {
  return code === null
    ? null
    : { name: countryName(code), restricted: blocked.includes(code) };
}
