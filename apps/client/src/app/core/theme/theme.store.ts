import { DOCUMENT } from '@angular/common';
import { Injectable, computed, effect, inject, signal } from '@angular/core';

export type ThemeMode = 'light' | 'dark';

/** Must match the key the inline script in `index.html` reads. */
export const THEME_STORAGE_KEY = 'spothub.theme';

/**
 * The light/dark theme, as a signal.
 *
 * One switch drives everything. `color-scheme` on the root element is what
 * Angular Material's `--mat-sys-*` tokens and our own `light-dark()` tokens
 * resolve against, so setting it flips both at once. The `.dark` class is set
 * alongside for Tailwind's `dark:` variant, for the rare case a utility needs a
 * different value rather than a different token.
 *
 * The first paint is handled earlier, by an inline script in `index.html` that
 * applies the saved choice before Angular loads. This store takes over from
 * there; without that script a returning dark-mode visitor would see a white
 * flash on every page load.
 */
@Injectable({ providedIn: 'root' })
export class ThemeStore {
  private readonly document = inject(DOCUMENT);

  private readonly mode = signal<ThemeMode>(this.initial());

  readonly current = this.mode.asReadonly();
  readonly isDark = computed(() => this.mode() === 'dark');

  constructor() {
    effect(() => {
      this.apply(this.mode());
    });
  }

  toggle(): void {
    this.mode.update((mode) => (mode === 'dark' ? 'light' : 'dark'));
  }

  /** A saved choice wins; otherwise follow the operating system. */
  private initial(): ThemeMode {
    const saved = this.read();

    if (saved) {
      return saved;
    }

    return this.document.defaultView?.matchMedia('(prefers-color-scheme: dark)').matches
      ? 'dark'
      : 'light';
  }

  private apply(mode: ThemeMode): void {
    const root = this.document.documentElement;
    root.style.colorScheme = mode;
    root.classList.toggle('dark', mode === 'dark');
    this.write(mode);
  }

  /** Storage can throw — private windows, blocked site data — and must not. */
  private read(): ThemeMode | null {
    try {
      const value = this.document.defaultView?.localStorage.getItem(THEME_STORAGE_KEY);
      return value === 'light' || value === 'dark' ? value : null;
    } catch {
      return null;
    }
  }

  private write(mode: ThemeMode): void {
    try {
      this.document.defaultView?.localStorage.setItem(THEME_STORAGE_KEY, mode);
    } catch {
      // The toggle still works for this visit; it just will not be remembered.
    }
  }
}
