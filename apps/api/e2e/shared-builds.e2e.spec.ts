import type {
  AssetDto,
  BuildCostDto,
  BuildDto,
  BuildPartDto,
  PartDto,
  RepairDto,
  UploadTicketDto,
} from '@spothub/shared';
import sharp from 'sharp';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { PrismaService } from '../src/prisma';
import { type TestApp, createTestApp } from './support/app';
import { type TestUser, createTestUser, deleteTestUser } from './support/users';

/**
 * Builds shared with other signed-in pilots: what opens, what is listed, what
 * is shown, and what stays the owner's. The owner sets up a Public, an
 * Unlisted and a Private build, with a priced part, a repair that cost money
 * and a real photo on the public one; another pilot then looks.
 */
describe('shared builds', () => {
  let testApp: TestApp;
  let owner: TestUser;
  let pilot: TestUser;
  let publicBuild: BuildDto;
  let unlistedBuild: BuildDto;
  let privateBuild: BuildDto;

  beforeAll(async () => {
    testApp = await createTestApp();
    owner = await createTestUser(testApp.app, 'builds-owner');
    pilot = await createTestUser(testApp.app, 'builds-pilot');

    publicBuild = await postAs<BuildDto>(owner, '/api/builds', {
      name: 'Shared five-inch',
      visibility: 'PUBLIC',
      descriptionMd: 'Freestyle rig',
    });
    unlistedBuild = await postAs<BuildDto>(owner, '/api/builds', {
      name: 'Unlisted whoop',
      visibility: 'UNLISTED',
    });
    privateBuild = await postAs<BuildDto>(owner, '/api/builds', {
      name: 'Private cinelifter',
    });

    // A part bought for money, with notes, fitted to the public build.
    const part = await postAs<PartDto>(owner, '/api/parts', {
      category: 'MOTOR',
      manufacturer: 'T-Motor',
      model: 'F60 Pro V',
      spec: { kv: 1750 },
      notesMd: 'Bought used from a friend',
      quantity: 2,
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

  /** A change by the owner — used here to switch what a shared build gives away. */
  async function patchAs(user: TestUser, path: string, body: object): Promise<void> {
    await request(testApp.server)
      .patch(path)
      .set('Authorization', as(user))
      .send(body)
      .expect(200);
  }

  async function getAs<T>(user: TestUser, path: string, status = 200): Promise<T> {
    const response = await request(testApp.server)
      .get(path)
      .set('Authorization', as(user))
      .expect(status);

    return response.body as T;
  }

  /** The real presigned flow: ask, PUT the bytes to storage, commit. */
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

  it('lists other pilots’ Public builds, and leaves out Unlisted, Private and the viewer’s own', async () => {
    const forPilot = (await getAs<BuildDto[]>(pilot, '/api/builds/shared')).map(
      (build) => build.id,
    );
    expect(forPilot).toContain(publicBuild.id);
    expect(forPilot).not.toContain(unlistedBuild.id);
    expect(forPilot).not.toContain(privateBuild.id);

    const forOwner = (await getAs<BuildDto[]>(owner, '/api/builds/shared')).map(
      (build) => build.id,
    );
    expect(forOwner).not.toContain(publicBuild.id);

    // The pilot's own hangar is still only theirs.
    expect(await getAs<BuildDto[]>(pilot, '/api/builds')).toEqual([]);
  });

  it('opens a Public or Unlisted build read-only for another pilot, naming the owner but never their email', async () => {
    const opened = await getAs<BuildDto>(pilot, `/api/builds/${publicBuild.id}`);
    const ownerRow = await testApp.app
      .get(PrismaService)
      .user.findUniqueOrThrow({ where: { id: owner.id } });

    expect(opened.ownedByViewer).toBe(false);
    expect(opened.ownerName).toBe(ownerRow.displayName);
    expect(opened.descriptionMd).toBe('Freestyle rig');
    expect(JSON.stringify(opened)).not.toContain(ownerRow.email);

    await getAs(pilot, `/api/builds/${unlistedBuild.id}`);
    await getAs(pilot, `/api/builds/${privateBuild.id}`, 404);

    expect(
      (await getAs<BuildDto>(owner, `/api/builds/${publicBuild.id}`)).ownedByViewer,
    ).toBe(true);
  });

  it('shows another pilot what is fitted, never what it cost, where it came from or the notes', async () => {
    const [installed] = await getAs<BuildPartDto[]>(
      pilot,
      `/api/builds/${publicBuild.id}/parts`,
    );

    expect(installed.position).toBe('motor FR');
    expect(installed.part).toMatchObject({
      manufacturer: 'T-Motor',
      model: 'F60 Pro V',
      spec: { kv: 1750 },
      notesMd: null,
      purchasePrice: null,
      purchaseCurrency: null,
      sources: [],
      units: [],
    });
    expect(installed.unit.acquiredOn).toBeNull();
    expect(JSON.stringify(installed)).not.toContain('example.com');

    const [ownView] = await getAs<BuildPartDto[]>(
      owner,
      `/api/builds/${publicBuild.id}/parts`,
    );
    expect(ownView.part.purchasePrice).toBe(30);
    expect(ownView.part.sources).toHaveLength(1);

    // Private builds list nothing, and the rollup is not theirs to ask for at
    // all — answered as no such build, rather than as a build with no costs.
    expect(
      await getAs<BuildPartDto[]>(pilot, `/api/builds/${privateBuild.id}/parts`),
    ).toEqual([]);
    await getAs(pilot, `/api/builds/${publicBuild.id}/parts/cost`, 404);
  });

  it('shows another pilot what broke and when, never what the repair cost', async () => {
    const [repair] = await getAs<RepairDto[]>(
      pilot,
      `/api/builds/${publicBuild.id}/repairs`,
    );

    expect(repair).toMatchObject({
      descriptionMd: 'Arm snapped on a gap',
      cost: null,
      currency: null,
    });

    const [ownView] = await getAs<RepairDto[]>(
      owner,
      `/api/builds/${publicBuild.id}/repairs`,
    );
    expect(ownView).toMatchObject({ cost: 12, currency: 'EUR' });

    expect(
      await getAs<RepairDto[]>(pilot, `/api/builds/${privateBuild.id}/repairs`),
    ).toEqual([]);
  });

  it('shows the costs and the notes when the owner switches them on, and hides them again', async () => {
    await patchAs(owner, `/api/builds/${publicBuild.id}`, {
      shareCosts: true,
      shareNotes: true,
    });

    const [install] = await getAs<BuildPartDto[]>(
      pilot,
      `/api/builds/${publicBuild.id}/parts`,
    );
    expect(install.part).toMatchObject({
      notesMd: 'Bought used from a friend',
      purchasePrice: 30,
      purchaseCurrency: 'EUR',
    });
    expect(install.part.sources).toHaveLength(1);

    // The shelf is still the owner's: other units and when this one was
    // acquired are not part of the build, whatever is switched on.
    expect(install.part.units).toEqual([]);
    expect(install.unit.acquiredOn).toBeNull();

    const [repair] = await getAs<RepairDto[]>(
      pilot,
      `/api/builds/${publicBuild.id}/repairs`,
    );
    expect(repair).toMatchObject({ cost: 12, currency: 'EUR' });

    const rollup = await getAs<BuildCostDto>(
      pilot,
      `/api/builds/${publicBuild.id}/parts/cost`,
    );
    expect(rollup.installedCount).toBe(1);
    expect(rollup.totals).toEqual([{ currency: 'EUR', amount: 30 }]);

    // Switched off again, and the reader is back where they started.
    await patchAs(owner, `/api/builds/${publicBuild.id}`, {
      shareCosts: false,
      shareNotes: false,
    });

    const [again] = await getAs<BuildPartDto[]>(
      pilot,
      `/api/builds/${publicBuild.id}/parts`,
    );
    expect(again.part).toMatchObject({ notesMd: null, purchasePrice: null });
    await getAs(pilot, `/api/builds/${publicBuild.id}/parts/cost`, 404);
  });

  it('shows another pilot the photos, without the name the file had on the owner’s phone', async () => {
    const [photo] = await getAs<AssetDto[]>(
      pilot,
      `/api/builds/${publicBuild.id}/photos`,
    );

    expect(photo.url).not.toBeNull();
    expect(photo.fileName).toBeNull();

    const [ownView] = await getAs<AssetDto[]>(
      owner,
      `/api/builds/${publicBuild.id}/photos`,
    );
    expect(ownView.fileName).toBe('my-home-field.jpg');

    await getAs(pilot, `/api/builds/${privateBuild.id}/photos`, 404);
  });

  it('refuses every change from someone the build is only shared with', async () => {
    const [installed] = await getAs<BuildPartDto[]>(
      owner,
      `/api/builds/${publicBuild.id}/parts`,
    );
    const [photo] = await getAs<AssetDto[]>(
      owner,
      `/api/builds/${publicBuild.id}/photos`,
    );
    const [repair] = await getAs<RepairDto[]>(
      owner,
      `/api/builds/${publicBuild.id}/repairs`,
    );
    const base = `/api/builds/${publicBuild.id}`;
    const server = testApp.server;
    const auth = as(pilot);

    await request(server)
      .patch(base)
      .set('Authorization', auth)
      .send({ name: 'hijacked' })
      .expect(404);
    await request(server).delete(base).set('Authorization', auth).expect(404);
    await request(server)
      .post(`${base}/repairs`)
      .set('Authorization', auth)
      .send({ occurredOn: '2026-09-06', cause: 'CRASH' })
      .expect(404);
    await request(server)
      .delete(`${base}/repairs/${repair.id}`)
      .set('Authorization', auth)
      .expect(404);
    await request(server)
      .delete(`${base}/parts/${installed.id}`)
      .set('Authorization', auth)
      .send({ removedOn: '2026-09-07' })
      .expect(404);
    await request(server)
      .post(`${base}/photos/uploads`)
      .set('Authorization', auth)
      .send({ fileName: 'x.jpg', mime: 'image/jpeg', sizeBytes: 100 })
      .expect(404);
    await request(server)
      .delete(`${base}/photos/${photo.id}`)
      .set('Authorization', auth)
      .expect(404);
    await request(server)
      .patch(`${base}/photos/cover`)
      .set('Authorization', auth)
      .send({ assetId: null })
      .expect(404);

    // Everything is still as the owner left it.
    const after = await getAs<BuildDto>(owner, base);
    expect(after.name).toBe('Shared five-inch');
    expect(await getAs<AssetDto[]>(owner, `${base}/photos`)).toHaveLength(1);
  });

  it('making a build private again takes it back from everyone else', async () => {
    await request(testApp.server)
      .patch(`/api/builds/${publicBuild.id}`)
      .set('Authorization', as(owner))
      .send({ visibility: 'PRIVATE' })
      .expect(200);

    await getAs(pilot, `/api/builds/${publicBuild.id}`, 404);
    expect(
      await getAs<BuildPartDto[]>(pilot, `/api/builds/${publicBuild.id}/parts`),
    ).toEqual([]);
    const listed = (await getAs<BuildDto[]>(pilot, '/api/builds/shared')).map(
      (build) => build.id,
    );
    expect(listed).not.toContain(publicBuild.id);
  });
});
