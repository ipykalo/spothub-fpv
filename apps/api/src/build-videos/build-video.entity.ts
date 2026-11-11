/** A video on a build as the domain understands it — no ORM types. */
export interface BuildVideoEntity {
  readonly id: string;
  readonly buildId: string;
  /** Always 11 characters of YouTube's alphabet; a CHECK in the table holds it. */
  readonly youtubeId: string;
  readonly startS: number | null;
  readonly title: string | null;
  readonly createdAt: Date;
}

/** Fields the persistence layer accepts on create. */
export interface CreateBuildVideoData {
  readonly buildId: string;
  readonly youtubeId: string;
  readonly startS: number | null;
  readonly title: string | null;
}
