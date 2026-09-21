import {
  DOCUMENT,
  Injector,
  PLATFORM_ID,
  runInInjectionContext,
  ɵChangeDetectionScheduler,
  ɵEffectScheduler,
} from '@angular/core';
import { beforeEach, describe, expect, it } from 'vitest';

import { THEME_STORAGE_KEY, ThemeStore } from './theme.store';

/**
 * The light/dark switch. What is worth pinning down: where the first choice
 * comes from — a saved one wins, otherwise the operating system's — that the
 * choice is written back, since the inline script in `index.html` reads it on
 * the next load to avoid a white flash, and that storage being unavailable
 * never breaks the toggle. A private window throws on `localStorage`, and a
 * theme nobody can save is still a theme.
 *
 * On the server there is no viewer to have a preference, so nothing is read
 * or applied there.
 */
describe('ThemeStore', () => {
  /** Enough of a document for the store's four DOM touches. */
  interface Stage {
    readonly document: unknown;
    readonly classes: Set<string>;
    readonly style: { colorScheme: string };
    readonly stored: Map<string, string>;
    readonly reads: string[];
  }

  function stage(
    options: { prefersDark?: boolean; saved?: string; storageThrows?: boolean } = {},
  ): Stage {
    const classes = new Set<string>();
    const style = { colorScheme: '' };
    const stored = new Map<string, string>();
    const reads: string[] = [];

    if (options.saved !== undefined) {
      stored.set(THEME_STORAGE_KEY, options.saved);
    }

    const localStorage = {
      getItem(key: string): string | null {
        if (options.storageThrows) {
          throw new Error('blocked');
        }

        reads.push(key);

        return stored.get(key) ?? null;
      },
      setItem(key: string, value: string): void {
        if (options.storageThrows) {
          throw new Error('blocked');
        }

        stored.set(key, value);
      },
    };

    const document = {
      documentElement: {
        style,
        classList: {
          toggle(name: string, on: boolean): void {
            if (on) {
              classes.add(name);
            } else {
              classes.delete(name);
            }
          },
        },
      },
      defaultView: {
        localStorage,
        matchMedia: (): { matches: boolean } => ({
          matches: options.prefersDark ?? false,
        }),
      },
    };

    return { document, classes, style, stored, reads };
  }

  /**
   * Effects are run by the application in a real app. Here they are collected
   * and run on demand, so a test can see what the store applied.
   */
  class QueuedEffects {
    private readonly queued = new Set<{ run: () => void }>();

    add(effect: { run: () => void }): void {
      this.queued.add(effect);
    }

    schedule(effect: { run: () => void }): void {
      this.queued.add(effect);
    }

    remove(effect: { run: () => void }): void {
      this.queued.delete(effect);
    }

    flush(): void {
      for (const effect of [...this.queued]) {
        this.queued.delete(effect);
        effect.run();
      }
    }
  }

  interface Mounted {
    readonly store: ThemeStore;
    readonly flush: () => void;
  }

  function themeStore(scene: Stage, platform: 'browser' | 'server' = 'browser'): Mounted {
    const effects = new QueuedEffects();
    const injector = Injector.create({
      providers: [
        { provide: DOCUMENT, useValue: scene.document },
        { provide: PLATFORM_ID, useValue: platform },
        { provide: ɵEffectScheduler, useValue: effects },
        {
          provide: ɵChangeDetectionScheduler,
          useValue: { notify: (): void => undefined },
        },
      ],
    });

    const store = runInInjectionContext(injector, () => new ThemeStore());

    return {
      store,
      flush: (): void => {
        effects.flush();
      },
    };
  }

  let scene: Stage;

  beforeEach(() => {
    scene = stage();
  });

  describe('the first choice', () => {
    it('is what was saved last time', () => {
      const { store } = themeStore(stage({ saved: 'dark', prefersDark: false }));

      expect(store.current()).toBe('dark');
      expect(store.isDark()).toBe(true);
    });

    it('follows the operating system when nothing was saved', () => {
      expect(themeStore(stage({ prefersDark: true })).store.current()).toBe('dark');
      expect(themeStore(stage({ prefersDark: false })).store.current()).toBe('light');
    });

    it('ignores a saved value that is not a theme', () => {
      const { store } = themeStore(stage({ saved: 'solarized', prefersDark: true }));

      expect(store.current()).toBe('dark');
    });

    it('follows the operating system when the saved choice cannot be read at all', () => {
      // A private window throws on `localStorage` but still answers
      // `matchMedia`, so there is a preference to fall back to.
      const { store } = themeStore(stage({ storageThrows: true, prefersDark: true }));

      expect(store.current()).toBe('dark');
    });
  });

  describe('applying it', () => {
    it('sets the colour scheme every token resolves against', () => {
      const { flush } = themeStore(scene);

      flush();

      expect(scene.style.colorScheme).toBe('light');
      expect(scene.classes.has('dark')).toBe(false);
    });

    it('adds the class Tailwind’s dark variant needs, and takes it away again', () => {
      const { store, flush } = themeStore(scene);

      store.toggle();
      flush();
      expect(scene.style.colorScheme).toBe('dark');
      expect(scene.classes.has('dark')).toBe(true);

      store.toggle();
      flush();
      expect(scene.classes.has('dark')).toBe(false);
    });

    it('remembers the choice, which is what the first paint reads next time', () => {
      const { store, flush } = themeStore(scene);

      store.toggle();
      flush();

      expect(scene.stored.get(THEME_STORAGE_KEY)).toBe('dark');
    });
  });

  describe('toggling', () => {
    it('goes the other way each time', () => {
      const { store } = themeStore(stage({ saved: 'light' }));

      store.toggle();
      expect(store.current()).toBe('dark');

      store.toggle();
      expect(store.current()).toBe('light');
      expect(store.isDark()).toBe(false);
    });

    it('still works when the browser refuses to remember it', () => {
      const throwing = stage({ storageThrows: true, prefersDark: false });
      const { store, flush } = themeStore(throwing);

      store.toggle();

      expect(() => {
        flush();
      }).not.toThrow();
      expect(store.current()).toBe('dark');
      expect(throwing.style.colorScheme).toBe('dark');
    });
  });

  describe('on the server', () => {
    it('reads nothing, applies nothing and assumes light', () => {
      const server = stage({ saved: 'dark', prefersDark: true });

      const { store, flush } = themeStore(server, 'server');
      flush();

      expect(store.current()).toBe('light');
      expect(server.reads).toEqual([]);
      expect(server.style.colorScheme).toBe('');
    });
  });
});
