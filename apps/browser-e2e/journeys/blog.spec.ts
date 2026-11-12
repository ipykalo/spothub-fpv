import { create, expect, test } from '../support/fixtures';

interface Post {
  readonly id: string;
  readonly slug: string;
}

test('a visitor reads the blog and a post, server-rendered and then live', async ({
  api,
  page,
  request,
}) => {
  const title = `Maiden flight of the journey quad ${String(Date.now())}`;
  const post = await create<Post>(api, '/api/posts', {
    title,
    summary: 'Five packs, one prop strike, no regrets.',
    bodyMd: 'The **first pack** went well. The second ended in a tree.',
    visibility: 'PUBLIC',
  });

  // What a search engine or a link preview gets: the post is in the HTML the
  // server sent, before any script has run.
  const html = await (await request.get('/')).text();
  expect(html).toContain(title);

  await page.goto('/');
  await page.getByRole('link', { name: title }).first().click();

  await expect(page).toHaveURL(new RegExp(`/blog/${post.id}`));
  await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
  await expect(page.getByText('The second ended in a tree.')).toBeVisible();
  await expect(page.locator('strong', { hasText: 'first pack' })).toBeVisible();
});
