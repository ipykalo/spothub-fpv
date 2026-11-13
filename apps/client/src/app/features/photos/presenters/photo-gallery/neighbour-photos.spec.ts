import { describe, expect, it } from 'vitest';

import { neighbourPhotos } from './neighbour-photos';

const photos = ['a', 'b', 'c', 'd', 'e', 'f'].map((id) => ({ id }));
const ids = (found: readonly { id: string }[]): string[] =>
  found.map((photo) => photo.id);

describe('neighbourPhotos', () => {
  it('gives two each way, nearest first: next, previous, then the next ones out', () => {
    expect(ids(neighbourPhotos(photos, 2))).toEqual(['d', 'b', 'e', 'a']);
  });

  it('wraps round at both ends, as next and previous do', () => {
    expect(ids(neighbourPhotos(photos, 0))).toEqual(['b', 'f', 'c', 'e']);
    expect(ids(neighbourPhotos(photos, 5))).toEqual(['a', 'e', 'b', 'd']);
  });

  it('names each photo once, and never the one showing, in a short set', () => {
    expect(ids(neighbourPhotos(photos.slice(0, 3), 0))).toEqual(['b', 'c']);
    expect(ids(neighbourPhotos(photos.slice(0, 2), 0))).toEqual(['b']);
  });

  it('reaches as far as asked', () => {
    expect(ids(neighbourPhotos(photos, 2, 1))).toEqual(['d', 'b']);
  });

  it('has nothing to fetch for one photo or none', () => {
    expect(neighbourPhotos(photos.slice(0, 1), 0)).toEqual([]);
    expect(neighbourPhotos([], 0)).toEqual([]);
  });
});
