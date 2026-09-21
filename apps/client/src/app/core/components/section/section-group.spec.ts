import { signal } from '@angular/core';
import { describe, expect, it } from 'vitest';

import { type SectionMember, SectionGroup } from './section-group';

/**
 * The sections of one page, folded and unfolded together.
 *
 * A group is only ever as good as its bookkeeping: a section that is
 * destroyed and never unregisters would keep the "collapse all" button
 * counting it and reporting it open forever, on a page it is no longer on.
 */
describe('SectionGroup', () => {
  function member(open = true): SectionMember & { openState: () => boolean } {
    const state = signal(open);

    return {
      open: () => state(),
      openState: () => state(),
      setOpen(next: boolean): void {
        state.set(next);
      },
    };
  }

  it('counts nothing on a page with no sections', () => {
    const group = new SectionGroup();

    expect(group.count()).toBe(0);
    // Vacuously: there is no folded section to contradict it.
    expect(group.allOpen()).toBe(true);
  });

  it('counts the sections that registered', () => {
    const group = new SectionGroup();

    group.register(member());
    group.register(member());

    expect(group.count()).toBe(2);
  });

  it('is all-open only while every section is', () => {
    const group = new SectionGroup();
    const folded = member(false);

    group.register(member(true));
    group.register(folded);

    expect(group.allOpen()).toBe(false);

    folded.setOpen(true);

    expect(group.allOpen()).toBe(true);
  });

  it('unfolds and folds every section at once', () => {
    const group = new SectionGroup();
    const first = member(false);
    const second = member(true);

    group.register(first);
    group.register(second);

    group.setAll(true);
    expect([first.openState(), second.openState()]).toEqual([true, true]);

    group.setAll(false);
    expect([first.openState(), second.openState()]).toEqual([false, false]);
    expect(group.allOpen()).toBe(false);
  });

  it('forgets a section that has gone, rather than counting it forever', () => {
    const group = new SectionGroup();
    const leaving = member(false);

    group.register(member(true));
    group.register(leaving);

    group.unregister(leaving);

    expect(group.count()).toBe(1);
    expect(group.allOpen()).toBe(true);
  });

  it('leaves a section it does not hold alone', () => {
    const group = new SectionGroup();
    const mine = member();

    group.register(mine);
    group.unregister(member());

    expect(group.count()).toBe(1);
  });

  it('never touches a section it has let go of', () => {
    const group = new SectionGroup();
    const leaving = member(true);

    group.register(leaving);
    group.unregister(leaving);
    group.setAll(false);

    expect(leaving.openState()).toBe(true);
  });
});
