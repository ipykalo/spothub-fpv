/**
 * Walks the media pipeline against a running deployment, without a browser.
 *
 * The one path no `curl` of a public page reaches, and the one with the most
 * moving pieces: a URL presigned for a host the browser can resolve, an upload
 * that never touches the API, and a commit where the API reads the object back
 * out of storage, strips its EXIF and makes a thumbnail. It is also where the
 * first deploy broke — the API was signing URLs for a host it could not itself
 * resolve — so it is worth proving before trusting a stack.
 *
 * Signing in needs Google, which needs the real domain, so the pilot is
 * inserted directly and given a token signed with the same secret the API
 * verifies with. Everything it creates is deleted by exact id at the end.
 *
 * Usage, from the repository root with the stack up:
 *   node scripts/dry-run-media.mjs
 *   node scripts/dry-run-media.mjs --env deploy/.env.dryrun --site https://localhost
 */

import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { request } from 'node:https';
import { resolve } from 'node:path';

import jwt from 'jsonwebtoken';
import sharp from 'sharp';

const args = new Map();

for (let i = 2; i < process.argv.length; i += 2) {
  args.set(process.argv[i].replace(/^--/, ''), process.argv[i + 1]);
}

// Absolute, because compose is run from `deploy/` and would otherwise resolve
// a relative path a second time against that directory.
const envFile = resolve(args.get('env') ?? 'deploy/.env.dryrun');
const site = args.get('site') ?? 'https://localhost';

/** A fixed id, so a run that dies half way can be cleaned up by hand. */
const PILOT_ID = '11111111-2222-3333-4444-555555555555';
const PILOT_EMAIL = 'dry-run@example.invalid';

const env = readEnv(envFile);
const compose = ['compose', '--env-file', envFile];

/**
 * The dry run's own certificate authority: Caddy signs `localhost` and
 * `storage.localhost` with a root it keeps in its data volume. Trusting that
 * one root keeps every certificate check on. A real domain needs none.
 */
const caddyRoot =
  new URL(site).hostname === 'localhost'
    ? execFileSync(
        'docker',
        [
          ...compose,
          'exec',
          '-T',
          'caddy',
          'cat',
          '/data/caddy/pki/authorities/local/root.crt',
        ],
        { cwd: 'deploy', encoding: 'utf8' },
      )
    : undefined;

function readEnv(path) {
  const values = new Map();

  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const match = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());

    if (match) {
      values.set(match[1], match[2]);
    }
  }

  return values;
}

function psql(sql) {
  return execFileSync(
    'docker',
    [
      ...compose,
      'exec',
      '-T',
      'postgres',
      'psql',
      '-U',
      env.get('POSTGRES_USER') ?? 'spothub',
      '-d',
      env.get('POSTGRES_DB') ?? 'spothub',
      '-qtAX',
      '-c',
      sql,
    ],
    { cwd: 'deploy', encoding: 'utf8' },
  ).trim();
}

/**
 * Stands in for DNS, answering 127.0.0.1 for anything asked of it. Written to
 * both shapes `dns.lookup` is called in — with and without options, and with
 * `all` — because the socket layer uses more than one of them.
 */
function toLoopback(hostname, options, callback) {
  const done = typeof options === 'function' ? options : callback;
  const wantsAll = typeof options === 'object' && options !== null && options.all;

  if (wantsAll) {
    done(null, [{ address: '127.0.0.1', family: 4 }]);
    return;
  }

  done(null, '127.0.0.1', 4);
}

/**
 * Every request, to the site and to storage alike, with certificates checked.
 *
 * Against the dry run, Caddy signs the certificates with an authority of its
 * own, so that authority is what is trusted — read out of the Caddy container
 * — rather than checking switched off. Against a real domain, `ca` is unset
 * and the system's own authorities apply.
 *
 * Not `fetch`, because of one Windows detail: `storage.localhost` does not
 * resolve there, while plain `localhost` does — so the dry run would fail on
 * the very step it exists to prove. The address is overridden the way
 * `curl --resolve` does it, leaving the Host header and the SNI name alone:
 * SigV4 signs the host, so rewriting the URL would invalidate the signature.
 */
