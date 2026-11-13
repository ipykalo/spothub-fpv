import { z } from 'zod';

/**
 * One pilot keeping another away. The blocked pilot can no longer comment on
 * anything the blocker owns — spots, builds, posts — and the blocker no
 * longer sees their comments anywhere. Nothing tells the blocked pilot.
 */

/** A pilot the viewer has blocked, as `/account` lists them. */
export const blockedPilotSchema = z.object({
  userId: z.uuid(),
  /** Their public name — never their full Google name or email. */
  name: z.string(),
  blockedAt: z.string(),
});

export type BlockedPilotDto = z.output<typeof blockedPilotSchema>;
