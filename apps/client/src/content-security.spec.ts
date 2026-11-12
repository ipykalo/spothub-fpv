import { describe, expect, it } from 'vitest';

import { NONCE_PLACEHOLDER, contentSecurityPolicy, withNonce } from './content-security';

describe('withNonce', () => {
  it('fills in every nonce and the root element’s ngCspNonce', () => {
    const html =
      `<script nonce="${NONCE_PLACEHOLDER}">theme()</script>` +
      `<style nonce="${NONCE_PLACEHOLDER}"></style>` +
      `<sh-root ngcspnonce="${NONCE_PLACEHOLDER}"></sh-root>` +
      `<sh-root ngCspNonce="${NONCE_PLACEHOLDER}"></sh-root>`;

    const filled = withNonce(html, 'abc123');

    expect(filled).not.toContain(NONCE_PLACEHOLDER);
    expect(filled.match(/abc123/g)).toHaveLength(4);
  });

  it('never writes the nonce where a post merely quotes the placeholder', () => {
    const html = `<p>${NONCE_PLACEHOLDER}</p><a title="${NONCE_PLACEHOLDER}"></a>`;

    expect(withNonce(html, 'abc123')).toBe(html);
  });
});

describe('contentSecurityPolicy', () => {
  const policy = contentSecurityPolicy({
    nonce: 'abc123',
    storageOrigin: 'https://storage.example',
  });
  const directive = (name: string): string | undefined =>
    policy
      .split('; ')
      .find((part) => part.startsWith(`${name} `))
      ?.slice(name.length + 1);

  it('runs only this site’s scripts, and inline ones only with the nonce', () => {
    expect(directive('script-src')).toBe("'self' 'nonce-abc123'");
    expect(policy).not.toContain('unsafe-eval');
    expect(directive('object-src')).toBe("'none'");
  });

  it('lets photos load and uploads go to storage', () => {
    expect(directive('img-src')).toContain('https://storage.example');
    expect(directive('connect-src')).toBe("'self' https://storage.example");
  });

  it('frames only the privacy-enhanced YouTube player, and is framed only by itself', () => {
    expect(directive('frame-src')).toBe('https://www.youtube-nocookie.com');
    expect(directive('frame-ancestors')).toBe("'self'");
  });
});
