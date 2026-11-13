import { describe, expect, it } from 'vitest';

import { coverSrcset, photoSrcset, placeholderUrl } from './srcset';

describe('photoSrcset', () => {
  const photo = {
    url: 'original.jpg',
    thumbUrl: 'thumb.webp',
    displayUrl: 'display.webp',
    width: 4000,
    height: 3000,
  };

  it('offers the thumbnail and the display version at their real widths', () => {
    expect(photoSrcset(photo)).toBe('thumb.webp 640w, display.webp 1600w');
  });

  it('gives a portrait photo its narrower widths, not its long edge', () => {
    expect(photoSrcset({ ...photo, width: 3000, height: 4000 })).toBe(
      'thumb.webp 480w, display.webp 1200w',
    );
  });

  it('offers the original at its own width until a display version is made', () => {
    expect(photoSrcset({ ...photo, displayUrl: null, width: 1200, height: 900 })).toBe(
      'thumb.webp 640w, original.jpg 1200w',
    );
  });

  it('has no choice to offer for a photo as small as its thumbnail', () => {
    expect(photoSrcset({ ...photo, width: 600, height: 400 })).toBeNull();
  });

  it('has none without a thumbnail or a known size', () => {
    expect(photoSrcset({ ...photo, thumbUrl: null })).toBeNull();
    expect(photoSrcset({ ...photo, width: null })).toBeNull();
  });
});

describe('coverSrcset', () => {
  it('describes a cover the same way, its url being the display version', () => {
    expect(
      coverSrcset({
        url: 'display.webp',
        thumbUrl: 'thumb.webp',
        width: 2000,
        height: 1000,
      }),
    ).toBe('thumb.webp 640w, display.webp 1600w');
  });
});

describe('placeholderUrl', () => {
  it('is the thumbnail while a larger version loads', () => {
    expect(placeholderUrl('/t.webp', '/d.webp')).toBe('/t.webp');
  });

  it('is nothing without a thumbnail, or when the thumbnail is what loads', () => {
    expect(placeholderUrl(null, '/d.webp')).toBeNull();
    expect(placeholderUrl(undefined, '/d.webp')).toBeNull();
    expect(placeholderUrl('/t.webp', '/t.webp')).toBeNull();
  });
});
