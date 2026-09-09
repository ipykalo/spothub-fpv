import type { ConfigKind } from '@spothub/shared';

/**
 * A Betaflight capture as the domain understands it.
 *
 * `raw` is optional on the entity because a list of captures should not carry
 * ten CLI dumps; it is loaded when one capture is opened, or two are compared.
 */
export interface ConfigEntity {
  readonly id: string;
  readonly buildId: string;
  readonly capturedAt: Date;
  readonly kind: ConfigKind;
  readonly note: string | null;
  readonly raw?: string;

  readonly fwTarget: string | null;
  readonly fwVersion: string | null;
  readonly fwBuildDate: Date | null;
  readonly fwGitRev: string | null;
  readonly mspApi: string | null;
  readonly configRev: string | null;

  readonly boardName: string | null;
  readonly manufacturerId: string | null;
  readonly mcuId: string | null;
  readonly craftName: string | null;
}

/** Fields the persistence layer accepts on create — already parsed. */
export interface CreateConfigData {
  readonly buildId: string;
  readonly kind: ConfigKind;
  readonly raw: string;
  readonly note: string | null;

  readonly fwTarget: string | null;
  readonly fwVersion: string | null;
  readonly fwBuildDate: Date | null;
  readonly fwGitRev: string | null;
  readonly mspApi: string | null;
  readonly configRev: string | null;

  readonly boardName: string | null;
  readonly manufacturerId: string | null;
  readonly mcuId: string | null;
  readonly craftName: string | null;
}
