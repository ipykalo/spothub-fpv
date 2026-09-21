import { describe, expect, it } from 'vitest';

import { type SitemapPost, robotsTxt, siteOrigin, sitemapXml } from './crawler-files';

/**
 * What the site says to a crawler. Three things are worth holding to: every
 * signed-in path stays disallowed, because a crawler would only ever meet the
 * login page there; the addresses published are the ones a visitor actually
 * reached the site at, which behind a reverse proxy means the forwarded
 * headers rather than the container's own; and a post's slug goes into XML as
 * text, since a title with an ampersand in it would otherwise break the file
 * for every post after it.
 */
describe('robots.txt', () => {
  it('leaves the blog open and everything behind sign-in shut', () => {
    const lines = robotsTxt('https://spothub.example').split('\n');

    expect(lines[0]).toBe('User-agent: *');
    expect(lines).toContain('Disallow: /hangar');
    expect(lines).toContain('Disallow: /flights');
    expect(lines).toContain('Disallow: /api');
    expect(lines.some((line) => line === 'Disallow: /blog')).toBe(false);
    expect(lines.some((line) => line === 'Disallow: /')).toBe(false);
  });

  it('points at the sitemap on the site’s own address', () => {
    expect(robotsTxt('https://spothub.example')).toContain(
      'Sitemap: https://spothub.example/sitemap.xml',
    );
  });

  it('ends with a newline, as a text file should', () => {
    expect(robotsTxt('https://spothub.example').endsWith('\n')).toBe(true);
  });
});

describe('the site’s own address', () => {
  type Request = Parameters<typeof siteOrigin>[0];

  const request = (over: Partial<Request> = {}): Request => ({
    protocol: 'http',
    host: 'localhost:4000',
    forwardedProto: undefined,
    forwardedHost: undefined,
    ...over,
  });

  it('is where the request arrived, when nothing is in front of the server', () => {
    expect(siteOrigin(request())).toBe('http://localhost:4000');
  });

  it('is the public one behind a reverse proxy, not the container’s', () => {
    expect(
      siteOrigin(request({ forwardedProto: 'https', forwardedHost: 'spothub.example' })),
    ).toBe('https://spothub.example');
  });

  it('takes the first of a chain of proxies, which is the visitor’s own', () => {
    expect(
      siteOrigin(
        request({
          forwardedProto: 'https, http',
          forwardedHost: 'spothub.example, internal',
        }),
      ),
    ).toBe('https://spothub.example');
  });

  it('falls back to localhost rather than publishing an address with no host', () => {
    expect(siteOrigin(request({ host: undefined }))).toBe('http://localhost');
  });

  it('ignores an empty forwarded header instead of building "://"', () => {
    expect(siteOrigin(request({ forwardedProto: '', forwardedHost: '  ' }))).toBe(
      'http://localhost:4000',
    );
  });
});

describe('sitemap.xml', () => {
  const post = (id: string, over: Partial<SitemapPost> = {}): SitemapPost => ({
    id,
    slug: `post-${id}`,
    updatedAt: '2026-09-01T10:00:00.000Z',
    ...over,
  });

  const ORIGIN = 'https://spothub.example';

  it('lists the feed and every published post at its canonical address', () => {
    const xml = sitemapXml(ORIGIN, [post('1'), post('2')]);

    expect(xml).toContain(`<loc>${ORIGIN}</loc>`);
    expect(xml).toContain(`<loc>${ORIGIN}/blog/1/post-1</loc>`);
    expect(xml).toContain(`<loc>${ORIGIN}/blog/2/post-2</loc>`);
    expect(xml.match(/<url>/g)).toHaveLength(3);
  });

  it('dates the feed by the newest post on it, since that is when it changed', () => {
    const xml = sitemapXml(ORIGIN, [
      post('1', { updatedAt: '2026-09-01T10:00:00.000Z' }),
      post('2', { updatedAt: '2026-09-20T10:00:00.000Z' }),
    ]);

    // The feed's entry comes first, and carries the later of the two days.
    expect(xml.split('<url>')[1]).toContain('<lastmod>2026-09-20</lastmod>');
  });

  it('gives a day, not a timestamp: a crawler has no use for the minute', () => {
    expect(sitemapXml(ORIGIN, [post('1')])).toContain('<lastmod>2026-09-01</lastmod>');
  });

  it('is still valid XML for a blog with nothing published yet', () => {
    const xml = sitemapXml(ORIGIN, []);

    expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(xml.match(/<url>/g)).toHaveLength(1);
    expect(xml).not.toContain('<lastmod>');
    expect(xml.trimEnd().endsWith('</urlset>')).toBe(true);
  });

  it('escapes an address so one post’s slug cannot break the whole file', () => {
    const xml = sitemapXml(ORIGIN, [post('1', { slug: 'props & motors <x>' })]);

    expect(xml).toContain('props &amp; motors &lt;x&gt;');
    expect(xml).not.toContain('props & motors');
  });
});
