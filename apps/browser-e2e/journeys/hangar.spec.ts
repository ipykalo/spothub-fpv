import { create, expect, test } from '../support/fixtures';

interface Build {
  readonly id: string;
}

test('a pilot signs in, finds a build in the hangar and opens it', async ({
  api,
  page,
  signIn,
}) => {
  const name = `Hangar Whoop ${String(Date.now())}`;
  const build = await create<Build>(api, '/api/builds', { name });

  await signIn('/hangar');

  await expect(page.getByRole('heading', { level: 1, name: 'Hangar' })).toBeVisible();
  await page.getByRole('link', { name }).first().click();

  await expect(page).toHaveURL(new RegExp(`/hangar/${build.id}$`));
  await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
  // The build page is several modules' work; each section answering is the
  // sign that every one of them could read the build.
  for (const section of ['Details', 'Photos', 'Components']) {
    await expect(page.getByRole('heading', { name: new RegExp(section) })).toBeVisible();
  }
});
