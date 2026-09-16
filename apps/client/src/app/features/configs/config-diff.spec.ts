import { ConfigKind, type ConfigDto } from '@spothub/shared';
import { describe, expect, it } from 'vitest';

import { buildDiffRows, diffCaveats } from './config-diff';

/**
 * Two firmware captures read side by side, and the warnings that go above
 * them. The pairing is the part worth pinning down: a changed setting has to
 * land on one row with the old value beside the new one, or the reader is
 * hunting down the column for a difference that is right there.
 */
describe('buildDiffRows', () => {
  const lines = (
    rows: readonly { left: string | null; right: string | null }[],
  ): (string | null)[][] => rows.map((row) => [row.left, row.right]);

  it('shows an unchanged capture as itself, numbered on both sides', () => {
    const capture = 'set motor_pwm_rate = 480\nset dshot_bidir = ON\n';

    const rows = buildDiffRows(capture, capture);

    expect(rows).toHaveLength(2);
    expect(rows.every((row) => row.kind === 'same')).toBe(true);
    expect(rows.map((row) => [row.leftNo, row.rightNo])).toEqual([
      [1, 1],
      [2, 2],
    ]);
  });

  it('puts a changed setting on one row, old beside new', () => {
    const rows = buildDiffRows(
      'set motor_pwm_rate = 480\n',
      'set motor_pwm_rate = 960\n',
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      kind: 'changed',
      leftNo: 1,
      left: 'set motor_pwm_rate = 480',
      rightNo: 1,
      right: 'set motor_pwm_rate = 960',
    });
  });

  it('marks a line only on the side it exists', () => {
    const removed = buildDiffRows('set gps_provider = UBLOX\n', '');
    expect(removed[0]).toMatchObject({
      kind: 'removed',
      left: 'set gps_provider = UBLOX',
      right: null,
      rightNo: null,
    });

    const added = buildDiffRows('', 'set gps_provider = UBLOX\n');
    expect(added[0]).toMatchObject({
      kind: 'added',
      left: null,
      leftNo: null,
      right: 'set gps_provider = UBLOX',
    });
  });

  it('keeps line numbers counting per side, so neither column skips', () => {
    const rows = buildDiffRows('a\nb\nc\n', 'a\nc\n');

    expect(lines(rows)).toEqual([
      ['a', 'a'],
      ['b', null],
      ['c', 'c'],
    ]);
    expect(rows.map((row) => [row.leftNo, row.rightNo])).toEqual([
      [1, 1],
      [2, null],
      [3, 2],
    ]);
  });

  it('pairs an uneven edit and leaves the extra line on its own side', () => {
    const rows = buildDiffRows('one\n', 'first\nsecond\n');

    expect(lines(rows)).toEqual([
      ['one', 'first'],
      [null, 'second'],
    ]);
    expect(rows.map((row) => row.kind)).toEqual(['changed', 'added']);
  });

  it('does not add a phantom empty line for the trailing newline', () => {
    expect(buildDiffRows('only\n', 'only\n')).toHaveLength(1);
  });

  it('reads an empty pair of captures as nothing at all', () => {
    expect(buildDiffRows('', '')).toEqual([]);
  });
});

describe('diffCaveats', () => {
  const capture = (over: Partial<ConfigDto> = {}): ConfigDto => ({
    id: 'config-1',
    buildId: 'build-1',
    kind: ConfigKind.Diff,
    label: null,
    fwVersion: '4.5.1',
    boardName: 'SPEEDYBEEF405',
    craftName: null,
    mcuId: 'aaa',
    capturedAt: '2026-01-01',
    lineCount: 10,
    createdAt: '2026-01-01T00:00:00.000Z',
    ...over,
  });

  it('says nothing about two comparable captures', () => {
    expect(diffCaveats(capture(), capture({ id: 'config-2' }))).toEqual([]);
  });

  it('stops the reader comparing a diff with a dump', () => {
    const caveats = diffCaveats(capture(), capture({ kind: ConfigKind.Dump }));

    expect(caveats).toHaveLength(1);
    expect(caveats[0]).toMatchObject({
      severity: 'stop',
      title: 'Comparing a diff with a dump',
    });
  });

  it('warns more gently that two dumps are mostly defaults', () => {
    const dump = capture({ kind: ConfigKind.Dump });

    expect(diffCaveats(dump, dump)).toMatchObject([
      { severity: 'work', title: 'Comparing two dumps' },
    ]);
  });

  it('warns when the captures come from different firmware', () => {
    const caveats = diffCaveats(capture(), capture({ fwVersion: '4.4.3' }));

    expect(caveats.map((caveat) => caveat.title)).toContain(
      'Different firmware — 4.5.1 and 4.4.3',
    );
  });

  it('warns when the captures came off different boards', () => {
    const caveats = diffCaveats(capture(), capture({ mcuId: 'bbb' }));

    expect(caveats.map((caveat) => caveat.title)).toContain(
      'Two different flight controllers',
    );
  });

  it('says nothing about boards when one capture never recorded its MCU', () => {
    const caveats = diffCaveats(capture(), capture({ mcuId: null }));

    expect(caveats).toEqual([]);
  });

  it('stacks every reason the comparison may mislead', () => {
    const caveats = diffCaveats(
      capture(),
      capture({ kind: ConfigKind.Dump, fwVersion: '4.4.3', mcuId: 'bbb' }),
    );

    expect(caveats).toHaveLength(3);
    expect(caveats.every((caveat) => caveat.severity === 'stop')).toBe(true);
  });
});
