import { Directive, computed, signal } from '@angular/core';

/** What the group needs from a section — kept narrow so the two files do not import each other. */
export interface SectionMember {
  readonly open: () => boolean;
  setOpen(open: boolean): void;
}

/**
 * The sections of one page, so they can be folded and unfolded together.
 *
 * A container declares it with `hostDirectives: [SectionGroup]`. Every
 * `sh-section` rendered beneath it — inside presenters too, since DI walks up
 * through component hosts — finds it and registers itself. Sections still fold
 * one at a time; this only adds "all of them at once".
 */
@Directive({ selector: '[shSectionGroup]' })
export class SectionGroup {
  private readonly members = signal<readonly SectionMember[]>([]);

  readonly count = computed(() => this.members().length);
  readonly allOpen = computed(() => this.members().every((member) => member.open()));

  register(member: SectionMember): void {
    this.members.update((members) => [...members, member]);
  }

  unregister(member: SectionMember): void {
    this.members.update((members) => members.filter((existing) => existing !== member));
  }

  setAll(open: boolean): void {
    for (const member of this.members()) {
      member.setOpen(open);
    }
  }
}
