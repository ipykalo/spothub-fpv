import { create, expect, test } from '../support/fixtures';

test('the spots map loads its tiles and shows a pilot’s spot', async ({
  api,
  page,
  signIn,
}) => {
  await create(api, '/api/spots', {
    name: `Journey Field ${String(Date.now())}`,
    lat: 50.4501,
    lng: 30.5234,
  });

  await signIn('/spots');

  // Tiles come from OpenStreetMap — the one outside host the map needs, and
  // one the Content-Security-Policy must keep allowing.
  await expect(page.locator('img.leaflet-tile-loaded').first()).toBeVisible();
  await expect(page.locator('.leaflet-marker-icon').first()).toBeVisible();
});
