import { describe, expect, it } from 'vitest';

import { neighbourPhotoUrls } from './neighbour-photos';

const photo = (name: string, full = true): { url: string | null; thumbUrl: string } => ({
  url: full ? `full-${name}` : null,
  thumbUrl: `thumb-${name}`,
});

describe('neighbourPhotoUrls', () => {
  const photos = [photo('a'), photo('b'), photo('c'), photo('d')];

  it('gives the next and the previous photo’s full image', () => {
    expect(neighbourPhotoUrls(photos, 1)).toEqual(['full-c', 'full-a']);
  });

  it('wraps round at both ends, as next and previous do', () => {
    expect(neighbourPhotoUrls(photos, 0)).toEqual(['full-b', 'full-d']);
    expect(neighbourPhotoUrls(photos, 3)).toEqual(['full-a', 'full-c']);
  });

  it('names a photo shown from its thumbnail by that, and two photos once', () => {
    expect(neighbourPhotoUrls([photo('a'), photo('b', false)], 0)).toEqual(['thumb-b']);
  });

  it('has nothing to fetch for one photo or none', () => {
    expect(neighbourPhotoUrls([photo('a')], 0)).toEqual([]);
    expect(neighbourPhotoUrls([], 0)).toEqual([]);
  });
});
