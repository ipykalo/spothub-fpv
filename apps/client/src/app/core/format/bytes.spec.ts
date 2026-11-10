import { describe, expect, it } from 'vitest';

import { formatBytes, percentUsed } from './bytes';

describe('bytes', () => {
  it('reads as a person would say it', () => {
    expect(formatBytes(0)).toBe('0 bytes');
    expect(formatBytes(512)).toBe('512 bytes');
    expect(formatBytes(1536)).toBe('1.5 KB');
    expect(formatBytes(25 * 1024 ** 2)).toBe('25 MB');
    expect(formatBytes(1.25 * 1024 ** 3)).toBe('1.3 GB');
    expect(formatBytes(2 * 1024 ** 3)).toBe('2 GB');
  });

  it('says how full, never past full', () => {
    expect(percentUsed(0, 100)).toBe(0);
    expect(percentUsed(50, 200)).toBe(25);
    expect(percentUsed(300, 200)).toBe(100);
    expect(percentUsed(1, 0)).toBe(100);
  });
});
