import { describe, expect, it } from 'vitest';

import { swipeStep } from './swipe';

describe('swipeStep', () => {
  it('moves to the next photo when the finger goes left, and back when it goes right', () => {
    expect(swipeStep(-120, 10, 250)).toBe(1);
    expect(swipeStep(120, -10, 250)).toBe(-1);
  });

  it('takes a tap or a small slip of the finger as no swipe', () => {
    expect(swipeStep(0, 0, 90)).toBe(0);
    expect(swipeStep(-25, 3, 200)).toBe(0);
  });

  it('leaves the page to scroll when the finger moved more up than across', () => {
    expect(swipeStep(-60, 200, 300)).toBe(0);
    expect(swipeStep(80, 70, 300)).toBe(0);
  });

  it('ignores a slow drag', () => {
    expect(swipeStep(-150, 0, 1500)).toBe(0);
  });
});
