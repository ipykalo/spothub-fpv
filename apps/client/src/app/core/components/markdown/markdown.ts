import {
  ChangeDetectionStrategy,
  Component,
  ViewEncapsulation,
  computed,
  input,
} from '@angular/core';
import { POST_IMAGE_SCHEME, type PostImageDto } from '@spothub/shared';
import { Marked, type Tokens } from 'marked';

const ESCAPES: Readonly<Record<string, string>> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

const escapeHtml = (text: string): string =>
  text.replace(/[&<>"']/g, (char) => ESCAPES[char] ?? char);

/**
 * Markdown to HTML, with what a writer could smuggle in taken out before
 * Angular's own sanitizer ever sees the result. Still bound through
 * `[innerHTML]`, so Angular sanitizes it once more.
 *
 * `images` are the post's own uploads: `![caption](image:<id>)` shows one of
 * them. Any other image address is offered as a link instead — loading it
 * would tell that host who read the page.
 */
export function renderMarkdown(
  source: string,
  images: readonly PostImageDto[] = [],
): string {
  const byId = new Map(images.map((image) => [image.id, image]));

  const markdown = new Marked({
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

  // A table gets a wrapper that scrolls sideways, so a wide one never pushes
  // the page wider than a phone.
  return markdown
    .parse(source, { async: false })
    .replaceAll('<table>', '<div class="sh-markdown-table"><table>')
    .replaceAll('</table>', '</table></div>');
}

/**
 * Presenter: renders Markdown someone wrote — a post, a build's write-up.
 *
 * Unencapsulated styles, scoped by the host class: the rendered elements are
 * created by `innerHTML`, so they never carry the attributes Angular's
 * emulated encapsulation would match on.
 */
@Component({
  selector: 'sh-markdown',
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  templateUrl: './markdown.html',
  styleUrl: './markdown.scss',
  host: { class: 'sh-markdown block' },
})
export class Markdown {
  readonly source = input<string | null>(null);
  /** The post's own images, which `image:` references resolve to. */
  readonly images = input<readonly PostImageDto[]>([]);

  protected readonly html = computed(() => {
    const source = this.source();
    return source ? renderMarkdown(source, this.images()) : '';
  });
}
