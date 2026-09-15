import type {
  AssetDto,
  BuildDto,
  BuildPartDto,
  ConversationDto,
  PartDto,
  RepairDto,
  SpotDto,
  UploadTicketDto,
} from '@spothub/shared';
import sharp from 'sharp';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { PrismaService } from '../src/prisma';
import { type TestApp, createTestApp } from './support/app';
import { type TestUser, createTestUser, deleteTestUser } from './support/users';

/**
 * Build pages for signed-out visitors: what a request with no token may read,
 * what it is shown, and that everything else still needs signing in. The
 * owner sets up a Public, an Unlisted and a Private build, with a priced part,
 * a repair that cost money, a real photo and a question on the public one.
 */
describe('public build pages', () => {
  let testApp: TestApp;
  let owner: TestUser;
  let pilot: TestUser;
  let publicBuild: BuildDto;
  let unlistedBuild: BuildDto;
  let privateBuild: BuildDto;

  beforeAll(async () => {
    testApp = await createTestApp();
    owner = await createTestUser(testApp.app, 'public-owner');
    pilot = await createTestUser(testApp.app, 'public-pilot');

    publicBuild = await postAs<BuildDto>(owner, '/api/builds', {
      name: 'Visitor five-inch',
      visibility: 'PUBLIC',
      descriptionMd: 'Freestyle rig',
    });
    unlistedBuild = await postAs<BuildDto>(owner, '/api/builds', {
      name: 'Visitor whoop',
      visibility: 'UNLISTED',
    });
    privateBuild = await postAs<BuildDto>(owner, '/api/builds', {
      name: 'Hidden cinelifter',
    });

    const part = await postAs<PartDto>(owner, '/api/parts', {
      category: 'MOTOR',
      manufacturer: 'T-Motor',
      model: 'F60 Pro V',
      notesMd: 'Bought used from a friend',
      quantity: 1,
    });
    await postAs(owner, `/api/parts/${part.id}/sources`, {
      vendor: 'Some shop',
      url: 'https://example.com/f60',
      price: 30,
      currency: 'EUR',
      isPurchase: true,
    });
    await postAs(owner, `/api/builds/${publicBuild.id}/parts`, {
      unitId: part.units[0].id,
      installedOn: '2026-09-01',
      position: 'motor FR',
    });
    await postAs(owner, `/api/builds/${publicBuild.id}/repairs`, {
      occurredOn: '2026-09-05',
      cause: 'CRASH',
      descriptionMd: 'Arm snapped on a gap',
      cost: 12,
      currency: 'EUR',
    });
    await uploadPhoto(publicBuild.id, 'my-home-field.jpg');

    const asked = await postAs<ConversationDto>(
      pilot,
      `/api/builds/${publicBuild.id}/comments`,
      {
        body: 'Which props?',
      },
    );
    await postAs(owner, `/api/builds/${publicBuild.id}/comments`, {
      body: 'HQ triblades',
      parentId: asked.questions[0].id,
    });
  });

  afterAll(async () => {
    await deleteTestUser(testApp.app, owner.id);
    await deleteTestUser(testApp.app, pilot.id);
    await testApp.close();
  });

  const as = (user: TestUser): string => `Bearer ${user.accessToken}`;

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

  /** A request with no token at all — a signed-out visitor. */
  async function visit<T>(path: string, status = 200): Promise<T> {
    const response = await request(testApp.server).get(path).expect(status);
    return response.body as T;
  }

  async function uploadPhoto(buildId: string, fileName: string): Promise<AssetDto> {
    const image = await sharp({
      create: {
        width: 320,
        height: 240,
        channels: 3,
        background: { r: 40, g: 90, b: 160 },
      },
    })
      .jpeg()
      .toBuffer();

    const ticket = await postAs<UploadTicketDto>(
      owner,
      `/api/builds/${buildId}/photos/uploads`,
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
      owner,
      `/api/builds/${buildId}/photos/${ticket.assetId}/commit`,
      {},
    );
  }

  it('lists Public builds for a visitor, and leaves out Unlisted and Private ones', async () => {
    const listed = await visit<BuildDto[]>('/api/builds/public');
    const ids = listed.map((build) => build.id);

    expect(ids).toContain(publicBuild.id);
    expect(ids).not.toContain(unlistedBuild.id);
    expect(ids).not.toContain(privateBuild.id);
    expect(listed.every((build) => !build.ownedByViewer)).toBe(true);

    // The same list, signed in, still marks the owner's own build as theirs.
    const forOwner = (
      await request(testApp.server)
        .get('/api/builds/public')
        .set('Authorization', as(owner))
        .expect(200)
    ).body as BuildDto[];
    expect(forOwner.find((build) => build.id === publicBuild.id)?.ownedByViewer).toBe(
      true,
    );
  });

  it('opens a Public or Unlisted build for a visitor, naming the owner but never their email', async () => {
    const opened = await visit<BuildDto>(`/api/builds/${publicBuild.id}`);
    const ownerRow = await testApp.app
      .get(PrismaService)
      .user.findUniqueOrThrow({ where: { id: owner.id } });

    expect(opened).toMatchObject({
      ownedByViewer: false,
      ownerName: ownerRow.displayName,
    });
    expect(JSON.stringify(opened)).not.toContain(ownerRow.email);

    await visit(`/api/builds/${unlistedBuild.id}`);
    await visit(`/api/builds/${privateBuild.id}`, 404);
  });

  it('shows a visitor the parts, repairs and photos, without the owner’s own details', async () => {
    const [installed] = await visit<BuildPartDto[]>(
      `/api/builds/${publicBuild.id}/parts`,
    );
    expect(installed.part).toMatchObject({
      model: 'F60 Pro V',
      notesMd: null,
      purchasePrice: null,
      sources: [],
    });
    expect(JSON.stringify(installed)).not.toContain('example.com');

    const [repair] = await visit<RepairDto[]>(`/api/builds/${publicBuild.id}/repairs`);
    expect(repair).toMatchObject({
      descriptionMd: 'Arm snapped on a gap',
      cost: null,
      currency: null,
    });

    const [photo] = await visit<AssetDto[]>(`/api/builds/${publicBuild.id}/photos`);
    expect(photo.url).not.toBeNull();
    expect(photo.fileName).toBeNull();

    expect(await visit<BuildPartDto[]>(`/api/builds/${privateBuild.id}/parts`)).toEqual(
      [],
    );
    expect(await visit<RepairDto[]>(`/api/builds/${privateBuild.id}/repairs`)).toEqual(
      [],
    );
    await visit(`/api/builds/${privateBuild.id}/photos`, 404);
  });

  it('lets a visitor read the questions with every permission off, but not ask', async () => {
    const thread = await visit<ConversationDto>(`/api/builds/${publicBuild.id}/comments`);

    expect(thread.viewerOwnsSubject).toBe(false);
    expect(thread.questions).toHaveLength(1);

    const [question] = thread.questions;
    const everyComment = [question, ...question.replies];
    expect(
      everyComment.map((comment) => [
        comment.byViewer,
        comment.canDelete,
        comment.canMarkAnswer,
      ]),
    ).toEqual([
      [false, false, false],
      [false, false, false],
    ]);
    expect(question.replies[0].byOwner).toBe(true);

    await request(testApp.server)
      .post(`/api/builds/${publicBuild.id}/comments`)
      .send({ body: 'Can I ask without signing in?' })
      .expect(401);
    await visit(`/api/builds/${privateBuild.id}/comments`, 404);
  });

  it('keeps spots, owner-only reads and every write behind signing in', async () => {
    const spot = await postAs<SpotDto>(owner, '/api/spots', {
      name: 'Public field',
      lat: 49.4,
      lng: 11.4,
      visibility: 'PUBLIC',
    });
    const server = testApp.server;
    const base = `/api/builds/${publicBuild.id}`;

    await request(server).get('/api/builds').expect(401);
    await request(server).get('/api/builds/shared').expect(401);
    await request(server).get(`${base}/parts/cost`).expect(401);
    await request(server).get(`/api/spots/${spot.id}`).expect(401);
    await request(server).get(`/api/spots/${spot.id}/comments`).expect(401);
    await request(server).patch(base).send({ name: 'hijacked' }).expect(401);
    await request(server).delete(base).expect(401);
    await request(server)
      .post(`${base}/repairs`)
      .send({ occurredOn: '2026-09-06', cause: 'CRASH' })
      .expect(401);
    await request(server)
      .post(`${base}/photos/uploads`)
      .send({ fileName: 'x.jpg', mime: 'image/jpeg', sizeBytes: 100 })
      .expect(401);
  });

  it('treats a bad token on a public read as a visitor, and still recognises a good one', async () => {
    const withBadToken = (
      await request(testApp.server)
        .get(`/api/builds/${publicBuild.id}`)
        .set('Authorization', 'Bearer not-a-real-token')
        .expect(200)
    ).body as BuildDto;
    expect(withBadToken.ownedByViewer).toBe(false);

    await request(testApp.server)
      .get(`/api/builds/${privateBuild.id}`)
      .set('Authorization', 'Bearer not-a-real-token')
      .expect(404);

    const [ownView] = (
      await request(testApp.server)
        .get(`/api/builds/${publicBuild.id}/parts`)
        .set('Authorization', as(owner))
        .expect(200)
    ).body as BuildPartDto[];
    expect(ownView.part.purchasePrice).toBe(30);
  });
});
