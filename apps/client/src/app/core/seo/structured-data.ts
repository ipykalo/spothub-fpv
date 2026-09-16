import { DOCUMENT, DestroyRef, Injectable, inject } from '@angular/core';
import type { PostDto, PostSummaryDto } from '@spothub/shared';

import { SITE_ORIGIN } from './site-origin';

const SITE_NAME = 'SpotHub FPV';
const SCRIPT_ID = 'sh-structured-data';

/**
 * The page described again, for machines: one `application/ld+json` block in
 * the head, written on the server as well as in the browser.
 *
 * Search engines read schema.org to tell a blog post from a page that merely
 * mentions one — it is what earns a headline, an author and a date in a
 * result rather than a bare link. One script per page, replaced on each, so
 * two pages can never describe the same document differently.
 */
@Injectable({ providedIn: 'root' })
export class StructuredData {
  private readonly document = inject(DOCUMENT);
  private readonly origin = inject(SITE_ORIGIN);

  /** The blog itself, with the posts it lists. */
  setBlog(posts: readonly PostSummaryDto[]): void {
    this.write({
      '@context': 'https://schema.org',
      '@type': 'Blog',
      name: `${SITE_NAME} blog`,
      description: 'Build logs, crash reports and what FPV pilots learned along the way.',
      url: this.origin,
      blogPost: posts.map((post) => ({
        '@type': 'BlogPosting',
        headline: post.title,
        url: this.postUrl(post),
        datePublished: post.publishedAt ?? post.createdAt,
        author: { '@type': 'Person', name: post.authorName ?? 'A pilot' },
      })),
    });
  }

  /** One post. */
  setPost(post: PostDto): void {
    this.write({
      '@context': 'https://schema.org',
      '@type': 'BlogPosting',
      headline: post.title,
      ...(post.summary === null ? {} : { description: post.summary }),
      url: this.postUrl(post),
      mainEntityOfPage: { '@type': 'WebPage', '@id': this.postUrl(post) },
      datePublished: post.publishedAt ?? post.createdAt,
      dateModified: post.updatedAt,
      wordCount: post.bodyMd.split(/\s+/u).filter(Boolean).length,
      author: { '@type': 'Person', name: post.authorName ?? 'A pilot' },
      publisher: { '@type': 'Organization', name: SITE_NAME, url: this.origin },
      ...(post.tags.length === 0
        ? {}
        : { keywords: post.tags.map((tag) => tag.name).join(', ') }),
    });
  }

  /** Nothing to say about this page; the block goes rather than going stale. */
  clear(): void {
    this.document.getElementById(SCRIPT_ID)?.remove();
  }

  private postUrl(post: PostSummaryDto): string {
    return `${this.origin}/blog/${post.id}/${post.slug}`;
  }

  private write(data: unknown): void {
    const existing = this.document.getElementById(SCRIPT_ID);
    const script = existing ?? this.document.createElement('script');

    script.id = SCRIPT_ID;
    script.setAttribute('type', 'application/ld+json');
    // JSON, not markup: `textContent` never parses what it is given, and the
    // values here are a pilot's own title and summary.
    script.textContent = JSON.stringify(data);

    if (!existing) {
      this.document.head.appendChild(script);
    }
  }
}

/** The page's `StructuredData`, cleared when the page goes. */
export function injectStructuredData(): StructuredData {
  const data = inject(StructuredData);

  inject(DestroyRef).onDestroy(() => {
    data.clear();
  });

  return data;
}
