/** A video on a build as the domain understands it — no ORM types. */
export interface BuildVideoEntity {
  readonly id: string;
  readonly buildId: string;
  /** Always 11 characters of YouTube's alphabet; a CHECK in the table holds it. */
  readonly youtubeId: string;
  readonly startS: number | null;
  readonly title: string | null;
  /** Where its cover is stored; null until the cover job has made it. */
  readonly coverStorageKey: string | null;
  readonly createdAt: Date;
}

/** A video still waiting for its cover, and whose it is. */
export interface CoverlessVideo {
  readonly id: string;
  readonly ownerId: string;
  readonly buildId: string;
}

/** Fields the persistence layer accepts on create. */
export interface CreateBuildVideoData {
  readonly buildId: string;
  readonly youtubeId: string;
  readonly startS: number | null;
  readonly title: string | null;
}
