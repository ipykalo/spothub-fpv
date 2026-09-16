import type { AssetDto, PostDto, PostSummaryDto, UploadTicketDto } from '@spothub/shared';
import sharp from 'sharp';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { PrismaService } from '../src/prisma';
import { type TestApp, createTestApp } from './support/app';
import { type TestUser, createTestUser, deleteTestUser } from './support/users';

/**
 * A post's images through the real presigned pipeline: who may upload, delete
 * and pick the cover, what a visitor sees, and that storage never keeps an
 * image the post no longer shows. The tests run in order on one post.
 */
describe('post images', () => {
  let testApp: TestApp;
  let author: TestUser;
  let pilot: TestUser;
  let post: PostDto;
  let draft: PostDto;
  let frame: AssetDto;

  beforeAll(async () => {
    testApp = await createTestApp();
    author = await createTestUser(testApp.app, 'post-images-author');
    pilot = await createTestUser(testApp.app, 'post-images-pilot');

    post = await postAs<PostDto>(author, '/api/posts', {
      title: 'A post with pictures',
      visibility: 'PUBLIC',
    });
    draft = await postAs<PostDto>(author, '/api/posts', {
      title: 'A draft with pictures',
    });
  });

  afterAll(async () => {
    await deleteTestUser(testApp.app, author.id);
    await deleteTestUser(testApp.app, pilot.id);
    await testApp.close();
  });

  const as = (user: TestUser): string => `Bearer ${user.accessToken}`;
  const prisma = (): PrismaService => testApp.app.get(PrismaService);

  async function postAs<T>(user: TestUser, path: string, body: object): Promise<T> {
    const response = await request(testApp.server)
      .post(path)
      .set('Authorization', as(user))
      .send(body)
      .expect((res) => {
        if (res.status >= 300) {
          throw new Error(
            `POST ${path} answered ${String(res.status)}: ${JSON.stringify(res.body)}`,
          );
        }
      });

    return response.body as T;
  }

  async function readPost(user: TestUser | null, id: string): Promise<PostDto> {
    const call = request(testApp.server).get(`/api/posts/${id}`);
    const response = await (user ? call.set('Authorization', as(user)) : call).expect(
      200,
    );
    return response.body as PostDto;
  }

  /** The real flow: ask, PUT the bytes to storage, commit. */
  async function upload(postId: string, fileName: string): Promise<AssetDto> {
    const image = await sharp({
      create: {
        width: 320,
        height: 240,
        channels: 3,
        background: { r: 200, g: 120, b: 40 },
      },
    })
      .jpeg()
      .toBuffer();

    const ticket = await postAs<UploadTicketDto>(
      author,
      `/api/posts/${postId}/images/uploads`,
      {
        fileName,
        mime: 'image/jpeg',
        sizeBytes: image.byteLength,
      },
    );

    const put = await fetch(ticket.uploadUrl, {
      method: 'PUT',
      body: image,
      headers: { 'Content-Type': ticket.contentType },
    });
    expect(put.ok).toBe(true);

    return postAs<AssetDto>(
      author,
      `/api/posts/${postId}/images/${ticket.assetId}/commit`,
      {},
    );
  }

  const patchPost = (id: string, body: object): request.Test =>
    request(testApp.server)
      .patch(`/api/posts/${id}`)
      .set('Authorization', as(author))
      .send(body);

  const setCover = (
    user: TestUser,
    postId: string,
    assetId: string | null,
  ): request.Test =>
    request(testApp.server)
      .patch(`/api/posts/${postId}/images/cover`)
      .set('Authorization', as(user))
      .send({ assetId });

  it('the author uploads an image, and the post carries it with URLs to show it', async () => {
    frame = await upload(post.id, 'frame.jpg');
    await patchPost(post.id, { bodyMd: `![Frame](image:${frame.id})` }).expect(200);

    const read = await readPost(null, post.id);
    const image = read.images.find((entry) => entry.id === frame.id);

    // Addresses that do not expire, so a page left open and a shared card keep working.
    expect(image?.url).toBe(`/api/posts/${post.id}/images/${frame.id}/file`);
    expect(image?.thumbUrl).toBe(`/api/posts/${post.id}/images/${frame.id}/thumb`);
    expect(image).toMatchObject({ width: 320, height: 240 });
  });

  it('a visitor sees a shared post’s images without file names, and nothing of a draft’s', async () => {
    const listed = (
      await request(testApp.server).get(`/api/posts/${post.id}/images`).expect(200)
    ).body as AssetDto[];

    expect(listed.map((entry) => entry.id)).toEqual([frame.id]);
    expect(listed[0].fileName).toBeNull();

    await request(testApp.server).get(`/api/posts/${draft.id}/images`).expect(404);
  });

  it('only the author uploads, deletes or picks the cover', async () => {
    const body = { fileName: 'x.jpg', mime: 'image/jpeg', sizeBytes: 100 };

    await request(testApp.server)
      .post(`/api/posts/${post.id}/images/uploads`)
      .set('Authorization', as(pilot))
      .send(body)
      .expect(404);
    await request(testApp.server)
      .post(`/api/posts/${post.id}/images/uploads`)
      .send(body)
      .expect(401);
    await request(testApp.server)
      .delete(`/api/posts/${post.id}/images/${frame.id}`)
      .set('Authorization', as(pilot))
      .expect(404);
    await setCover(pilot, post.id, frame.id).expect(404);

    expect(await prisma().asset.count({ where: { id: frame.id } })).toBe(1);
  });

  it('the cover is one of the post’s own images, and shows on the post and in the blog', async () => {
    const elsewhere = await upload(draft.id, 'other.jpg');
    await setCover(author, post.id, elsewhere.id).expect(404);

    await setCover(author, post.id, frame.id).expect(204);

    const read = await readPost(null, post.id);
    expect(read.coverAssetId).toBe(frame.id);
    expect(read.coverImageUrl).toBeTruthy();
    expect(read.coverUrl).toBeTruthy();

    const blog = (await request(testApp.server).get('/api/posts/published').expect(200))
      .body as PostSummaryDto[];
    expect(blog.find((entry) => entry.id === post.id)?.coverUrl).toBe(
      `/api/posts/${post.id}/images/${frame.id}/thumb`,
    );
  });

  it('redirects that address to storage, and only for someone who may read the post', async () => {
    const shown = await request(testApp.server)
      .get(`/api/posts/${post.id}/images/${frame.id}/file`)
      .expect(302);
    expect(shown.headers['location']).toContain('http');
    expect(shown.headers['cache-control']).toContain('max-age');

    await request(testApp.server)
      .get(`/api/posts/${post.id}/images/${frame.id}/thumb`)
      .expect(302);

    const hidden = await upload(draft.id, 'hidden.jpg');

    // A draft is its author's alone, and an image from another post is not this one's.
    await request(testApp.server)
      .get(`/api/posts/${draft.id}/images/${hidden.id}/file`)
      .expect(404);
    await request(testApp.server)
      .get(`/api/posts/${draft.id}/images/${hidden.id}/file`)
      .set('Authorization', as(author))
      .expect(302);
    await request(testApp.server)
      .get(`/api/posts/${post.id}/images/${hidden.id}/file`)
      .expect(404);
  });

  it('saving a body that no longer shows an image deletes it, but never the cover', async () => {
    const arm = await upload(post.id, 'arm.jpg');
    await patchPost(post.id, {
      bodyMd: `![Frame](image:${frame.id})\n\n![Arm](image:${arm.id})`,
    }).expect(200);
    expect(await prisma().asset.count({ where: { id: arm.id } })).toBe(1);

    // A title alone leaves the images as they are.
    await patchPost(post.id, { title: 'Retitled' }).expect(200);
    expect(await prisma().asset.count({ where: { id: arm.id } })).toBe(1);

    const saved = (await patchPost(post.id, { bodyMd: 'Words only now.' }).expect(200))
      .body as PostDto;

    expect(saved.images.map((entry) => entry.id)).toEqual([frame.id]);
    expect(await prisma().asset.count({ where: { id: arm.id } })).toBe(0);
  });

  it('deleting the post deletes its images', async () => {
    await request(testApp.server)
      .delete(`/api/posts/${post.id}`)
      .set('Authorization', as(author))
      .expect(204);

    expect(await prisma().asset.count({ where: { id: frame.id } })).toBe(0);
  });
});
