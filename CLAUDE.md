# SpotHub FPV — working notes

A private hangar and build log for FPV quads, with a public read-only face
planned. Single user for now (Google sign-in, allowlisted by env var), designed
so opening it to more users is one config change.

Product scope, architecture notes and the ticket board live in **Notion under
"SpotHub FPV"**. Read those before making scope decisions; this file covers how
the code is put together.

## Stack

Nx 23.2 · Angular 22.1.4 · NestJS 11 · PostgreSQL + Prisma 6.19 · Node 22.

```
apps/api        NestJS
apps/client     Angular
libs/shared     zod contracts + types used by BOTH sides  (@spothub/shared)
prisma/         schema + migrations
```

## Conventions — follow these, they are deliberate

**Contracts live once, in `libs/shared`, as zod schemas.** The API validates
through `ZodValidationPipe`; the client builds its forms from the same schemas'
inferred types. Never define a request shape in two places. Do not introduce
class-validator — it would reintroduce the drift this avoids.

**The domain must not import Prisma.** Services and repository contracts speak
`UserEntity` / `BuildEntity` / `RefreshTokenEntity`. Only the
`prisma-*.repository.ts` files and `PrismaService` may import `@prisma/client`.
If you find yourself importing a Prisma type into a service, add an entity
instead.

**Repository contracts are abstract classes, not interfaces**, so they double
as Nest injection tokens:

```ts
{ provide: BuildsRepository, useClass: PrismaBuildsRepository }
```

No string tokens anywhere in this codebase.

**Ownership lives in the method signature.** Every repository method takes
`ownerId` first. Updates and deletes go through `updateMany` / `deleteMany`
scoped by owner, so a cross-tenant write is not expressible. Keep this pattern
for every new entity — it is why multi-user needs no data-layer change.

**Routes are guarded by default.** `JwtAuthGuard` is a global `APP_GUARD`;
opting out is an explicit `@Public()`. Never guard routes individually.

**Angular is modern and zoneless.** Standalone components with `OnPush`,
`inject()` rather than constructor injection, signals for state, `@if` / `@for`
control flow, lazy-loaded routes. No `NgModule`s, no `zone.js`, no
constructor-injected services in components.

**Client state goes in a signal-backed store** (`BuildsStore` is the pattern),
not in components. Components read signals and call intents; only the API
service touches `HttpClient`. No NgRx: the signal store already does that job
without actions, reducers or effects.

**Every component is three files** — `foo.ts`, `foo.html`, `foo.scss`, wired
with `templateUrl` and `styleUrl`. Never inline `template:` or `styles:`.

**Containers and presenters are separate directories.** Containers inject the
store, own side effects, navigation and notifications, and render almost no
markup. Presenters take `input()`s, emit `output()`s, inject nothing stateful
and hold no application state — which is what lets them serve the V4 public
build pages, where there is no store behind them.

```
features/builds/
  builds.api.ts  builds.store.ts
  containers/    builds-list.page.*   build-form.page.*
  presenters/    build-card/  build-status-filter/  build-form/
```

**The selector prefix is `sh-`**, set in `apps/client/eslint.config.mjs` and
the `prefix` field of `apps/client/project.json`. The root component is
`sh-root`.

## Gotchas

- **Prisma is pinned to `^6` on purpose.** `latest` resolves to an 8.0 release
  candidate with a reworked CLI that has no `generate` or `migrate`. Do not
  bump it.
- `prisma generate` runs via postinstall. If types from `@prisma/client` are
  missing, run it manually before debugging anything else.
- The Alpine runtime needs the musl binary target — already set in
  `schema.prisma`, do not remove it.
- Migrations run at container startup, never in a Dockerfile layer.
- `ALLOWED_EMAILS` gates registration. Empty means nobody can sign in; that is
  the intended default, not a bug.
- Google identities key on the `sub` claim, never the email.
- **Nx injects every `.env` value into every task**, and the Angular dev server
  honours `PORT`. With `PORT=3000` set for the API, `nx serve client` grabbed
  3000 too and nothing bound 4200 — and on Windows the second bind *succeeds*
  (`::1:3000` alongside the API's `:::3000`), so there is no `EADDRINUSE` and
  no error, just a proxy returning 502. Hence
  `NX_LOAD_DOT_ENV_FILES=false` on the dev scripts. Nothing is lost:
  `@nestjs/config` and the Prisma CLI both read `.env` themselves. Setting
  `port` in the serve target does not help — the env var wins.
- **Lint must go through Nx.** ESLint flat config does not cascade, so
  `eslint apps libs` applies only the root config and silently skips every
  Angular and template rule. Use `nx run-many -t lint`, which is what
  `npm run lint` and CI now do.

## Commands

```bash
npm run dev            # api :3000 + client :4200
npm run db:up          # postgres + minio
npm run db:migrate     # create/apply a migration
npm run db:studio      # stand-in admin UI
npm run db:seed        # demo inventory, one real part per category
npm run db:seed:undo   # remove it again
npm run lint           # type-aware, zero warnings tolerated
npm run typecheck
npm run build
```

`prisma/seed.ts` is a **script, not a migration**. Migrations run at container
startup on every deploy, so demo data in `prisma/migrations` would land in
production. The seed is additive, idempotent and reversible, and it will not
delete a part whose units are fitted to a build.

Lint uses `strictTypeChecked` + `stylisticTypeChecked`. If a rule fires, fix
the code rather than disabling the rule; the few existing inline disables each
carry a comment explaining why.

## State

**Done:** workspace, docker-compose (Postgres + MinIO), Google OAuth with
rotating refresh tokens and reuse detection, ESLint + Prettier, Dockerfiles,
verify CI. Every V1 feature except media:

- Builds CRUD end to end, status as colour and icon
- Parts inventory — catalogue (`parts`), physical units (`part_units`), price
  sources (`part_sources`), paste-a-URL OpenGraph enrichment
- Install/remove on a build (`build_parts`) with a cost rollup that sums only
  rows marked as actual purchases
- Repairs, with installs linkable to the repair that caused them
- Firmware config snapshots — Betaflight CLI captures parsed by a function
  shared with the client, downloadable under Configurator's own filename
  convention, and loadable back from a saved `.txt`
- Config diff viewer — side by side, virtual-scrolled, caveats stated up front

Seven migrations applied. Two are hand-written because Prisma cannot express
them: `part_status_condition_only` (a `CASE` conversion between enum types) and
`part_units` (a `generate_series` expansion where only *open* installs get a
distinct unit). Read those before changing the parts model.

**Next, in order:** media upload pipeline, then deployment — GHCR image
build-and-push, database backups with a tested restore, VPS + Caddy.

The media pipeline uses presigned PUT straight to object storage — the API must
never receive file bytes. The config file-load feature keeps to this: the file
is read in the browser and its text posted in the JSON body.

## Verification

Lint and typecheck both pass, but **neither checks Angular templates** —
`tsc --noEmit` does not compile them. Only `nx build client` catches a template
reading a property that no longer exists. Run the production build before
calling a UI change done; two template errors have reached a commit this way.
