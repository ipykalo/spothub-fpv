import { DOCUMENT, DestroyRef, Injectable, inject } from '@angular/core';
import { Meta, Title } from '@angular/platform-browser';

import { SITE_ORIGIN } from './site-origin';

const SITE_NAME = 'SpotHub FPV';
const DESCRIPTION_LENGTH = 200;

/** Everything `set` adds beyond the title, so `reset` can take exactly those away again. */
const OWNED_TAGS = [
  'name="description"',
  'property="og:title"',
  'property="og:type"',
  'property="og:url"',
  'property="og:description"',
  'property="og:image"',
  'name="twitter:card"',
  'name="twitter:title"',
  'name="twitter:description"',
  'name="twitter:image"',
  'property="article:published_time"',
  'property="article:modified_time"',
  'property="article:author"',
];

export interface PageDescription {
  readonly title: string;
  readonly description?: string | null;
  readonly type?: 'website' | 'article';
  /** The page's own address from the site root, for the canonical link and `og:url`. */
  readonly path?: string;
  /** A picture of what the page is about, absolute. Left out when it would expire — see below. */
  readonly imageUrl?: string | null;
  readonly publishedAt?: string | null;
  readonly updatedAt?: string | null;
  readonly authorName?: string | null;
}

/**
 * The tab title, the description, the canonical address and their Open Graph
 * and Twitter twins, for the public pages. Set on the server as well as in the
 * browser, which is what makes a search result and a shared link show the post
 * rather than the app's name.
 *
 * Only the blog is public, so these tags only ever describe the feed or a post.
 */
@Injectable({ providedIn: 'root' })
export class PageMeta {
  private readonly title = inject(Title);
  private readonly meta = inject(Meta);
  private readonly document = inject(DOCUMENT);
  private readonly origin = inject(SITE_ORIGIN);

  set(page: PageDescription): void {
    const type = page.type ?? 'website';
    const url = page.path === undefined ? null : `${this.origin}${page.path}`;
    const description = page.description ? clip(plainText(page.description)) : '';
    const image = stableImage(page.imageUrl ?? null);

    this.title.setTitle(`${page.title} · ${SITE_NAME}`);
    this.meta.updateTag({ property: 'og:site_name', content: SITE_NAME });
    this.meta.updateTag({ property: 'og:title', content: page.title });
    this.meta.updateTag({ property: 'og:type', content: type });
    this.meta.updateTag({ name: 'twitter:title', content: page.title });
    this.meta.updateTag({
      name: 'twitter:card',
      content: image ? 'summary_large_image' : 'summary',
    });

    if (description) {
      this.meta.updateTag({ name: 'description', content: description });
      this.meta.updateTag({ property: 'og:description', content: description });
      this.meta.updateTag({ name: 'twitter:description', content: description });
    }

    if (url) {
      this.meta.updateTag({ property: 'og:url', content: url });
      this.canonical(url);
    }

    if (image) {
      this.meta.updateTag({ property: 'og:image', content: image });
      this.meta.updateTag({ name: 'twitter:image', content: image });
    }

    if (type === 'article') {
      this.article(page);
    }
  }

  /** Back to the app's own title, so the next page inherits nothing it did not set. */
  reset(): void {
    this.title.setTitle(SITE_NAME);

    for (const selector of OWNED_TAGS) {
      this.meta.removeTag(selector);
    }

    this.canonical(null);
  }

  private article(page: PageDescription): void {
    if (page.publishedAt) {
      this.meta.updateTag({
        property: 'article:published_time',
        content: page.publishedAt,
      });
    }

    if (page.updatedAt) {
      this.meta.updateTag({ property: 'article:modified_time', content: page.updatedAt });
    }

    if (page.authorName) {
      this.meta.updateTag({ property: 'article:author', content: page.authorName });
    }
  }

  /** `Meta` handles only meta tags, and a canonical address is a link. */
  private canonical(url: string | null): void {
    const head = this.document.head;
    const existing = head.querySelector<HTMLLinkElement>('link[rel="canonical"]');

    if (url === null) {
      existing?.remove();
      return;
    }

    const link = existing ?? this.document.createElement('link');
    link.setAttribute('rel', 'canonical');
    link.setAttribute('href', url);

    if (!existing) {
      head.appendChild(link);
    }
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

/**
 * A post's images are served from object storage through presigned URLs, which
 * expire within the hour. A crawler comes back later and would find a 403, so
 * an address that carries an expiry is no address to publish: the card goes
 * out without a picture instead of with a broken one. Serving post images from
 * a stable public path would give every post its image here — worth doing, and
 * the only thing standing between these cards and a picture.
 */
function stableImage(url: string | null): string | null {
  if (url === null) {
    return null;
  }

  return /[?&]X-Amz-(Expires|Signature)=/i.test(url) ? null : url;
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
