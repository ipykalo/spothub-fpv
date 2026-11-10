import { CURRENCIES, CURRENCY_NAMES, type Currency } from '@spothub/shared';

import type { ChoiceOption } from './choice-option';

/**
 * Every currency a price may be in, for `sh-autocomplete`: the code as the
 * label and its name as the hint, so typing "dollar" or "zł" finds it as
 * readily as "USD". Built once; every currency field shares it.
 */
export const CURRENCY_OPTIONS: readonly ChoiceOption<Currency>[] = CURRENCIES.map(
  (code) => ({
    value: code,
    label: code,
    hint: CURRENCY_NAMES[code],
  }),
);
