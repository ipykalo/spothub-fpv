# Testing the deployment

The production stack runs on a laptop as well as it runs on a VPS, against the
same images the server would pull. So the whole thing can be proven before any
money is spent on a box — and it should be, because everything that has gone
wrong with this stack so far went wrong at the first run rather than at the
tenth.

This is that dry run, then the same checks against the real domain afterwards.

**What it proves:** the published images start, migrations run, the database
and storage come up, Caddy routes both hosts, the blog renders on the server,
robots and sitemap carry the right origin, guarded routes stay guarded, and a
photo makes the whole trip from a presigned upload to a stored thumbnail.

**What it cannot prove:** Let's Encrypt, real DNS, and signing in with Google.
Those need the real domain, and they are the last three checks in
`README.md` §7.

---

## Part 1 — the dry run, on this laptop

Nothing here touches the repository or the development database. It runs in
its own compose project with its own volumes, and the last step deletes them.

### 1. Start

Docker Desktop has to be running. From the repository root:

```bash
cd deploy
```

Make a throwaway environment. The secrets are deliberately fake — this stack
is deleted at the end, and nothing real should be typed into it:

```bash
cp .env.example .env.dryrun
```

Then edit `.env.dryrun` and set:

```
SITE_DOMAIN=localhost
STORAGE_DOMAIN=storage.localhost
ACME_EMAIL=test@example.com
POSTGRES_PASSWORD=test-only-password
JWT_ACCESS_SECRET=test-only-access-secret-at-least-32-chars
JWT_REFRESH_SECRET=test-only-refresh-secret-at-least-32-chars
S3_ACCESS_KEY=testaccesskey
S3_SECRET_KEY=testsecretkey123
ALLOWED_EMAILS=ipykaloi@gmail.com
GOOGLE_CLIENT_ID=unused-in-this-test
GOOGLE_CLIENT_SECRET=unused-in-this-test
```

Bring it up:

```bash
docker compose --env-file .env.dryrun up -d
```

Caddy issues its own certificate for `localhost` from its internal authority,
which nothing on this machine trusts — so every `curl` below passes `-k`. That
is the one difference from production, where the certificate is real.

Wait for the API. It runs `prisma migrate deploy` before it listens, so the
first start takes a few seconds longer than the rest:

```bash
until curl -sk -o /dev/null https://localhost/api/health; do sleep 3; done
docker compose --env-file .env.dryrun ps
```

All five services should be `Up`, with `postgres` and `minio` also `(healthy)`.
`createbuckets` is expected to be gone: it makes the bucket and exits.

### 2. The checks

Run them in order. Each line says what a pass looks like.

```bash
curl -sk -o /dev/null -w '%{http_code}\n' https://localhost/
```

→ `200`. The client is answering through Caddy. A `400` here means
`NG_ALLOWED_HOSTS` does not match the host being asked for.

```bash
curl -sk https://localhost/robots.txt
```

→ eight `Disallow:` lines and `Sitemap: https://localhost/sitemap.xml`. The
**scheme and host matter**: `http://client:4000` here means
`NG_TRUST_PROXY_HEADERS` is not reaching the container.

```bash
curl -sk https://localhost/sitemap.xml
```

→ valid XML, with `<loc>https://localhost</loc>` and one `<url>` per published
post.

```bash
curl -sk https://localhost/ | grep -o '<link rel="canonical"[^>]*>'
```

→ `<link rel="canonical" href="https://localhost/">`. This is the strongest
single check in the list: it proves the page was rendered on the server **and**
that the server knew the public address while rendering it.

```bash
curl -sk https://localhost/api/health
```

→ `{"status":"ok","database":"up","uptimeSeconds":...}`.

```bash
curl -sk -o /dev/null -w '%{http_code}\n' https://localhost/api/posts/published
```

→ `200`. The blog is the one thing a stranger may read.

```bash
for p in builds parts spots posts flights/sessions comments/unread; do
  printf '%-20s %s\n' "$p" "$(curl -sk -o /dev/null -w '%{http_code}' https://localhost/api/$p)"
done
```

→ `401` for every one. Anything else means a route lost its guard.
(`/api/flights` on its own answers `404` — there is no such route; the logbook
is read at `/api/flights/sessions`.)

