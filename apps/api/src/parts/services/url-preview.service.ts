import { type LookupAddress, type LookupOptions, lookup as dnsLookup } from 'node:dns';
import http from 'node:http';
import https from 'node:https';
import { isIP } from 'node:net';

import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import type { UrlPreviewDto } from '@spothub/shared';

import { isPublicAddress } from './public-address';

/** Anything larger is not a product page; stop reading and move on. */
const MAX_BYTES = 512 * 1024;
const TIMEOUT_MS = 6_000;
/** A shop's short link may bounce once or twice; more is not a product page. */
const MAX_REDIRECTS = 3;

/**
 * Names refused before anything is resolved. The API would otherwise be a
 * proxy into the private network it runs in — paste `http://169.254.169.254/`
 * on a cloud host and the response is instance credentials. The real guard is
 * `publicOnlyLookup`, on the address connected to; this only answers the
 * obvious cases with a clear message.
 */
const BLOCKED_HOSTNAMES = new Set(['localhost', 'metadata.google.internal']);

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

    const vendor = meta(html, 'og:site_name') ?? url.hostname.replace(/^www\./, '');

    return {
      title: stripVendorSuffix(meta(html, 'og:title') ?? titleTag(html), vendor),
      imageUrl: absolute(meta(html, 'og:image'), url),
      price,
      currency:
        (
          meta(html, 'og:price:currency') ??
          meta(html, 'product:price:currency') ??
          itemprop(html, 'priceCurrency')
        )?.toUpperCase() ?? null,
      vendor,
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
    // An address written into the link is never looked up, so it is judged here.
    const literal = hostname.replace(/^\[|\]$/g, '');

    if (
      BLOCKED_HOSTNAMES.has(hostname) ||
      hostname.endsWith('.localhost') ||
      hostname.endsWith('.internal') ||
      (isIP(literal) !== 0 && !isPublicAddress(literal)) ||
      url.username !== '' ||
      url.password !== ''
    ) {
      throw new BadRequestException('That link cannot be read');
    }

    return url;
  }

  /**
   * Returns null rather than throwing: a failed preview is not a failed form.
   *
   * Redirects are followed by hand, a few at most, and each new address is
   * checked like the first — a public page that answers "go to
   * http://169.254.169.254/" is the oldest way round a check made only once.
   */
  private async fetchHtml(start: URL): Promise<string | null> {
    const signal = AbortSignal.timeout(TIMEOUT_MS);
    let url = start;

    try {
      for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
        const page = await readPage(url, signal);

        if (page.location !== null) {
          url = this.parseSafeUrl(new URL(page.location, url).toString());
          continue;
        }

        return page.status === 200 && page.contentType.includes('text/html') ? page.body : null;
      }

      return null;
    } catch (error) {
      this.logger.warn(`Preview failed for ${url.hostname}: ${String(error)}`);
      return null;
    }
  }
}

interface FetchedPage {
  readonly status: number;
  readonly contentType: string;
  /** Where a redirect points, unresolved; null for anything else. */
  readonly location: string | null;
  readonly body: string;
}

/**
 * Resolves a name like `dns.lookup`, but refuses it unless every address it
 * has is public. Handed to the HTTP client as its lookup, so the check runs on
 * the address actually connected to: a name cannot resolve to something
 * harmless when checked and to 127.0.0.1 a moment later when connected.
 */
const publicOnlyLookup = (
  hostname: string,
  options: LookupOptions,
  callback: (error: Error | null, address: string | LookupAddress[], family?: number) => void,
): void => {
  dnsLookup(hostname, { ...options, all: true }, (error, addresses) => {
    if (error) {
      callback(error, '');
      return;
    }

    if (addresses.length === 0 || addresses.some((entry) => !isPublicAddress(entry.address))) {
      callback(new Error(`${hostname} does not resolve to a public address`), '');
      return;
    }

    if (options.all) {
      callback(null, addresses);
    } else {
      callback(null, addresses[0].address, addresses[0].family);
    }
  });
};

/** One request, no redirects followed, reading at most `MAX_BYTES` of the body. */
function readPage(url: URL, signal: AbortSignal): Promise<FetchedPage> {
  const client = url.protocol === 'https:' ? https : http;

  return new Promise((resolve, reject) => {
    const request = client.get(
      url,
      {
        lookup: publicOnlyLookup,
        signal,
        headers: {
          // Some storefronts serve a stub to unknown agents.
          'user-agent': 'Mozilla/5.0 (compatible; SpotHubFPV/1.0; +link preview)',
          accept: 'text/html,application/xhtml+xml',
          // Node's client does not decompress, and nothing here needs it to.
          'accept-encoding': 'identity',
        },
      },
      (response) => {
        const status = response.statusCode ?? 0;
        const location = response.headers.location;

        if (status >= 300 && status < 400 && location) {
          response.destroy();
          resolve({ status, contentType: '', location, body: '' });
          return;
        }

        // The tags are in <head>: stop reading at MAX_BYTES, because an
        // unbounded read of an address someone else chose fills the memory.
        const chunks: Buffer[] = [];
        let size = 0;

        const finish = (): void => {
          resolve({
            status,
            contentType: response.headers['content-type'] ?? '',
            location: null,
            body: Buffer.concat(chunks).toString('utf8').slice(0, MAX_BYTES),
          });
        };

        response.on('data', (chunk: Buffer) => {
          chunks.push(chunk);
          size += chunk.byteLength;

          if (size >= MAX_BYTES) {
            response.destroy();
            finish();
          }
        });
        response.on('end', finish);
        response.on('error', reject);
      },
    );

    request.on('error', reject);
  });
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

/**
 * Listings suffix the product name with the shop: "EVILBEE 4218 Motor …
 * - AliExpress". That is the site talking about itself, not part of the name.
 */
function stripVendorSuffix(title: string | null, vendor: string | null): string | null {
  if (!title || !vendor) {
    return title;
  }

  // `og:site_name` is not always tidy — AliExpress publishes "aliexpress."
  const name = vendor.replace(/[.\s]+$/, '');

  if (!name) {
    return title;
  }

  const cleaned = title.replace(new RegExp(`\\s*[-|–—]\\s*${name}\\s*$`, 'i'), '');

  return cleaned.trim() || title;
}
