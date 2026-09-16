import {
  type FlightDto,
  PartCategory,
  PartCondition,
  type PartDto,
  type PartUnitDto,
} from '@spothub/shared';
import { describe, expect, it } from 'vitest';

import { TIRED_SAG_TREND, packStats } from './pack-stats';

/**
 * What a pack's row is made of: its use counted from the flights flown on it,
 * and the two health readings — the charge it gives, and whether its sag is
 * growing. The arithmetic is worth holding down, because a wrong trend would
 * tell a pilot to bin a healthy pack or fly a tired one.
 */
describe('packStats', () => {
  const unit = (id: string, label: string): PartUnitDto => ({
    id,
    partId: 'part-1',
    condition: PartCondition.Serviceable,
    label,
    acquiredOn: null,
    notes: null,
    fitted: false,
    createdAt: '2026-01-01T00:00:00.000Z',
  });

  const part = (...units: PartUnitDto[]): PartDto => ({
    id: 'part-1',
    category: PartCategory.Battery,
    manufacturer: 'CNHL',
    model: 'Black Series 1500mAh 6S',
    spec: {},
    notesMd: null,
    purchasePrice: null,
    purchaseCurrency: null,
    sources: [],
    units,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  });

  /** One flight on a pack, named by what this suite cares about. */
  const flight = (
    batteryUnitId: string | null,
    day: number,
    sagV: number | null,
    mahUsed: number | null,
  ): FlightDto => ({
    id: `flight-${String(day)}`,
    sessionId: 'session-1',
    buildId: null,
    buildName: null,
    batteryUnitId,
    batteryName: null,
    modelName: null,
    fileName: 'log.csv',
    startedAt: `2026-01-${String(day).padStart(2, '0')}T12:00:00.000Z`,
    endedAt: `2026-01-${String(day).padStart(2, '0')}T12:04:00.000Z`,
    timeRecorded: true,
    durationS: 240,
    sampleCount: 240,
    startVoltage: sagV === null ? null : 25.2,
    minVoltage: sagV === null ? null : 25.2 - sagV,
    endVoltage: null,
    mahUsed,
    maxCurrentA: null,
    minLinkQuality: null,
    minRssiDbm: null,
    minSnrDb: null,
    minDownlinkQuality: null,
    maxTxPowerMw: null,
    avgThrottlePct: null,
    maxThrottlePct: null,
    minRadioVoltage: null,
    hasGps: false,
    distanceM: null,
    maxAltitudeM: null,
    maxSpeedKmh: null,
    maxHomeDistanceM: null,
  });

  /** Nine flights whose sag grows steadily: 2.0 V at the start, 3.2 V by the end. */
  const wearing = (unitId: string): FlightDto[] =>
    [2.0, 2.0, 2.0, 2.4, 2.5, 2.6, 3.2, 3.2, 3.2].map((sag, index) =>
      flight(unitId, index + 1, sag, 1200 - index * 20),
    );

  it('counts a pack that has never flown, rather than leaving it out', () => {
    const [row] = packStats(part(unit('u1', '1')), []);

    expect(row).toMatchObject({
      cycles: 0,
      airtimeS: 0,
      averageSagV: null,
      lowestVoltage: null,
      averageMahUsed: null,
      sagTrend: null,
      lastFlownAt: null,
    });
  });

  it('counts only the flights flown on that pack', () => {
    const packs = part(unit('u1', '1'), unit('u2', '2'));
    const flights = [
      flight('u1', 1, 2.0, 1000),
      flight('u2', 2, 1.0, 900),
      flight(null, 3, 1.5, 800),
    ];

    const [first, second] = packStats(packs, flights);

    expect(first.cycles).toBe(1);
    expect(second.cycles).toBe(1);
    expect(first.averageMahUsed).toBe(1000);
    expect(second.averageMahUsed).toBe(900);
  });

  it('averages the sag and the charge, and keeps the lowest the pack ever fell to', () => {
    const flights = [flight('u1', 1, 2.0, 1000), flight('u1', 2, 3.0, 900)];

    const [row] = packStats(part(unit('u1', '1')), flights);

    expect(row.averageSagV).toBeCloseTo(2.5, 5);
    expect(row.lowestVoltage).toBeCloseTo(22.2, 5);
    expect(row.averageMahUsed).toBe(950);
    expect(row.airtimeS).toBe(480);
    expect(row.lastFlownAt).toBe('2026-01-02T12:00:00.000Z');
  });

  it('ignores flights that logged no voltage or no charge, rather than counting them as zero', () => {
    const flights = [flight('u1', 1, 2.0, 1000), flight('u1', 2, null, null)];

    const [row] = packStats(part(unit('u1', '1')), flights);

    expect(row.cycles).toBe(2);
    expect(row.averageSagV).toBeCloseTo(2, 5);
    expect(row.averageMahUsed).toBe(1000);
  });

  describe('sag trend', () => {
    it('says nothing until the pack has flown enough to compare', () => {
      const flights = wearing('u1').slice(0, 5);

      expect(packStats(part(unit('u1', '1')), flights)[0]?.sagTrend).toBeNull();
    });

    it('compares the pack’s last third of flights with its first', () => {
      const [row] = packStats(part(unit('u1', '1')), wearing('u1'));

      // 2.0 V at the start, 3.2 V by the end: three fifths worse.
      expect(row.sagTrend).toBeCloseTo(0.6, 5);
      expect(row.sagTrend).toBeGreaterThan(TIRED_SAG_TREND);
    });

    it('reads the flights in the order they were flown, not the order they arrive', () => {
      const chronological = wearing('u1');
      const shuffled = [...chronological].reverse();

      const [inOrder] = packStats(part(unit('u1', '1')), chronological);
      const [jumbled] = packStats(part(unit('u1', '1')), shuffled);

      expect(jumbled.sagTrend).toBe(inOrder.sagTrend);
    });

    it('holds steady for a pack that is not wearing', () => {
      const flights = [2.0, 2.0, 2.0, 2.0, 2.0, 2.0].map((sag, index) =>
        flight('u1', index + 1, sag, 1000),
      );

      expect(packStats(part(unit('u1', '1')), flights)[0]?.sagTrend).toBe(0);
    });

    it('says nothing about a pack that never sagged at all', () => {
      const flights = [0, 0, 0, 0, 0, 0].map((sag, index) =>
        flight('u1', index + 1, sag, 1000),
      );

      expect(packStats(part(unit('u1', '1')), flights)[0]?.sagTrend).toBeNull();
    });
  });
});
