/**
 * Dates in this app travel as ISO calendar days — `2026-04-01` — with no time
 * and no zone: the day a part was fitted, not an instant. A date picker works
 * in `Date` objects, so these two cross between them in *local* time. Going
 * through `toISOString()` instead reads the day in UTC, which east of
 * Greenwich turns the first hour of every day into the day before.
 */

/** A local `Date` as its calendar day, `yyyy-mm-dd`. */
export function toIsoDate(date: Date): string {
  const year = String(date.getFullYear()).padStart(4, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

/** A calendar day as local midnight, or null for anything that is not one. */
export function fromIsoDate(value: string | null | undefined): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value ?? '');

  if (!match) {
    return null;
  }

  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(year, month - 1, day);

  // 2026-02-31 would roll over into March; it is not a day.
  return date.getMonth() === month - 1 && date.getDate() === day ? date : null;
}

/** Today, as the person at the keyboard counts it. */
export function localToday(): string {
  return toIsoDate(new Date());
}
