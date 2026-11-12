import sharp from 'sharp';

import { create, expect, test } from '../support/fixtures';

interface Build {
  readonly id: string;
}

test('a photo uploads straight to storage and shows in the gallery', async ({
  api,
  page,
  signIn,
}) => {
  const build = await create<Build>(api, '/api/builds', {
    name: `Photo Quad ${String(Date.now())}`,
  });
  // A real JPEG, so the server's EXIF strip and thumbnail have work to do.
  const photo = await sharp({
    create: { width: 320, height: 240, channels: 3, background: '#ffbb00' },
  })
    .jpeg()
    .toBuffer();

  await signIn(`/hangar/${build.id}`);

  // A form is asked for, never shown by default.
  await page.getByRole('button', { name: /Add photos/ }).click();

  // The browser asks the API for a presigned address, PUTs the bytes to
  // storage itself, then commits — the whole pipeline, as a pilot runs it.
  await page
    .locator('sh-photo-gallery input[type="file"]')
    .setInputFiles({ name: 'first-flight.jpg', mimeType: 'image/jpeg', buffer: photo });

  // The gallery shows a local preview at once; the photo counts only once the
  // server has read it back out of storage, stripped it and made a thumbnail.
  await expect
    .poll(async () => {
      const photos = (await (await api.get(`/api/builds/${build.id}/photos`)).json()) as {
        status: string;
      }[];
      return photos.map((stored) => stored.status);
    })
    .toEqual(['READY']);

  // And what the gallery shows then is the stored photo, loaded from storage.
  const shown = page.locator('sh-photo-gallery img').first();
  await expect(shown).toHaveAttribute('src', /^https:\/\/storage\.localhost\//);
  await expect
    .poll(() => shown.evaluate((image: HTMLImageElement) => image.naturalWidth))
    .toBeGreaterThan(0);
});
