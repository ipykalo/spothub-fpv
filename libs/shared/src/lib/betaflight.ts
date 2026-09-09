/**
 * Reads the identity out of a Betaflight CLI capture.
 *
 * Lives in `shared` rather than the API because both sides need it: the paste
 * form shows what it detected before saving, and the API stores the same
 * fields. One parser means the preview cannot disagree with what is recorded.
 *
 * Field names follow Betaflight's own vocabulary — `board_name`,
 * `manufacturer_id`, `mcu_id` — rather than inventing synonyms for them.
 *
 * A real `diff all` opens like this:
 *
 * ```
 * # diff all
 *
 * # version
 * # Betaflight / STM32F405 (S405) 4.5.0 Dec  2 2024 / 07:10:30 (c155f5830) MSP API: 1.46
 *
 * # config rev: cb1d3ac
 *
 * # start the command batch
 * batch start
 *
 * board_name BETAFPVF405
 * manufacturer_id BEFH
 * mcu_id 003a00263437511035333935
 * ```
 */

import { ConfigKind } from './enums';

export interface BetaflightIdentity {
  readonly kind: ConfigKind;
  /** e.g. STM32F405 */
  readonly fwTarget: string | null;
  /** e.g. 4.5.0 */
  readonly fwVersion: string | null;
  /** `YYYY-MM-DD`, or null when the header is absent or unparseable. */
  readonly fwBuildDate: string | null;
  /** Short git hash of the firmware build. */
  readonly fwGitRev: string | null;
  /** MSP protocol version, e.g. 1.46 */
  readonly mspApi: string | null;
  /** The board config revision the firmware was built against. */
  readonly configRev: string | null;
  readonly boardName: string | null;
  /** Four-letter manufacturer code, e.g. BEFH. */
  readonly manufacturerId: string | null;
  /** Unique to the physical flight controller. */
  readonly mcuId: string | null;
  readonly craftName: string | null;
}

/**
 * The version comment, which is the only line whose shape is guaranteed.
 *
 * Deliberately tolerant: the MSP API suffix arrived in later versions, the
 * short target code in brackets is not always present, and the day in the
 * build date may be space-padded. Anything missing comes back null rather
 * than failing the whole parse — a capture is worth keeping even when the
 * header is unusual.
 */
const VERSION_LINE =
  /^#\s*Betaflight\s*\/\s*(\S+)(?:\s*\([^)]*\))?\s+(\d+\.\d+\.\d+\S*)\s+(\w{3}\s+\d{1,2}\s+\d{4})\s*\/\s*(\d{2}:\d{2}:\d{2})\s*\(([0-9a-f]+)\)(?:\s*MSP API:\s*(\S+))?/im;

const CONFIG_REV = /^#\s*config rev:\s*(\S+)/im;

const MONTHS: Readonly<Record<string, string>> = {
  jan: '01',
  feb: '02',
  mar: '03',
  apr: '04',
  may: '05',
  jun: '06',
  jul: '07',
  aug: '08',
  sep: '09',
  oct: '10',
  nov: '11',
  dec: '12',
};

/** A bare CLI setting line: `board_name BETAFPVF405`. */
function setting(text: string, name: string): string | null {
  const match = new RegExp(`^\\s*${name}\\s+(\\S.*?)\\s*$`, 'im').exec(text);
  return match?.[1] ?? null;
}

/** `Dec  2 2024` -> `2024-12-02`. Betaflight space-pads single-digit days. */
function toIsoDate(value: string): string | null {
  const match = /^(\w{3})\s+(\d{1,2})\s+(\d{4})$/.exec(value.trim());

  if (!match) {
    return null;
  }

  const month = MONTHS[match[1].toLowerCase()];

  if (!month) {
    return null;
  }

  return `${match[3]}-${month}-${match[2].padStart(2, '0')}`;
}

/**
 * `diff` or `dump`.
 *
 * The command echo is the reliable signal. Failing that, a dump is
 * recognisable by carrying every setting, so it is far longer — but rather
 * than guess on length, default to DIFF, which is what Betaflight tells
 * people to keep.
 */
function detectKind(text: string): ConfigKind {
  if (/^#\s*dump\b/im.test(text)) {
    return ConfigKind.Dump;
  }

  return ConfigKind.Diff;
}

export function parseBetaflightConfig(raw: string): BetaflightIdentity {
  const version = VERSION_LINE.exec(raw);
  const buildDate = version?.[3] ?? null;

  return {
    kind: detectKind(raw),
    fwTarget: version?.[1] ?? null,
    fwVersion: version?.[2] ?? null,
    fwBuildDate: buildDate ? toIsoDate(buildDate) : null,
    fwGitRev: version?.[5] ?? null,
    mspApi: version?.[6] ?? null,
    configRev: CONFIG_REV.exec(raw)?.[1] ?? null,
    boardName: setting(raw, 'board_name'),
    manufacturerId: setting(raw, 'manufacturer_id'),
    mcuId: setting(raw, 'mcu_id'),
    // `set craft_name = X` in older versions, a bare setting in newer ones.
    craftName:
      setting(raw, 'craft_name') ??
      /^\s*set\s+craft_name\s*=\s*(\S.*?)\s*$/im.exec(raw)?.[1] ??
      null,
  };
}

/**
 * Whether two captures came from the same physical flight controller.
 *
 * `mcu_id` is burned into the MCU, so this is the one honest answer to "is
 * this the same board". Unknown on either side means unknown, not "yes".
 */
export function sameBoard(a: BetaflightIdentity, b: BetaflightIdentity): boolean | null {
  if (!a.mcuId || !b.mcuId) {
    return null;
  }

  return a.mcuId === b.mcuId;
}

/**
 * Betaflight's own warning, in code.
 *
 * "Never paste a diff or dump from one firmware version into a different
 * version — variable names and valid ranges change between releases and will
 * silently corrupt the configuration." Comparing across a minor version is
 * where that starts to bite.
 */
export function crossesFirmwareVersions(a: string | null, b: string | null): boolean {
  if (!a || !b) {
    return false;
  }

  const majorMinor = (value: string): string => value.split('.').slice(0, 2).join('.');

  return majorMinor(a) !== majorMinor(b);
}

/**
 * A filename matching what Betaflight Configurator saves.
 *
 * Its CLI tab writes `BTFL_cli_<craft>_<datetime>.txt`, so exports from here
 * sort alongside backups taken the usual way rather than looking like a
 * different tool's files.
 */
export function configFileName(
  identity: Pick<BetaflightIdentity, 'craftName' | 'boardName' | 'fwTarget'>,
  capturedAt: Date,
): string {
  // Craft name first, since that is what Configurator uses; the board is a
  // reasonable fallback when the quad was never named in Betaflight.
  const subject =
    identity.craftName ?? identity.boardName ?? identity.fwTarget ?? 'config';

  const pad = (value: number): string => String(value).padStart(2, '0');
  const stamp =
    `${capturedAt.getFullYear()}${pad(capturedAt.getMonth() + 1)}${pad(capturedAt.getDate())}` +
    `_${pad(capturedAt.getHours())}${pad(capturedAt.getMinutes())}${pad(capturedAt.getSeconds())}`;

  // Anything a filesystem would object to becomes an underscore.
  const safe = subject.replace(/[^A-Za-z0-9._-]+/g, '_').replace(/^_+|_+$/g, '');

  return `BTFL_cli_${safe || 'config'}_${stamp}.txt`;
}
