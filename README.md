# SpotHub FPV

A private hangar and build log for FPV quads, with a public read-only face.
Records what you built, what's in it, what it cost, and what firmware it runs.

**Stack:** Angular 22 (standalone, signals, zoneless) · NestJS · PostgreSQL +
Prisma · Nx monorepo · Docker.

> Full product scope, architecture notes and the board live in Notion under
> **SpotHub FPV**.

---

## Getting started

Requires Node 22+ and Docker.

```bash
npm install                 # runs `prisma generate` via postinstall
cp .env.example .env        # then fill in the Google OAuth values below
npm run db:up               # Postgres (PostGIS image) + MinIO
npm run db:migrate          # creates the schema
npm run dev                 # API on :3000, client on :4200
```

Open http://localhost:4200.

### Google OAuth credentials

1. Create an OAuth client at
   [console.cloud.google.com/apis/credentials](https://console.cloud.google.com/apis/credentials)
   (type: **Web application**).
2. Add `http://localhost:3000/api/auth/google/callback` as an authorised
   redirect URI — it must match `GOOGLE_CALLBACK_URL` exactly.
3. Put the client id and secret in `.env`.
4. Add your own address to `ALLOWED_EMAILS`. **Nobody can sign in until you
   do** — that is the intended default.

Generate the JWT secrets with `openssl rand -base64 48`.

---

## Layout

```
apps/
  api/                NestJS
    src/auth/         Google OAuth, rotating refresh tokens, guards
    src/builds/       the hangar
    src/common/       error filter, zod pipe, utilities
    src/config/       environment schema, validated at boot
    src/prisma/       connection lifecycle
  client/             Angular
    src/app/core/     auth store, HTTP interceptor, route guards
    src/app/features/ login, callback, builds
libs/
  shared/             zod contracts + types used by BOTH sides
prisma/
  schema.prisma
```

## Design decisions worth knowing

**One contract, two consumers.** Request shapes live once, in
`libs/shared`, as zod schemas. The API validates against them and the client
builds its forms from the inferred types, so the two cannot drift.

**The domain does not import Prisma.** Services and repository contracts speak
`UserEntity` / `BuildEntity`; only the `prisma-*.repository.ts` files know an
ORM exists. Swapping persistence touches those files and nothing else.

**Ownership lives in the signature.** Every repository method takes `ownerId`
first, so a query that forgets the ownership filter cannot be written. This is
also why opening the app to more users needs no data-layer change.

**Routes are guarded by default.** `JwtAuthGuard` is registered globally;
opting out is an explicit `@Public()`. The inverse — remembering to guard each
new route — fails silently the first time someone forgets.

**Tokens.** Short-lived access JWT held in memory only (never
`localStorage`), plus a rotating refresh token in an httpOnly `SameSite=Lax`
cookie. Presenting an already-rotated token revokes the whole family, on the
assumption the cookie leaked. Identities key on Google's `sub` claim, never the
email — emails change, subjects do not.

**One env var gates registration.** `ALLOWED_EMAILS`. Set it to `*` to open
sign-up; everything else already carries an owner.

## Commands

| Command              | Does                                              |
| -------------------- | ------------------------------------------------- |
| `npm run dev`        | API and client together                           |
| `npm run lint`       | ESLint, type-aware rules, zero warnings tolerated |
| `npm run format`     | Prettier over the workspace                       |
| `npm run typecheck`  | Both apps                                         |
| `npm run db:migrate` | Create/apply a migration                          |
| `npm run db:studio`  | Prisma Studio — the stand-in admin UI             |
| `npm run db:reset`   | Drop and recreate (destroys local data)           |

## Deployment

Images build from the repository root:

```bash
docker build -f apps/api/Dockerfile -t spothub-api .
docker build -f apps/client/Dockerfile -t spothub-client .
```

The API image runs `prisma migrate deploy` at startup rather than at build
time. The client image serves static files through nginx with an SPA fallback,
so refreshing a deep link works.

Target is a small VPS running `docker compose` behind Caddy for automatic TLS.

## Status

Implemented: workspace, local infrastructure, Google auth with token rotation,
builds CRUD end to end.

Next: parts inventory, install/remove with cost rollup, repairs, firmware
config snapshots and the diff viewer, media uploads.
