const NON_SLUG_CHARS = /[^a-z0-9]+/g;
const EDGE_HYPHENS = /^-+|-+$/g;
const COMBINING_MARKS = /[̀-ͯ]/g;

/**
 * Turns a display name into a URL-safe slug.
 *
 * Decomposes accents first so "Mörk 5\"" becomes "mork-5" rather than losing
 * the letter entirely.
 */
export function slugify(value: string): string {
  const slug = value
    .normalize('NFKD')
    .replace(COMBINING_MARKS, '')
    .toLowerCase()
    .replace(NON_SLUG_CHARS, '-')
    .replace(EDGE_HYPHENS, '');

  return slug.slice(0, 60);
}

/**
 * Appends `-2`, `-3`, … until the slug is free.
 *
 * `isTaken` is supplied by the caller so this stays a pure string helper with
 * no knowledge of the database.
 */
export async function uniqueSlug(
  value: string,
  isTaken: (candidate: string) => Promise<boolean>,
): Promise<string> {
  const base = slugify(value) || 'build';

  for (let suffix = 1; suffix < 100; suffix += 1) {
    const candidate = suffix === 1 ? base : `${base}-${suffix}`;

    if (!(await isTaken(candidate))) {
      return candidate;
    }
  }

  return `${base}-${Date.now()}`;
}
