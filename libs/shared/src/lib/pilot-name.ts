import { z } from 'zod';

/**
 * What a pilot calls themselves on the site — a callsign, a nickname, or
 * their name if they like. Letters in any alphabet, digits, spaces and
 * `. _ ' -`: nothing a page could mistake for markup or a link.
 */
export const pilotNameSchema = z
  .string()
  .trim()
  .min(2, 'At least 2 characters')
  .max(32, 'At most 32 characters')
  .regex(/^[\p{L}\p{N}][\p{L}\p{N} ._'-]*$/u, 'Letters, digits, spaces and . _ \' - only');

/** Setting it, or clearing it with null to go back to the short form of the Google name. */
export const updatePilotNameSchema = z.object({
  pilotName: pilotNameSchema.nullable(),
});

export type UpdatePilotNameDto = z.output<typeof updatePilotNameSchema>;

/** The name answered after a change, as the account page and the toolbar show it. */
export interface PilotNameDto {
  readonly pilotName: string | null;
  readonly publicName: string | null;
}

/**
 * The name anyone else sees: the pilot name they chose, else their Google name
 * cut to the first name and the last name's initial — "Ivan P.", never the
 * full name a stranger never agreed to publish. Null when there is neither.
 */
export function publicName(pilotName: string | null, fullName: string | null): string | null {
  const chosen = pilotName?.trim();

  if (chosen) {
    return chosen;
  }

  const words = (fullName ?? '').trim().split(/\s+/).filter(Boolean);

  if (words.length === 0) {
    return null;
  }

  const [first] = words;

  if (words.length === 1) {
    return first;
  }

  const initial = Array.from(words[words.length - 1])[0].toLocaleUpperCase();
  return `${first} ${initial}.`;
}