function send(url, { method = 'GET', headers = {}, body } = {}) {
  const target = new URL(url);
  const isLoopback = target.hostname.endsWith('.localhost');
  const payload = typeof body === 'string' ? Buffer.from(body) : body;

  return new Promise((done, fail) => {
    const outgoing = request(
      {
        hostname: target.hostname,
        port: target.port || 443,
        path: `${target.pathname}${target.search}`,
        method,
        headers: payload ? { ...headers, 'Content-Length': payload.byteLength } : headers,
        servername: target.hostname,
        ...(caddyRoot ? { ca: caddyRoot } : {}),
        ...(isLoopback ? { lookup: toLoopback } : {}),
      },
      (answer) => {
        const chunks = [];
        answer.on('data', (chunk) => chunks.push(chunk));
        answer.on('end', () =>
          done({
            status: answer.statusCode,
            text: Buffer.concat(chunks).toString('utf8'),
          }),
        );
      },
    );

    outgoing.on('error', fail);
    outgoing.end(payload);
  });
}

/** The upload, sent the way a browser would send it: straight to storage. */
async function putBytes(url, contentType, body) {
  const answer = await send(url, {
    method: 'PUT',
    headers: { 'Content-Type': contentType },
    body,
  });

  return answer.status;
}

async function call(path, options = {}) {
  const { status, text } = await send(`${site}${path}`, options);

  return {
    status,
    body: text.length > 0 ? JSON.parse(text) : null,
  };
}

async function main() {
  // An access token is only good while its session stands, so the pilot gets
  // one: a refresh-token row of its own family, as a sign-in makes. It goes
  // with the pilot at the end, by the schema's cascade.
  const session = randomUUID();

  psql(
    `INSERT INTO users (id, email, display_name, role, created_at, updated_at)
     VALUES ('${PILOT_ID}', '${PILOT_EMAIL}', 'Dry run', 'USER', now(), now())
     ON CONFLICT (id) DO NOTHING;
     INSERT INTO refresh_tokens (id, user_id, token_hash, family_id, expires_at)
     VALUES ('${randomUUID()}', '${PILOT_ID}', '${randomUUID()}', '${session}', now() + interval '1 hour');`,
  );

  const token = jwt.sign(
    { sub: PILOT_ID, email: PILOT_EMAIL, role: 'USER', sid: session },
    env.get('JWT_ACCESS_SECRET'),
    { expiresIn: '10m' },
  );
  const auth = { Authorization: `Bearer ${token}` };
  const json = { ...auth, 'Content-Type': 'application/json' };

  try {
    const me = await call('/api/auth/me', { headers: auth });

    if (me.status !== 200) {
      throw new Error(`the API did not accept the token: HTTP ${me.status}`);
    }

    const build = await call('/api/builds', {
      method: 'POST',
      headers: json,
      body: JSON.stringify({ name: 'Dry run quad' }),
    });
    const buildId = build.body.id;

    // A real image, so the commit step has something it can actually read.
    const image = await sharp({
      create: { width: 8, height: 8, channels: 3, background: '#ffbb00' },
    })
      .jpeg()
      .toBuffer();

    const ticket = await call(`/api/builds/${buildId}/photos/uploads`, {
      method: 'POST',
      headers: json,
      body: JSON.stringify({
        fileName: 'dry-run.jpg',
        mime: 'image/jpeg',
        sizeBytes: image.byteLength,
      }),
    });

    if (ticket.status !== 200) {
      throw new Error(`no upload ticket: HTTP ${ticket.status}`);
    }

    const { host } = new URL(ticket.body.uploadUrl);
    console.log(`  presigned host: ${host}`);

    const put = await putBytes(ticket.body.uploadUrl, ticket.body.contentType, image);
    console.log(`  PUT to storage: ${put}`);

    const commit = await call(
      `/api/builds/${buildId}/photos/${ticket.body.assetId}/commit`,
      { method: 'POST', headers: auth },
    );
    console.log(`  commit: ${commit.status}`);

    if (commit.status === 200 || commit.status === 201) {
      const photo = commit.body;
      console.log(
        `  stored: ${photo.status} ${photo.width}x${photo.height} ${photo.sizeBytes} bytes`,
      );
      console.log(`  thumbnail: ${photo.thumbUrl ? 'made' : 'none'}`);
    }

    const gallery = await call(`/api/builds/${buildId}/photos`, { headers: auth });
    console.log(`  gallery: ${gallery.body.length} photo(s)`);

    if (commit.status !== 200 && commit.status !== 201) {
      throw new Error('the commit step failed; see `docker compose logs api`');
    }
  } finally {
    // The pilot cascades to the build, the asset and the stored object.
    psql(`DELETE FROM users WHERE id = '${PILOT_ID}';`);
    console.log('  cleaned up');
  }
}

main().catch((error) => {
  console.error(`\n  FAILED: ${error.message}`);
  process.exit(1);
});
