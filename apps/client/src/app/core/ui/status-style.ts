/**
 * The visual vocabulary for a status, shared by every feature.
 *
 * Builds and parts both have lifecycles, and they should teach the reader one
 * language rather than each inventing its own: green with a tick means "good"
 * on both screens, red with an error mark means "needs attention".
 */
export interface StatusStyle {
  /** Material Icons ligature. */
  readonly icon: string;
  /** Maps to the --status-* custom properties defined in styles.scss. */
  readonly tone: StatusTone;
}

export type StatusTone =
  /** Working, deployed, airworthy. */
  | 'go'
  /** Broken or grounded — the tone that should pull the eye. */
  | 'stop'
  /** In progress; not a problem, not finished either. */
  | 'work'
  /** On the shelf and available. */
  | 'ready'
  /** Retired. Deliberately the quietest. */
  | 'idle';
