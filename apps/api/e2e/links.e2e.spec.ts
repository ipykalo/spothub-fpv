import { type AddressInfo } from 'node:net';
import { type Server, createServer } from 'node:http';

import type { BuildDto, PartDto } from '@spothub/shared';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { UrlPreviewService } from '../src/parts/services/url-preview.service';
import { type TestApp, createTestApp } from './support/app';
import { type TestUser, createTestUser, deleteTestUser } from './support/users';

/**
 * Links a pilot pastes: only web addresses are stored, and the link preview —
 * the one place the server opens an address someone else chose — never
 * reaches the machine it runs on or the network behind it.
 */
describe('links', () => {
  let testApp: TestApp;
  let pilot: TestUser;
  /** Stands in for something on the private network that must never be read. */
  let internal: Server;
  let internalHits = 0;
  let internalPort = 0;

  beforeAll(async () => {
    testApp = await createTestApp();
    pilot = await createTestUser(testApp.app, 'links-pilot');

    internal = createServer((_request, response) => {
      internalHits += 1;
      response.writeHead(200, { 'content-type': 'text/html' });
      response.end('<meta property="og:title" content="Internal secret">');
    });
    await new Promise<void>((resolve) => internal.listen(0, '127.0.0.1', resolve));
    internalPort = (internal.address() as AddressInfo).port;
  });

  afterAll(async () => {
    await new Promise((resolve) => internal.close(resolve));
    await deleteTestUser(testApp.app, pilot.id);
    await testApp.close();
  });

  const as = (): string => `Bearer ${pilot.accessToken}`;

  it('stores only web addresses as shop links', async () => {
    for (const purchaseUrl of ['javascript:alert(1)', 'data:text/html,hi', 'file:///etc/passwd']) {
      const response = await request(testApp.server)
        .post('/api/builds')
        .set('Authorization', as())
        .send({ name: 'Linked quad', boughtComplete: true, purchaseUrl });

      expect(response.status, purchaseUrl).toBe(400);
    }

    const build = await request(testApp.server)
      .post('/api/builds')
      .set('Authorization', as())
      .send({
        name: 'Linked quad',
        boughtComplete: true,
        purchaseUrl: 'https://www.getfpv.com/quad',
      });
    expect(build.status).toBe(201);
    expect((build.body as BuildDto).purchaseUrl).toBe('https://www.getfpv.com/quad');

    const part = await request(testApp.server)
      .post('/api/parts')
      .set('Authorization', as())
      .send({ name: 'Linked motor', category: 'MOTOR' });
    expect(part.status).toBe(201);

    const source = await request(testApp.server)
      .post(`/api/parts/${(part.body as PartDto).id}/sources`)
      .set('Authorization', as())
      .send({ url: 'javascript:alert(1)' });
    expect(source.status).toBe(400);
  });

  it('will not be asked to preview an address on the private network', async () => {
    for (const url of [
      `http://127.0.0.1:${String(internalPort)}/`,
      'http://169.254.169.254/latest/meta-data/',
      'http://localhost/',
      'http://10.0.0.1/',
    ]) {
      const response = await request(testApp.server)
        .post('/api/parts/url-preview')
        .set('Authorization', as())
        .send({ url });

      expect(response.status, url).toBe(400);
    }

    expect(internalHits).toBe(0);
  });

  it('checks the address it connects to, not only the name in the link', async () => {
    const preview = testApp.app.get(UrlPreviewService);

    // A name that resolves to loopback, and loopback written inside IPv6.
    const byName = await preview.fetchPreview(`http://localhost.:${String(internalPort)}/`);
    expect(byName.title).toBeNull();

    await expect(
      preview.fetchPreview(`http://[::ffff:127.0.0.1]:${String(internalPort)}/`),
    ).rejects.toThrow('That link cannot be read');

    expect(internalHits).toBe(0);
  });
});
