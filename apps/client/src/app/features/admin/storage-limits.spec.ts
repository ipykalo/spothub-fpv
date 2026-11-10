import { describe, expect, it } from 'vitest';

import { STORAGE_LIMITS, storageLimitChoices } from './storage-limits';

describe('storageLimitChoices', () => {
  it('offers the presets, smallest first, labelled as a person reads them', () => {
    const choices = storageLimitChoices(null);

    expect(choices.map((choice) => choice.value)).toEqual(STORAGE_LIMITS);
    expect(choices[0].label).toBe('512 MB');
    expect(choices[2].label).toBe('2 GB');
  });

  it('keeps a limit that is not a preset, in its place, so it still shows as chosen', () => {
    const odd = 3 * 1024 ** 3;
    const values = storageLimitChoices(odd).map((choice) => choice.value);

    expect(values).toContain(odd);
    expect(values.indexOf(odd)).toBe(values.indexOf(2 * 1024 ** 3) + 1);
  });
});
