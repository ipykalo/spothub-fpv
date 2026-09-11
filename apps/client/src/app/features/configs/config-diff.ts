import { diffLines } from 'diff';
import {
  ConfigKind,
  crossesFirmwareVersions,
  type ConfigDto,
  type ConfigWithRawDto,
} from '@spothub/shared';

/**
 * Turning two CLI captures into rows a template can render side by side.
 *
 * Diffing happens on the client because the API has no opinion about it: the
 * captures are already stored verbatim, and the comparison is a view of them.
 */

export type DiffRowKind = 'same' | 'added' | 'removed' | 'changed';

export interface DiffRow {
  readonly kind: DiffRowKind;
  readonly leftNo: number | null;
  readonly left: string | null;
  readonly rightNo: number | null;
  readonly right: string | null;
}

/**
 * Pairs removals with the additions that follow them.
 *
 * jsdiff emits a removed block then an added block for a changed region; a
 * side-by-side view wants those on the same row so the eye can compare the
 * old value with the new one rather than hunting down the column.
 */
export function buildDiffRows(left: string, right: string): readonly DiffRow[] {
  const parts = diffLines(left, right);
  const rows: DiffRow[] = [];

  let leftNo = 0;
  let rightNo = 0;

  for (let index = 0; index < parts.length; index += 1) {
    const part = parts.at(index);

    if (!part) {
      continue;
    }

    const lines = toLines(part.value);

    if (part.removed) {
      const next = parts.at(index + 1);

      // A removal immediately followed by an addition is one edit, not two.
      if (next?.added) {
        const added = toLines(next.value);
        const height = Math.max(lines.length, added.length);

        for (let row = 0; row < height; row += 1) {
          const before = lines.at(row);
          const after = added.at(row);

          rows.push({
            // Both sides present does not mean the line changed: jsdiff can
            // sweep an untouched line into a replaced block, and calling that
            // a change would have the reader hunting for a difference that is
            // not there.
            kind: rowKind(before, after),
            leftNo: before === undefined ? null : (leftNo += 1),
            left: before ?? null,
            rightNo: after === undefined ? null : (rightNo += 1),
            right: after ?? null,
          });
        }

        // The addition has been consumed by this pairing.
        index += 1;
        continue;
      }

      for (const line of lines) {
        rows.push({
          kind: 'removed',
          leftNo: (leftNo += 1),
          left: line,
          rightNo: null,
          right: null,
        });
      }

      continue;
    }

    if (part.added) {
      for (const line of lines) {
        rows.push({
          kind: 'added',
          leftNo: null,
          left: null,
          rightNo: (rightNo += 1),
          right: line,
        });
      }

      continue;
    }

    for (const line of lines) {
      rows.push({
        kind: 'same',
        leftNo: (leftNo += 1),
        left: line,
        rightNo: (rightNo += 1),
        right: line,
      });
    }
  }

  return rows;
}

function rowKind(before: string | undefined, after: string | undefined): DiffRowKind {
  if (before === undefined) {
    return 'added';
  }

  if (after === undefined) {
    return 'removed';
  }

  return before === after ? 'same' : 'changed';
}

/**
 * jsdiff keeps the trailing newline on a block, which would otherwise show up
 * as a phantom empty line at the end of every section.
 */
function toLines(value: string): readonly string[] {
  const lines = value.split('\n');

  if (lines.at(-1) === '') {
    lines.pop();
  }

  return lines;
}

/** A reason the comparison may be misleading, in the reader's words. */
export interface DiffCaveat {
  readonly severity: 'stop' | 'work';
  readonly title: string;
  readonly detail: string;
}

/**
 * What is worth warning about before someone reads the result.
 *
 * All three are real: Betaflight's own guidance is that settings do not carry
 * across firmware versions, comparing a diff with a dump compares two
 * different kinds of document, and two boards are simply two boards.
 */
export function diffCaveats(
  left: ConfigDto | ConfigWithRawDto,
  right: ConfigDto | ConfigWithRawDto,
): readonly DiffCaveat[] {
  const caveats: DiffCaveat[] = [];

  if (left.kind !== right.kind) {
    caveats.push({
      severity: 'stop',
      title: 'Comparing a diff with a dump',
      detail:
        'One lists only what was changed from default, the other lists every ' +
        'setting. Almost every line will read as added. Compare like with like.',
    });
  } else if (left.kind === ConfigKind.Dump) {
    caveats.push({
      severity: 'work',
      title: 'Comparing two dumps',
      detail:
        'A dump includes every default, so most rows will be identical. Turn ' +
        'on "changes only" to see what actually moved.',
    });
  }

  if (crossesFirmwareVersions(left.fwVersion, right.fwVersion)) {
    caveats.push({
      severity: 'stop',
      title: `Different firmware — ${left.fwVersion} and ${right.fwVersion}`,
      detail:
        'Betaflight renames settings and changes valid ranges between ' +
        'versions, so differences here may be the firmware rather than ' +
        'anything you did. Never paste one version’s settings into another.',
    });
  }

  // `mcu_id` is burned into the MCU, so a mismatch is a fact rather than a guess.
  if (left.mcuId && right.mcuId && left.mcuId !== right.mcuId) {
    caveats.push({
      severity: 'stop',
      title: 'Two different flight controllers',
      detail:
        'These captures came off different boards. Unless you swapped the FC, ' +
        'one of them belongs to another quad.',
    });
  }

  return caveats;
}