```bash
curl -sk -o /dev/null -w '%{http_code}\n' https://storage.localhost/minio/health/live
```

→ `200`. Storage has its own certificate on its own name.

```bash
curl -sk -o /dev/null -w '%{http_code}\n' https://storage.localhost/spothub-media/
```

→ `403`. The bucket exists and is private, which is exactly right: everything
in it is reached through a presigned URL.

```bash
docker compose --env-file .env.dryrun exec caddy \
  wget -qS -O /dev/null --header='Host: evil.example.com' http://client:4000/
```

→ `HTTP/1.1 400 Bad Request`. A forged Host cannot steer what the server
fetches while rendering.

### 3. The photo pipeline

This is the part no `curl` of a public page reaches, and the part with the most
moving pieces: a presigned URL signed for one host, an upload that never
touches the API, and a commit where the API reads the object back, strips EXIF
and makes a thumbnail.

Sign in with Google does not work against `localhost` without adding another
redirect URI, so this walks the same path with a token minted directly. Run it
from the repository root with the stack up:

```bash
node scripts/dry-run-media.mjs
```

Expected, in order:

```
  presigned host: storage.localhost
  PUT to storage: 200
  commit: 200
  stored: READY 8x8 270 bytes
  thumbnail: made
  gallery: 1 photo(s)
  cleaned up
```

`presigned host` is the one to read carefully. It has to be the **public**
storage name, because that URL is handed to a browser. If it says `minio:9000`,
`S3_PUBLIC_ENDPOINT` is not set and no browser will be able to upload.

The script creates a pilot and a build, and deletes the pilot by exact id at
the end — which takes the build, the asset and the stored object with it.

### 4. Stop

```bash
docker compose --env-file .env.dryrun down -v
rm .env.dryrun
```

`-v` removes the volumes, so nothing of this test survives. The development
database in the repository root's own compose file is untouched throughout.

---

## Part 2 — the same checks on the real domain

Once the VPS is up and `README.md` §6 has brought the stack online, repeat
every check above with `https://<SITE_DOMAIN>` in place of `https://localhost`
and **without `-k`** — dropping it is the point, because a certificate error
there is a real failure rather than an expected one.

Three more that only work on the real thing:

1. **The certificate.** `curl -sI https://<SITE_DOMAIN> | head -1` → `200`, and
   no certificate warning. `docker compose logs caddy | grep -i certificate`
   should say it obtained one for each of the three names.
2. **Signing in.** Open the site and sign in with Google. You should come back
   signed in. `redirect_uri_mismatch` means the URI in the Google console is
   not character-for-character `https://<SITE_DOMAIN>/api/auth/google/callback`.
   Signed in but signed out again on refresh means the refresh cookie is being
   dropped — it is `secure`, so the whole site has to be HTTPS.
3. **A photo, from a browser.** Create a build and upload one. This is the
   browser half of the pipeline the dry run proved server-side, and it also
   proves storage's certificate is trusted by a real browser rather than by
   `curl -k`.

Then the two that exercise the heavier paths:

- **Deep link.** Open `https://<SITE_DOMAIN>/hangar/<a build id>` and
  hard-refresh. A `404` means Caddy is not falling through to the client.
- **A blackbox log.** Import a `.bbl`. It is the only check that proves
  `blackbox_decode` is in the API image and runs on the server's architecture —
  which is why the images have to be `amd64` and the box has to be x86.

---

## If the dry run fails

| What you see                          | Where to look                                                      |
| ------------------------------------- | ------------------------------------------------------------------ |
| `manifest unknown` on pull            | No `master` image yet — merge `dev` into `master` and let CI build |
| Everything `400`                      | `NG_ALLOWED_HOSTS` does not list the host being requested          |
| `Sitemap: http://client:4000/...`     | `NG_TRUST_PROXY_HEADERS` missing from the client's environment     |
| `presigned host: minio:9000`          | `S3_PUBLIC_ENDPOINT` not set                                       |
| `commit: 500`, `ENOTFOUND storage...` | `S3_ENDPOINT` points at the public name; it should be `minio:9000` |
| `api` restarting                      | `docker compose logs api` — almost always `DATABASE_URL`           |
| Port 443 already allocated            | Something else on the machine has it; stop it and `up -d` again    |
