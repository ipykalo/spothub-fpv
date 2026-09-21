import {
  PartCategory,
  PartCondition,
  type PartDto,
  type PartUnitDto,
} from '@spothub/shared';
import { describe, expect, it } from 'vitest';

import {
  availableUnits,
  batteryOptions,
  conditionCounts,
  fittableUnits,
  fittedCount,
  isFittable,
  partName,
  unitCount,
  unitIsFittable,
  unitName,
} from './part-condition';

/**
 * How the inventory reads: what may be fitted today, what a part and a unit
 * are called, and how a part with four units in three conditions summarises
 * itself — the question a single status field could not answer.
 */
describe('part condition', () => {
  const unit = (id: string, over: Partial<PartUnitDto> = {}): PartUnitDto => ({
    id,
    partId: 'part-1',
    condition: PartCondition.Serviceable,
    label: null,
    acquiredOn: null,
    notes: null,
    fitted: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    ...over,
  });

  const part = (over: Partial<PartDto> = {}): PartDto => ({
    id: 'part-1',
    category: PartCategory.Motor,
    manufacturer: 'T-Motor',
    model: 'Velox V2306',
    spec: {},
    notesMd: null,
    purchasePrice: null,
    purchaseCurrency: null,
    sources: [],
    units: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...over,
  });

  describe('what may be fitted', () => {
    it('offers a unit that is free and serviceable', () => {
      expect(unitIsFittable(unit('u1'))).toBe(true);
    });

    it('never offers one already on a quad, or broken, or retired', () => {
      expect(unitIsFittable(unit('u1', { fitted: true }))).toBe(false);
      expect(unitIsFittable(unit('u2', { condition: PartCondition.Broken }))).toBe(false);
      expect(unitIsFittable(unit('u3', { condition: PartCondition.Retired }))).toBe(
        false,
      );
    });

    it('counts the units, the fitted ones and the ones still available apart', () => {
      const motors = part({
        units: [
          unit('u1'),
          unit('u2', { fitted: true }),
          unit('u3', { condition: PartCondition.Broken }),
        ],
      });

      expect(unitCount(motors)).toBe(3);
      expect(fittedCount(motors)).toBe(1);
      expect(availableUnits(motors)).toBe(1);
      expect(isFittable(motors)).toBe(true);
    });

    it('is not fittable when every unit is out of action', () => {
      const motors = part({
        units: [
          unit('u1', { fitted: true }),
          unit('u2', { condition: PartCondition.Broken }),
        ],
      });

      expect(isFittable(motors)).toBe(false);
    });
  });

  describe('conditionCounts', () => {
    it('reads a four-pack with one dead motor honestly', () => {
      const motors = part({
        units: [
          unit('u1'),
          unit('u2'),
          unit('u3'),
          unit('u4', { condition: PartCondition.Broken }),
        ],
      });

      expect(conditionCounts(motors)).toEqual([
        [PartCondition.Serviceable, 3],
        [PartCondition.Broken, 1],
      ]);
    });

    it('leaves out conditions nothing is in, and keeps a fixed order', () => {
      const motors = part({
        units: [
          unit('u1', { condition: PartCondition.Retired }),
          unit('u2', { condition: PartCondition.Broken }),
        ],
      });

      expect(conditionCounts(motors)).toEqual([
        [PartCondition.Broken, 1],
        [PartCondition.Retired, 1],
      ]);
    });

    it('says nothing about a part with no units', () => {
      expect(conditionCounts(part())).toEqual([]);
    });
  });

  describe('names', () => {
    it('calls a unit by the label written on it', () => {
      const units = [unit('u1'), unit('u2', { label: 'A' })];

      expect(unitName(part({ units }), units[1])).toBe('A');
    });

    it('falls back to the unit’s place in the part, counting from one', () => {
      const units = [unit('u1'), unit('u2'), unit('u3')];

      expect(unitName(part({ units }), units[0])).toBe('#1');
      expect(unitName(part({ units }), units[2])).toBe('#3');
    });

    it('names a part by its maker and model', () => {
      expect(partName(part())).toBe('T-Motor Velox V2306');
      expect(partName(part({ manufacturer: null }))).toBe('Velox V2306');
    });

    it('falls back to the category when a part is nameless', () => {
      expect(partName(part({ manufacturer: null, model: null }))).toBe('Motor');
    });
  });

  describe('fittableUnits', () => {
    it('gathers every free unit across the inventory, named for a picker', () => {
      const motors = part({ units: [unit('u1'), unit('u2', { fitted: true })] });
      const props = part({
        id: 'part-2',
        category: PartCategory.Prop,
        manufacturer: null,
        model: null,
        units: [unit('u3', { partId: 'part-2', label: 'set B' })],
      });

      expect(fittableUnits([motors, props])).toEqual([
        { unitId: 'u1', partId: 'part-1', label: 'T-Motor Velox V2306 #1', part: motors },
        { unitId: 'u3', partId: 'part-2', label: 'Unnamed part set B', part: props },
      ]);
    });
  });

  describe('batteryOptions', () => {
    const packs = part({
      id: 'part-3',
      category: PartCategory.Battery,
      manufacturer: 'CNHL',
      model: '1500mAh 6S',
      units: [
        unit('p1', { partId: 'part-3', label: '1' }),
        unit('p2', { partId: 'part-3', label: '2', condition: PartCondition.Retired }),
      ],
    });

    it('offers only batteries', () => {
      const motors = part({ units: [unit('u1')] });

      expect(batteryOptions([motors, packs]).map((option) => option.value)).toEqual([
        'p1',
        'p2',
      ]);
    });

    it('keeps a pack that is no longer serviceable, and says so', () => {
      const [serviceable, retired] = batteryOptions([packs]);

      expect(serviceable).toMatchObject({ label: 'CNHL 1500mAh 6S 1', hint: undefined });
      // A flight flown on a pack that has since died still shows which one it was.
      expect(retired).toMatchObject({ label: 'CNHL 1500mAh 6S 2', hint: 'Retired' });
    });
  });
});
