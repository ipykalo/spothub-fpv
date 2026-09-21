import { DOCUMENT, Injector, runInInjectionContext } from '@angular/core';
import { type PostDto, type PostSummaryDto, Visibility } from '@spothub/shared';
import { beforeEach, describe, expect, it } from 'vitest';

import { type FakeDocument, fakeDocument } from './__fixtures__/fake-document';
import { SITE_ORIGIN } from './site-origin';
import { StructuredData } from './structured-data';

/**
 * The page described for machines. What matters is that there is exactly one
 * block, that it is replaced rather than added to as a reader moves between
 * pages — two blocks describing the same document is worse than none — and
 * that a post a pilot wrote lands in it as data, never as markup.
 */
describe('StructuredData', () => {
  const ORIGIN = 'https://spothub.example';

  const summary = (id: string, over: Partial<PostSummaryDto> = {}): PostSummaryDto => ({
    id,
    title: `Post ${id}`,
    slug: `post-${id}`,
    summary: null,
    visibility: Visibility.Public,
    publishedAt: '2026-09-01T10:00:00.000Z',
    authorName: 'Ivan',
    ownedByViewer: false,
    coverUrl: null,
    readingMinutes: 3,
    tags: [],
    likes: { count: 0, likedByViewer: false },
    commentCount: 0,
    createdAt: '2026-08-01T10:00:00.000Z',
    updatedAt: '2026-09-02T10:00:00.000Z',
    ...over,
  });

  const post = (over: Partial<PostDto> = {}): PostDto => ({
    ...summary('1'),
    bodyMd: 'Three words here',
    coverAssetId: null,
    coverImageUrl: null,
    images: [],
    builds: [],
    buildIds: [],
    ...over,
  });

  let document: FakeDocument;
  let data: StructuredData;

  beforeEach(() => {
    document = fakeDocument();

    const injector = Injector.create({
      providers: [
        { provide: DOCUMENT, useValue: document },
        { provide: SITE_ORIGIN, useValue: ORIGIN },
      ],
    });

    data = runInInjectionContext(injector, () => new StructuredData());
  });

  const written = (): Record<string, unknown> =>
    JSON.parse(document.head.children[0]?.textContent ?? '{}') as Record<string, unknown>;

  describe('the feed', () => {
    it('is a Blog holding a posting per row', () => {
      data.setBlog([summary('1'), summary('2')]);

      const blog = written();

      expect(blog['@type']).toBe('Blog');
      expect(blog.url).toBe(ORIGIN);
      expect(blog.blogPost).toHaveLength(2);
    });

    it('gives every row the address that post opens at', () => {
      data.setBlog([summary('1', { slug: 'first-flight' })]);

      const [first] = written().blogPost as { url: string }[];

      expect(first.url).toBe(`${ORIGIN}/blog/1/first-flight`);
    });

    it('dates a post from when it was published, falling back to when it was written', () => {
      data.setBlog([summary('1'), summary('2', { publishedAt: null })]);

      const rows = written().blogPost as { datePublished: string }[];

      expect(rows[0].datePublished).toBe('2026-09-01T10:00:00.000Z');
      expect(rows[1].datePublished).toBe('2026-08-01T10:00:00.000Z');
    });

    it('names a pilot who has no display name rather than leaving the author blank', () => {
      data.setBlog([summary('1', { authorName: null })]);

      const [first] = written().blogPost as { author: { name: string } }[];

      expect(first.author.name).toBe('A pilot');
    });
  });

  describe('one post', () => {
    it('is a BlogPosting with its author, its dates and the page it is', () => {
      data.setPost(post({ slug: 'first-flight' }));

      const written1 = written();

      expect(written1['@type']).toBe('BlogPosting');
      expect(written1.headline).toBe('Post 1');
      expect(written1.dateModified).toBe('2026-09-02T10:00:00.000Z');
      expect(written1.mainEntityOfPage).toEqual({
        '@type': 'WebPage',
        '@id': `${ORIGIN}/blog/1/first-flight`,
      });
      expect(written1.publisher).toMatchObject({ '@type': 'Organization' });
    });

    it('counts the words of the body, which is what earns a reading time in a result', () => {
      data.setPost(post({ bodyMd: '  one two   three\nfour  ' }));

      expect(written().wordCount).toBe(4);
    });

    it('leaves out a summary and keywords the post does not have', () => {
      data.setPost(post({ summary: null, tags: [] }));

      expect('description' in written()).toBe(false);
      expect('keywords' in written()).toBe(false);
    });

    it('lists the builds it is about as keywords', () => {
      data.setPost(
        post({
          summary: 'How it went',
          tags: [
            { id: 'b1', name: 'Cinelog20', slug: 'cinelog20' },
            { id: 'b2', name: 'Air65', slug: 'air65' },
          ],
        }),
      );

      expect(written().description).toBe('How it went');
      expect(written().keywords).toBe('Cinelog20, Air65');
    });

    it('carries a title as text, so nothing a pilot types is ever parsed as markup', () => {
      data.setPost(post({ title: '<script>alert(1)</script>' }));

      expect(written().headline).toBe('<script>alert(1)</script>');
      expect(document.head.children[0].getAttribute('type')).toBe('application/ld+json');
    });
  });

  describe('moving between pages', () => {
    it('replaces the block rather than adding another', () => {
      data.setBlog([summary('1')]);
      data.setPost(post());

      expect(document.head.children).toHaveLength(1);
      expect(written()['@type']).toBe('BlogPosting');
    });

    it('takes the block away rather than letting it go stale', () => {
      data.setPost(post());

      data.clear();

      expect(document.head.children).toEqual([]);
    });

    it('is safe to clear on a page that wrote nothing', () => {
      expect(() => {
        data.clear();
      }).not.toThrow();
    });
  });
});
