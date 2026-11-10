import { describe, expect, it } from 'vitest';

import { describeBytes, fits, storageLimit } from './storage-allowance';

describe('storage allowance', () => {
  it('takes a pilot’s own limit over the default', () => {
    expect(storageLimit(null, 2048)).toBe(2048);
    expect(storageLimit(4096, 2048)).toBe(4096);
  });

  it('lets an upload in up to exactly the limit, and not a byte past it', () => {
    expect(fits(900, 100, 1000)).toBe(true);
    expect(fits(900, 101, 1000)).toBe(false);
    expect(fits(1000, 0, 1000)).toBe(true);
  });

  it('says how much in words a person reads', () => {
    expect(describeBytes(512)).toBe('512 bytes');
    expect(describeBytes(1536)).toBe('1.5 KB');
    expect(describeBytes(2 * 1024 ** 3)).toBe('2 GB');
    expect(describeBytes(1.25 * 1024 ** 3)).toBe('1.3 GB');
    expect(describeBytes(25 * 1024 ** 2)).toBe('25 MB');
  });
});
