import { DOCUMENT, Injector, runInInjectionContext } from '@angular/core';
import { Meta, Title } from '@angular/platform-browser';
import { beforeEach, describe, expect, it } from 'vitest';

import { type FakeDocument, fakeDocument } from './__fixtures__/fake-document';
import { PageMeta } from './page-meta';
import { SITE_ORIGIN } from './site-origin';

/**
 * What a search result and a shared link show. The rules worth holding to:
 * a description is a plain-text preview rather than the Markdown a pilot
 * wrote, a card's picture has to be an address a crawler can fetch on its
 * own, and leaving a page takes away exactly what that page added — a title
 * inherited by the next page is how the wrong post ends up in a tab.
 */
describe('PageMeta', () => {
  const ORIGIN = 'https://spothub.example';

  class FakeTitle {
    current = '';

    setTitle(title: string): void {
      this.current = title;
    }
  }

  class FakeMeta {
    tags = new Map<string, string>();
    removed: string[] = [];

    updateTag(tag: { name?: string; property?: string; content: string }): void {
      this.tags.set(tag.name ?? tag.property ?? '', tag.content);
    }

    removeTag(selector: string): void {
      this.removed.push(selector);
    }
  }

  let title: FakeTitle;
  let meta: FakeMeta;
  let document: FakeDocument;
  let pageMeta: PageMeta;

  beforeEach(() => {
    title = new FakeTitle();
    meta = new FakeMeta();
    document = fakeDocument();

    const injector = Injector.create({
      providers: [
        { provide: Title, useValue: title },
        { provide: Meta, useValue: meta },
        { provide: DOCUMENT, useValue: document },
        { provide: SITE_ORIGIN, useValue: ORIGIN },
      ],
    });

    pageMeta = runInInjectionContext(injector, () => new PageMeta());
  });

  const canonical = (): string | null =>
    document.head.querySelector('link[rel="canonical"]')?.getAttribute('href') ?? null;

  describe('the basics', () => {
    it('names the site after the page, so a tab says which page it is', () => {
      pageMeta.set({ title: 'Cinelog20 build log' });

      expect(title.current).toBe('Cinelog20 build log · SpotHub FPV');
      expect(meta.tags.get('og:site_name')).toBe('SpotHub FPV');
      expect(meta.tags.get('og:title')).toBe('Cinelog20 build log');
      expect(meta.tags.get('twitter:title')).toBe('Cinelog20 build log');
    });

    it('is a website unless the page says it is an article', () => {
      pageMeta.set({ title: 'Blog' });
      expect(meta.tags.get('og:type')).toBe('website');

      pageMeta.set({ title: 'A post', type: 'article' });
      expect(meta.tags.get('og:type')).toBe('article');
    });

    it('leaves out a description a page does not have, rather than writing an empty one', () => {
      pageMeta.set({ title: 'Blog', description: null });

      expect(meta.tags.has('description')).toBe(false);
      expect(meta.tags.has('og:description')).toBe(false);
    });
  });

  describe('the description', () => {
    it('is the words of the Markdown, not its punctuation', () => {
      pageMeta.set({
        title: 'A post',
        description: '## The **crash**\n\nSee [the log](/blog/1) and <b>this</b>.',
      });

      expect(meta.tags.get('description')).toBe('The crash See the log and this .');
    });

    it('drops an image from the preview line but keeps what it was called', () => {
      pageMeta.set({ title: 'A post', description: '![the quad](image:abc) survived' });

      expect(meta.tags.get('description')).toBe('the quad survived');
    });

    it('is clipped to something a result can show, ending in an ellipsis', () => {
      pageMeta.set({ title: 'A post', description: 'word '.repeat(100) });

      const description = meta.tags.get('description') ?? '';

      expect(description).toHaveLength(200);
      expect(description.endsWith('…')).toBe(true);
    });

    it('is left whole when it already fits', () => {
      pageMeta.set({ title: 'A post', description: 'Short enough.' });

      expect(meta.tags.get('description')).toBe('Short enough.');
    });
  });

  describe('the address', () => {
    it('is absolute, and is also the canonical link', () => {
      pageMeta.set({ title: 'A post', path: '/blog/1/first-flight' });

      expect(meta.tags.get('og:url')).toBe(`${ORIGIN}/blog/1/first-flight`);
      expect(canonical()).toBe(`${ORIGIN}/blog/1/first-flight`);
    });

    it('writes one canonical link however many pages are set', () => {
      pageMeta.set({ title: 'One', path: '/blog/1' });
      pageMeta.set({ title: 'Two', path: '/blog/2' });

      expect(document.head.children).toHaveLength(1);
      expect(canonical()).toBe(`${ORIGIN}/blog/2`);
    });

    it('adds none when the page did not give one', () => {
      pageMeta.set({ title: 'A post' });

      expect(canonical()).toBeNull();
      expect(meta.tags.has('og:url')).toBe(false);
    });
  });

  describe('the picture', () => {
    it('makes a path from the site root into an address a crawler can fetch', () => {
      pageMeta.set({ title: 'A post', imageUrl: '/api/posts/1/images/2/file' });

      expect(meta.tags.get('og:image')).toBe(`${ORIGIN}/api/posts/1/images/2/file`);
      expect(meta.tags.get('twitter:image')).toBe(`${ORIGIN}/api/posts/1/images/2/file`);
    });

    it('leaves an address that is already absolute alone', () => {
      pageMeta.set({ title: 'A post', imageUrl: 'https://cdn.example/a.jpg' });

      expect(meta.tags.get('og:image')).toBe('https://cdn.example/a.jpg');
    });

    it('decides the card’s size: a picture earns the large one', () => {
      pageMeta.set({ title: 'A post', imageUrl: '/a.jpg' });
      expect(meta.tags.get('twitter:card')).toBe('summary_large_image');

      pageMeta.set({ title: 'A post' });
      expect(meta.tags.get('twitter:card')).toBe('summary');
    });
  });

  describe('an article', () => {
    it('carries its dates and its author', () => {
      pageMeta.set({
        title: 'A post',
        type: 'article',
        publishedAt: '2026-09-01T10:00:00.000Z',
        updatedAt: '2026-09-02T10:00:00.000Z',
        authorName: 'Ivan',
      });

      expect(meta.tags.get('article:published_time')).toBe('2026-09-01T10:00:00.000Z');
      expect(meta.tags.get('article:modified_time')).toBe('2026-09-02T10:00:00.000Z');
      expect(meta.tags.get('article:author')).toBe('Ivan');
    });

    it('says nothing about a date or an author it was not given', () => {
      pageMeta.set({ title: 'A post', type: 'article', publishedAt: null });

      expect(meta.tags.has('article:published_time')).toBe(false);
      expect(meta.tags.has('article:author')).toBe(false);
    });

    it('is the only kind of page that carries them', () => {
      pageMeta.set({ title: 'Blog', publishedAt: '2026-09-01T10:00:00.000Z' });

      expect(meta.tags.has('article:published_time')).toBe(false);
    });
  });

  describe('leaving a page', () => {
    it('goes back to the app’s own title', () => {
      pageMeta.set({ title: 'A post' });

      pageMeta.reset();

      expect(title.current).toBe('SpotHub FPV');
    });

    it('takes away every tag it added, so the next page inherits none', () => {
      pageMeta.set({ title: 'A post', description: 'x', imageUrl: '/a.jpg' });

      pageMeta.reset();

      expect(meta.removed).toContain('name="description"');
      expect(meta.removed).toContain('property="og:image"');
      expect(meta.removed).toContain('property="article:author"');
    });

    it('takes the canonical link with it', () => {
      pageMeta.set({ title: 'A post', path: '/blog/1' });

      pageMeta.reset();

      expect(canonical()).toBeNull();
      expect(document.head.children).toEqual([]);
    });

    it('is safe on a page that set nothing', () => {
      expect(() => {
        pageMeta.reset();
      }).not.toThrow();
    });
  });
});
