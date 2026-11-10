/** "1.3 GB": a size the way a person reads it, the same as the API's messages. */
export function formatBytes(bytes: number): string {
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

/** How full, from 0 to 100, for a bar. Past the limit still draws as full. */
export function percentUsed(usedBytes: number, limitBytes: number): number {
  return limitBytes <= 0
    ? 100
    : Math.min(100, Math.round((usedBytes / limitBytes) * 100));
}
