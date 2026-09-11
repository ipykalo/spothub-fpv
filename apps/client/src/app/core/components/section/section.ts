import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  type OnInit,
  inject,
  input,
  model,
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

import { SectionGroup } from './section-group';

const STORAGE_PREFIX = 'spothub.section.';

let sectionCount = 0;

function nextBodyId(): string {
  sectionCount += 1;
  return `sh-section-${String(sectionCount)}`;
}

/**
 * A titled, collapsible region of a page — the one section heading the app
 * uses, so every page folds the same way.
 *
 * The heading is a real button with `aria-expanded`, so it collapses from the
 * keyboard and announces its state. The body is hidden rather than destroyed:
 * a half-filled form or a scrolled list survives being folded away.
 *
 * `addLabel` gives the section an "Add" button that toggles `adding`. The form
 * itself stays with the container that owns the save, and is rendered only
 * while `adding` is true — forms are asked for, never shown by default.
 *
 * Under a `SectionGroup` it registers itself, so the page's "Collapse all"
 * can reach it.
 */
@Component({
  selector: 'sh-section',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButtonModule, MatIconModule],
  templateUrl: './section.html',
  styleUrl: './section.scss',
  host: { class: 'block' },
})
export class Section implements OnInit {
  readonly heading = input.required<string>();
  /** Material Icons ligature shown beside the title. */
  readonly icon = input<string | null>(null);
  /** How many rows the section holds, shown as a badge. */
  readonly count = input<number | null>(null);
  readonly open = model(true);
  /**
   * Remembers the open state per viewer, under this key. Worth setting on
   * anything someone would fold away and expect to stay folded.
   */
  readonly storageKey = input<string | null>(null);
  /** Label for the header's Add button. No label, no button. */
  readonly adding = model(false);
  readonly addLabel = input<string | null>(null);

  protected readonly bodyId = nextBodyId();

  constructor() {
    const group = inject(SectionGroup, { optional: true });

    if (group) {
      group.register(this);
      inject(DestroyRef).onDestroy(() => {
        group.unregister(this);
      });
    }
  }

  ngOnInit(): void {
    const key = this.storageKey();
    const stored = key ? readStored(key) : null;

    if (stored !== null) {
      this.open.set(stored);
    }
  }

  /** Opens or folds the section, and remembers it when it has a storage key. */
  setOpen(open: boolean): void {
    this.open.set(open);

    const key = this.storageKey();

    if (key) {
      writeStored(key, open);
    }
  }

  protected toggle(): void {
    this.setOpen(!this.open());
  }

  protected toggleAdding(): void {
    const adding = !this.adding();
    this.adding.set(adding);

    // Asking to add to a folded section unfolds it, or the form would open
    // somewhere nobody can see it.
    if (adding && !this.open()) {
      this.setOpen(true);
    }
  }
}

/** Browser storage can be absent or blocked; the section then just forgets. */
function readStored(key: string): boolean | null {
  try {
    const value = globalThis.localStorage.getItem(STORAGE_PREFIX + key);
    return value === null ? null : value === '1';
  } catch {
    return null;
  }
}

function writeStored(key: string, open: boolean): void {
  try {
    globalThis.localStorage.setItem(STORAGE_PREFIX + key, open ? '1' : '0');
  } catch {
    // Storage blocked: the section still folds, it just will not remember.
  }
}
