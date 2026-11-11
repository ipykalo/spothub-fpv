import { describe, expect, it } from 'vitest';

import { readVideoDraft } from './video-draft';

describe('readVideoDraft', () => {
  it('says nothing while the link is empty, and offers nothing to save', () => {
    expect(readVideoDraft('  ', 'A title')).toEqual({
      value: null,
      error: null,
      video: null,
    });
  });

  it('takes any form of YouTube link, start time included', () => {
    const watch = readVideoDraft('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=90', '');
    expect(watch.video).toEqual({ youtubeId: 'dQw4w9WgXcQ', startS: 90 });
    expect(watch.value).toEqual({
      link: { youtubeId: 'dQw4w9WgXcQ', startS: 90 },
      title: null,
    });

    expect(readVideoDraft('https://youtu.be/dQw4w9WgXcQ', '').video?.youtubeId).toBe(
      'dQw4w9WgXcQ',
    );
    expect(
      readVideoDraft('https://www.youtube.com/shorts/dQw4w9WgXcQ', '').error,
    ).toBeNull();
  });

  it('keeps a title, trimmed', () => {
    expect(
      readVideoDraft('https://youtu.be/dQw4w9WgXcQ', '  First flight ').value?.title,
    ).toBe('First flight');
  });

  it('refuses every address that is not a YouTube video', () => {
    for (const link of [
      'https://evil.example/video.exe',
      'https://www.youtube.com.evil.example/watch?v=dQw4w9WgXcQ',
      'javascript:alert(1)',
      'https://vimeo.com/123456',
      'https://www.youtube.com/channel/UC123',
      'not a link at all',
    ]) {
      const draft = readVideoDraft(link, '');
      expect(draft.value, link).toBeNull();
      expect(draft.error, link).toBe('Paste a link to a YouTube video');
    }
  });

  it('refuses a title that is too long', () => {
    expect(readVideoDraft('https://youtu.be/dQw4w9WgXcQ', 'x'.repeat(81)).error).toBe(
      'At most 80 characters',
    );
  });
});
