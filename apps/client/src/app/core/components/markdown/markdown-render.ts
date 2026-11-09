import {
  POST_IMAGE_SCHEME,
  type PostImageDto,
  type YouTubeVideo,
  parseYouTubeUrl,
} from '@spothub/shared';
import { Marked, type Token, type Tokens, type TokensList } from 'marked';

/**
 * Markdown to HTML, kept apart from the component that shows it so a spec can
 * test it without loading Angular Material through the video player.
 */

const ESCAPES: Readonly<Record<string, string>> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

const escapeHtml = (text: string): string =>
  text.replace(/[&<>"']/g, (char) => ESCAPES[char] ?? char);

/** One piece of a rendered body: a run of ordinary Markdown, or a video standing alone. */
export type MarkdownBlock =
  | { readonly kind: 'html'; readonly html: string }
  | {
      readonly kind: 'video';
      readonly video: YouTubeVideo;
      /** The link's own words, when the writer gave it some. */
      readonly caption: string | null;
    };

/**
 * A body as the page shows it: runs of Markdown rendered to HTML, broken
 * wherever a paragraph is nothing but a YouTube link — that paragraph becomes
 * a player rather than a link out. A video link inside a sentence, a list or a
 * quote stays an ordinary link: only a link on its own was put there to be
 * watched.
 *
 * The HTML has what a writer could smuggle in taken out before Angular's own
 * sanitizer sees it, and is still bound through `[innerHTML]`, so Angular
 * sanitizes it once more. `images` are the post's own uploads:
 * `![caption](image:<id>)` shows one of them. Any other image address is
 * offered as a link instead — loading it would tell that host who read the page.
 */
export function markdownBlocks(
  source: string,
  images: readonly PostImageDto[] = [],
): MarkdownBlock[] {
  const markdown = markedFor(images);
  const tokens = markdown.lexer(source);
  const blocks: MarkdownBlock[] = [];
  let run: Token[] = [];

  const flush = (): void => {
    if (run.length === 0) {
      return;
    }

    // `links` carries reference-style link definitions; every run needs them.
    const list: TokensList = Object.assign(run, { links: tokens.links });
    blocks.push({ kind: 'html', html: wrapTables(markdown.parser(list)) });
    run = [];
  };

  for (const token of tokens) {
    const video = standaloneVideo(token);

    if (video === null) {
      run.push(token);
    } else {
      flush();
      blocks.push(video);
    }
  }

  flush();
  return blocks;
}

function markedFor(images: readonly PostImageDto[]): Marked {
  const byId = new Map(images.map((image) => [image.id, image]));

  return new Marked({
    gfm: true,
    breaks: true,
    renderer: {
      // Raw HTML in what someone wrote is shown as the text it is, never rendered.
      html(token: Tokens.HTML | Tokens.Tag): string {
        return escapeHtml(token.text);
      },
      image(token: Tokens.Image): string {
        if (token.href.startsWith(POST_IMAGE_SCHEME)) {
          const image = byId.get(token.href.slice(POST_IMAGE_SCHEME.length));

          if (!image) {
            return `<span class="sh-markdown-missing">${escapeHtml(token.text || 'Image')}</span>`;
          }

          const size =
            image.width && image.height
              ? ` width="${String(image.width)}" height="${String(image.height)}"`
              : '';

          return `<img src="${escapeHtml(image.url)}" alt="${escapeHtml(token.text)}"${size}>`;
        }

        return `<a href="${escapeHtml(token.href)}">${escapeHtml(token.text || token.href)}</a>`;
      },
    },
  });
}

/** A paragraph that is one YouTube link and nothing else, as a video block. */
function standaloneVideo(token: Token): MarkdownBlock | null {
  if (token.type !== 'paragraph') {
    return null;
  }

  const parts = (token as Tokens.Paragraph).tokens.filter(
    (part) => !(part.type === 'text' && part.raw.trim() === ''),
  );
  const only = parts.length === 1 ? parts[0] : undefined;

  if (only?.type !== 'link') {
    return null;
  }

  const link = only as Tokens.Link;
  const video = parseYouTubeUrl(link.href);

  if (video === null) {
    return null;
  }

  // A bare or <angle-bracketed> URL is its own text; only real words caption it.
  const text = link.text.trim();
  const caption = text === '' || text === link.href ? null : text;

  return { kind: 'video', video, caption };
}

/** A table gets a wrapper that scrolls sideways, so a wide one never widens a phone's page. */
function wrapTables(html: string): string {
  return html
    .replaceAll('<table>', '<div class="sh-markdown-table"><table>')
    .replaceAll('</table>', '</table></div>');
}
