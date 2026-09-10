/**
 * Date-only columns must not leak a timezone-shifted timestamp to the client,
 * and a `YYYY-MM-DD` coming back must not shift either. Both directions live
 * here so the five mappers and five services that need them agree.
 */

/** A `Date` from a date-only column as the `YYYY-MM-DD` the client expects. */
export const toDateOnly = (value: Date): string => value.toISOString().slice(0, 10);

/** The same, for a nullable column. */
export const toNullableDateOnly = (value: Date | null): string | null =>
  value ? toDateOnly(value) : null;

/** `YYYY-MM-DD` is stored at UTC midnight so it round-trips as the same day. */
export const fromDateOnly = (value: string): Date => new Date(`${value}T00:00:00.000Z`);
