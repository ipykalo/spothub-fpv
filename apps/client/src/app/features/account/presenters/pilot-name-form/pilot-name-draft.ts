import { pilotNameSchema, publicName } from '@spothub/shared';

/** What the pilot name field holds right now, read for the form. */
export interface PilotNameDraft {
  /** What saving sends: the cleaned-up name, or null for the short form of the Google name. */
  readonly value: string | null;
  /** Why it cannot be saved, in the contract's own words; null when it can. */
  readonly error: string | null;
  /** What other pilots would see if this were saved. */
  readonly preview: string | null;
}

/**
 * Reads the field against the same schema the API applies, so the form says
 * what is wrong before anything is sent. An empty field is not an error: it
 * means "go back to the short form".
 */
export function readPilotNameDraft(
  typed: string,
  fullName: string | null,
): PilotNameDraft {
  if (typed.trim() === '') {
    return { value: null, error: null, preview: publicName(null, fullName) };
  }

  const parsed = pilotNameSchema.safeParse(typed);

  if (!parsed.success) {
    return {
      value: null,
      error: parsed.error.issues[0]?.message ?? 'That name cannot be used',
      preview: null,
    };
  }

  return { value: parsed.data, error: null, preview: parsed.data };
}
