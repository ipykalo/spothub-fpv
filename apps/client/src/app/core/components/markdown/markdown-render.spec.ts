import type { PostImageDto } from '@spothub/shared';
import { describe, expect, it } from 'vitest';

import { type MarkdownBlock, markdownBlocks } from './markdown-render';

/**
 * A body becomes runs of HTML and players. What matters: a YouTube link on a
 * line of its own plays in place, one anywhere else stays a link, and nothing
 * a writer types — raw HTML, an outside image — gets through as markup.
 */
describe('markdownBlocks', () => {
  const ID = 'dQw4w9WgXcQ';
  const kinds = (blocks: MarkdownBlock[]): string[] => blocks.map((block) => block.kind);
  const html = (blocks: MarkdownBlock[]): string =>
    blocks.map((block) => (block.kind === 'html' ? block.html : '')).join('');

  describe('a YouTube link on its own', () => {
    it('becomes a player between the text around it', () => {
      const blocks = markdownBlocks(
        `First pack of the day.\n\nhttps://youtu.be/${ID}\n\nThen the wind came up.`,
      );

      expect(kinds(blocks)).toEqual(['html', 'video', 'html']);
      expect(blocks[1]).toEqual({
        kind: 'video',
        video: { youtubeId: ID, startS: null },
        caption: null,
      });
      expect(html(blocks)).toContain('First pack of the day.');
      expect(html(blocks)).toContain('Then the wind came up.');
    });

    it('keeps the words of a link written with them as its caption', () => {
      const [block] = markdownBlocks(
        `[Maiden flight](https://www.youtube.com/watch?v=${ID})`,
      );

      expect(block).toMatchObject({ kind: 'video', caption: 'Maiden flight' });
    });

    it('starts where the link says to', () => {
      const [block] = markdownBlocks(`https://youtu.be/${ID}?t=90`);

      expect(block).toMatchObject({
        kind: 'video',
        video: { youtubeId: ID, startS: 90 },
      });
    });

    it('takes every shape of YouTube link the shared parser does', () => {
      for (const link of [
        `https://www.youtube.com/shorts/${ID}`,
        `<https://youtube.com/live/${ID}>`,
        `https://m.youtube.com/watch?v=${ID}&t=1m30s`,
      ]) {
        expect(kinds(markdownBlocks(link))).toEqual(['video']);
      }
    });

    it('is a body of nothing but a video', () => {
      expect(kinds(markdownBlocks(`https://youtu.be/${ID}`))).toEqual(['video']);
    });
  });

  describe('a YouTube link anywhere else stays a link', () => {
    it('inside a sentence', () => {
      const blocks = markdownBlocks(`Watch [the crash](https://youtu.be/${ID}) first.`);

      expect(kinds(blocks)).toEqual(['html']);
      expect(html(blocks)).toContain(`href="https://youtu.be/${ID}"`);
    });

    it('in a list', () => {
      expect(kinds(markdownBlocks(`- https://youtu.be/${ID}`))).toEqual(['html']);
    });

    it('in a code block', () => {
      const blocks = markdownBlocks('```\nhttps://youtu.be/' + ID + '\n```');

      expect(kinds(blocks)).toEqual(['html']);
      expect(html(blocks)).toContain('<code>');
    });

    it('when it is not a YouTube link at all', () => {
      expect(kinds(markdownBlocks('https://vimeo.com/123456'))).toEqual(['html']);
    });
  });

  it('resolves a reference link defined on the other side of a video', () => {
    const blocks = markdownBlocks(
      `See [the frame][frame].\n\nhttps://youtu.be/${ID}\n\n[frame]: https://example.com/frame`,
    );

    expect(html(blocks)).toContain('href="https://example.com/frame"');
  });

  describe('what a writer cannot smuggle in', () => {
    it('shows raw HTML as text', () => {
      const out = html(markdownBlocks('<script>alert(1)</script>'));

      expect(out).not.toContain('<script>');
      expect(out).toContain('&lt;script&gt;');
    });

    it('makes a link say where it goes, open in a new tab, and lend the site nothing', () => {
      const out = html(
        markdownBlocks('Bought from [this **shop**](https://www.getfpv.com/motor).'),
      );

      expect(out).toContain('href="https://www.getfpv.com/motor"');
      expect(out).toContain('target="_blank"');
      expect(out).toContain('rel="noopener noreferrer nofollow ugc"');
      expect(out).toContain('title="Opens getfpv.com in a new tab"');
      expect(out).toContain('<strong>shop</strong>');
      expect(out).toContain('(getfpv.com)');
    });

    it('leaves a link that is not a web address as its words', () => {
      for (const body of [
        '[click me](javascript:alert(1))',
        '[click me](data:text/html,hi)',
        '[click me](file:///etc/passwd)',
      ]) {
        const out = html(markdownBlocks(body));

        expect(out, body).not.toContain('<a');
        expect(out, body).toContain('click me');
      }
    });

    it('turns an outside image into a link rather than loading it', () => {
      const out = html(markdownBlocks('![tracker](https://evil.example/pixel.gif)'));

      expect(out).not.toContain('<img');
      expect(out).toContain('href="https://evil.example/pixel.gif"');
    });

    it('shows the post’s own image, and says so when one is missing', () => {
      const image: PostImageDto = {
        id: '11111111-1111-1111-1111-111111111111',
        url: '/api/posts/p/images/i/file',
        thumbUrl: null,
        displayUrl: null,
        width: 800,
        height: 600,
      };
      const out = html(
        markdownBlocks(
          `![quad](image:${image.id})\n\n![gone](image:22222222-2222-2222-2222-222222222222)`,
          [image],
        ),
      );

      expect(out).toContain(
        '<img src="/api/posts/p/images/i/file" alt="quad" width="800" height="600">',
      );
      expect(out).toContain('<span class="sh-markdown-missing">gone</span>');
    });

    it('shows the display version, not the camera original, once there is one', () => {
      const image: PostImageDto = {
        id: '11111111-1111-1111-1111-111111111111',
        url: '/api/posts/p/images/i/file',
        thumbUrl: '/api/posts/p/images/i/thumb',
        displayUrl: '/api/posts/p/images/i/display',
        width: 4000,
        height: 3000,
      };

      expect(html(markdownBlocks(`![quad](image:${image.id})`, [image]))).toContain(
        'src="/api/posts/p/images/i/display"',
      );
    });
  });

  it('wraps a table so it scrolls sideways', () => {
    const out = html(markdownBlocks('| a | b |\n| - | - |\n| 1 | 2 |'));

    expect(out).toContain('<div class="sh-markdown-table"><table>');
  });
});
