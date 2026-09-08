import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import type { UrlPreviewDto } from '@spothub/shared';

/** Anything larger is not a product page; stop reading and move on. */
const MAX_BYTES = 512 * 1024;
const TIMEOUT_MS = 6_000;

/**
 * Hostnames that must never be fetched. The API would otherwise be a proxy
 * into the private network it runs in — paste `http://169.254.169.254/` on a
 * cloud host and the response is instance credentials.
 */
const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  '0.0.0.0',
  '169.254.169.254',
  'metadata.google.internal',
]);

const PRIVATE_IPV4 =
  /^(?:10\.|127\.|0\.|169\.254\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.)/;

/**
 * Reads OpenGraph tags off a pasted product page.
 *
 * Deliberately not a marketplace integration: there is no official AliExpress
 * API without affiliate approval, and community scrapers are fragile and
 * against terms of service. OpenGraph is what the page publishes about itself.
 */
@Injectable()
export class UrlPreviewService {
  private readonly logger = new Logger(UrlPreviewService.name);

  async fetchPreview(rawUrl: string): Promise<UrlPreviewDto> {
    const url = this.parseSafeUrl(rawUrl);
    const html = await this.fetchHtml(url);

    if (html === null) {
      return empty();
    }

    const price = firstNumber(
      meta(html, 'og:price:amount'),
      meta(html, 'product:price:amount'),
      itemprop(html, 'price'),
    );

    return {
      title: meta(html, 'og:title') ?? titleTag(html),
      imageUrl: absolute(meta(html, 'og:image'), url),
      price,
      currency:
        (
          meta(html, 'og:price:currency') ??
          meta(html, 'product:price:currency') ??
          itemprop(html, 'priceCurrency')
        )?.toUpperCase() ?? null,
      vendor: meta(html, 'og:site_name') ?? url.hostname.replace(/^www\./, ''),
    };
  }

  /** Blocks non-HTTP schemes and anything pointing back into the network. */
  private parseSafeUrl(rawUrl: string): URL {
    let url: URL;

    try {
      url = new URL(rawUrl);
    } catch {
      throw new BadRequestException('That is not a valid link');
    }

    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      throw new BadRequestException('Only http and https links can be read');
    }

    const hostname = url.hostname.toLowerCase();

    if (
      BLOCKED_HOSTNAMES.has(hostname) ||
      hostname.endsWith('.localhost') ||
      hostname.endsWith('.internal') ||
      PRIVATE_IPV4.test(hostname) ||
      hostname === '[::1]'
    ) {
      throw new BadRequestException('That link cannot be read');
    }

    return url;
  }

  /** Returns null rather than throwing: a failed preview is not a failed form. */
  private async fetchHtml(url: URL): Promise<string | null> {
    try {
      const response = await fetch(url, {
        redirect: 'follow',
        signal: AbortSignal.timeout(TIMEOUT_MS),
        headers: {
          // Some storefronts serve a stub to unknown agents.
          'user-agent': 'Mozilla/5.0 (compatible; SpotHubFPV/1.0; +link preview)',
          accept: 'text/html,application/xhtml+xml',
        },
      });

      if (!response.ok || !response.headers.get('content-type')?.includes('text/html')) {
        return null;
      }

      // Read at most MAX_BYTES: the tags are in <head>, and an unbounded read
      // of an attacker-chosen URL is a memory-exhaustion vector.
      const body = await response.text();
      return body.slice(0, MAX_BYTES);
    } catch (error) {
      this.logger.warn(`Preview failed for ${url.hostname}: ${String(error)}`);
      return null;
    }
  }
}

function empty(): UrlPreviewDto {
  return { title: null, imageUrl: null, price: null, currency: null, vendor: null };
}

/** Matches both attribute orders; `content` may use single or double quotes. */
function meta(html: string, property: string): string | null {
  // `property` is always an internal constant here (og:title, og:price:amount),
  // made of letters and colons, so it needs no regex escaping.
  const patterns = [
    new RegExp(
      `<meta[^>]+(?:property|name)=["']${property}["'][^>]*content=["']([^"']*)["']`,
      'i',
    ),
    new RegExp(
      `<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${property}["']`,
      'i',
    ),
  ];

  for (const pattern of patterns) {
    const match = pattern.exec(html);
    if (match?.[1]) {
      return decode(match[1].trim());
    }
  }

  return null;
}

function itemprop(html: string, name: string): string | null {
  const match = new RegExp(
    `<[^>]+itemprop=["']${name}["'][^>]*content=["']([^"']*)["']`,
    'i',
  ).exec(html);

  return match?.[1] ? decode(match[1].trim()) : null;
}

function titleTag(html: string): string | null {
  const match = /<title[^>]*>([^<]*)<\/title>/i.exec(html);
  return match?.[1] ? decode(match[1].trim()) : null;
}

function firstNumber(...values: (string | null)[]): number | null {
  for (const value of values) {
    if (!value) continue;

    // Strip currency symbols and thousands separators before parsing.
    const parsed = Number.parseFloat(value.replace(/[^\d.,-]/g, '').replace(',', '.'));
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return null;
}

/** Only relative image URLs need resolving; anything unparseable is dropped. */
function absolute(value: string | null, base: URL): string | null {
  if (!value) return null;

  try {
    return new URL(value, base).toString();
  } catch {
    return null;
  }
}

const ENTITIES: Readonly<Record<string, string>> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&apos;': "'",
  '&nbsp;': ' ',
};

function decode(value: string): string {
  return value.replace(
    /&(?:amp|lt|gt|quot|#39|apos|nbsp);/g,
    (entity) => ENTITIES[entity] ?? entity,
  );
}
