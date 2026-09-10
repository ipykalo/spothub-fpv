/** A source row as the domain understands it — `price` is a plain number. */
export interface PartSourceEntity {
  readonly id: string;
  readonly partId: string;
  readonly vendor: string | null;
  readonly url: string | null;
  readonly price: number | null;
  readonly currency: string | null;
  readonly isPurchase: boolean;
  readonly purchasedOn: Date | null;
  readonly quantity: number;
  readonly capturedAt: Date;
}

/** Fields the persistence layer accepts when adding a source to a part. */
export interface CreatePartSourceData {
  readonly vendor: string | null;
  readonly url: string | null;
  readonly price: number | null;
  readonly currency: string | null;
  readonly isPurchase: boolean;
  readonly purchasedOn: Date | null;
  readonly quantity: number;
}

/** A sparse patch on a source. Only the keys present are written. */
export type UpdatePartSourceData = Partial<CreatePartSourceData>;
