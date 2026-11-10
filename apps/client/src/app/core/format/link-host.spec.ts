import { linkHost, optionalWebLinkSchema, webLinkSchema } from '@spothub/shared';
import { describe, expect, it } from 'vitest';

import { LinkHostPipe } from './link-host.pipe';

describe('webLinkSchema', () => {
  it('takes a shop’s web address', () => {
    for (const link of [
      'https://www.aliexpress.com/item/1005006.html?spm=a2g0o',
      'http://shop.example.co.uk/motor',
      '  https://getfpv.com/  ',
    ]) {
      expect(webLinkSchema.safeParse(link).success, link).toBe(true);
    }
  });

  it('refuses anything a browser would run or open rather than visit', () => {
    for (const link of [
      'javascript:alert(document.cookie)',
      'JavaScript:alert(1)',
      'data:text/html,<script>alert(1)</script>',
      'file:///etc/passwd',
      'ftp://files.example.com/x',
      'https://127.0.0.1/admin',
      'https://localhost/',
      'shop.example.com',
      `https://example.com/${'x'.repeat(2000)}`,
    ]) {
      expect(webLinkSchema.safeParse(link).success, link).toBe(false);
    }
  });

  it('says what it wants', () => {
    expect(webLinkSchema.safeParse('javascript:alert(1)').error?.issues[0]?.message).toBe(
      'Paste a web address starting with https://',
    );
  });

  it('reads an empty optional link as none', () => {
    expect(optionalWebLinkSchema.parse('')).toBeNull();
    expect(optionalWebLinkSchema.parse(null)).toBeNull();
    expect(optionalWebLinkSchema.safeParse('javascript:alert(1)').success).toBe(false);
  });
});

describe('linkHost', () => {
  it('names the site a link goes to, without www', () => {
    expect(linkHost('https://www.aliexpress.com/item/1.html')).toBe('aliexpress.com');
    expect(linkHost('http://shop.example.co.uk/x')).toBe('shop.example.co.uk');
  });

  it('has no site for something that is not a web address', () => {
    expect(linkHost('javascript:alert(1)')).toBeNull();
    expect(linkHost('not a link')).toBeNull();
    expect(new LinkHostPipe().transform(null)).toBeNull();
    expect(new LinkHostPipe().transform('https://getfpv.com/a')).toBe('getfpv.com');
  });
});
