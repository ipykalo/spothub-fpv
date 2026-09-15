import {
  ChangeDetectionStrategy,
  Component,
  ViewEncapsulation,
  computed,
  input,
} from '@angular/core';
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
 * GitHub-flavoured Markdown, with the two things a writer could smuggle in
 * taken out before Angular's own sanitizer ever sees the result.
 */
const markdown = new Marked({
  gfm: true,
  breaks: true,
  renderer: {
    // Raw HTML in what someone wrote is shown as the text it is, never rendered.
    html(token: Tokens.HTML | Tokens.Tag): string {
      return escapeHtml(token.text);
    },
    // An image loads from wherever the writer pointed it, telling that host
    // who read the page — so it is offered as a link instead.
    image(token: Tokens.Image): string {
      return `<a href="${escapeHtml(token.href)}">${escapeHtml(token.text || token.href)}</a>`;
    },
  },
});

/** Markdown to HTML. Still bound through `[innerHTML]`, so Angular sanitizes it once more. */
export function renderMarkdown(source: string): string {
  return markdown.parse(source, { async: false });
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

  protected readonly html = computed(() => {
    const source = this.source();
    return source ? renderMarkdown(source) : '';
  });
}
