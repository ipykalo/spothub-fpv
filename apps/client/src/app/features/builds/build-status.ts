import { BuildStatus } from '@spothub/shared';

/**
 * How a build's status looks.
 *
 * Presentation only, so it lives in the client rather than in the shared
 * contracts — the API has no opinion about icons. Kept in one place because
 * the card, the detail header and the filter all have to agree: a status that
 * is green in one place and amber in another is worse than no colour at all.
 */
export interface StatusStyle {
  /** Material Icons ligature. */
  readonly icon: string;
  /** Maps to the --status-* custom properties defined in styles.scss. */
  readonly tone: 'go' | 'stop' | 'work' | 'idle';
}

export const BUILD_STATUS_STYLES: Readonly<Record<BuildStatus, StatusStyle>> = {
  // Flying. The only status that means "this thing is ready right now".
  [BuildStatus.Active]: { icon: 'check_circle', tone: 'go' },
  // Grounded, waiting on a part — the one status that wants your attention.
  [BuildStatus.Down]: { icon: 'error', tone: 'stop' },
  // Being put together; not a problem, but not airworthy either.
  [BuildStatus.Planning]: { icon: 'build', tone: 'work' },
  // Kept for the record. Deliberately the quietest of the four.
  [BuildStatus.Retired]: { icon: 'archive', tone: 'idle' },
};
