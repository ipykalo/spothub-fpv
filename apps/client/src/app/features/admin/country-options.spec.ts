import { describe, expect, it } from 'vitest';

import { countryOf, countryOptions } from './country-options';

describe('countryOptions', () => {
  it('offers every country by name, with its code as the hint, sorted by name', () => {
    const options = countryOptions([]);

    expect(options).toHaveLength(249);
    expect(options.find((option) => option.value === 'UA')).toEqual({
      value: 'UA',
      label: 'Ukraine',
      hint: 'UA',
    });
    expect(options.map((option) => option.label)).toEqual(
      [...options.map((option) => option.label)].sort((a, b) => a.localeCompare(b, 'en')),
    );
  });

  it('leaves out the countries already on the list', () => {
    const values = countryOptions(['RU', 'IR']).map((option) => option.value);

    expect(values).not.toContain('RU');
    expect(values).not.toContain('IR');
    expect(values).toContain('UA');
  });
});

describe('countryOf', () => {
  it('names a pilot’s country and says whether it is restricted', () => {
    expect(countryOf('RU', ['RU', 'BY'])).toEqual({ name: 'Russia', restricted: true });
    expect(countryOf('UA', ['RU', 'BY'])).toEqual({ name: 'Ukraine', restricted: false });
    expect(countryOf(null, ['RU'])).toBeNull();
  });
});
