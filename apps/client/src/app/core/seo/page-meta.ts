import { DestroyRef, Injectable, inject } from '@angular/core';
import { Meta, Title } from '@angular/platform-browser';

const SITE_NAME = 'SpotHub FPV';
const DESCRIPTION_LENGTH = 200;

export interface PageDescription {
  readonly title: string;
  readonly description?: string | null;
  readonly type?: 'website' | 'article';
}

/**
 * The tab title, the description and their Open Graph twins, for the public
 * pages. Set on the server as well as in the browser, which is what makes a
 * shared link preview show the build or the post rather than the app's name.
 */
@Injectable({ providedIn: 'root' })
export class PageMeta {
  private readonly title = inject(Title);
  private readonly meta = inject(Meta);

  set(page: PageDescription): void {
    this.title.setTitle(`${page.title} · ${SITE_NAME}`);
    this.meta.updateTag({ property: 'og:site_name', content: SITE_NAME });
    this.meta.updateTag({ property: 'og:title', content: page.title });
    this.meta.updateTag({ property: 'og:type', content: page.type ?? 'website' });

    const description = page.description ? clip(plainText(page.description)) : '';

    if (description) {
      this.meta.updateTag({ name: 'description', content: description });
      this.meta.updateTag({ property: 'og:description', content: description });
    } else {
      this.removeDescription();
    }
  }

  /** Back to the app's own title, for the pages that set nothing. */
  reset(): void {
    this.title.setTitle(SITE_NAME);
    this.meta.removeTag('property="og:title"');
    this.meta.removeTag('property="og:type"');
    this.removeDescription();
  }

  private removeDescription(): void {
    this.meta.removeTag('name="description"');
    this.meta.removeTag('property="og:description"');
  }
}

/**
 * The page's `PageMeta`, reset when the page goes, so the next page never
 * inherits a title it did not set. Call from a constructor or field initializer.
 */
export function injectPageMeta(): PageMeta {
  const meta = inject(PageMeta);

  inject(DestroyRef).onDestroy(() => {
    meta.reset();
  });

  return meta;
}

/** Tags and Markdown punctuation dropped, whitespace collapsed — good enough for a preview line. */
function plainText(markdown: string): string {
  return markdown
    .replace(/<[^>]*>/g, ' ')
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[#>*_`~|]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function clip(text: string): string {
  return text.length <= DESCRIPTION_LENGTH
    ? text
    : `${text.slice(0, DESCRIPTION_LENGTH - 1).trimEnd()}…`;
}
