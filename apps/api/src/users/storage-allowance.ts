/**
 * The storage arithmetic, pure: what a pilot may keep, and whether one more
 * upload fits. Tested without a database.
 */

/** Their own limit when an admin set one, otherwise the default. */
export function storageLimit(own: number | null, fallback: number): number {
  return own ?? fallback;
}

/** Whether `bytes` more still fits under the limit. Exactly full still fits. */
export function fits(usedBytes: number, bytes: number, limitBytes: number): boolean {
  return usedBytes + bytes <= limitBytes;
}

/** "1.3 GB": what a person reads in an error message. */
export function describeBytes(bytes: number): string {
  const units = ['bytes', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let unit = 0;

  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }

  const shown =
    unit === 0 || value >= 10 ? Math.round(value) : Math.round(value * 10) / 10;
  return `${String(shown)} ${units[unit]}`;
}
