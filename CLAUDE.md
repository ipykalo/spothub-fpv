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

The API is one folder per bounded context, each with an `index.ts` that is its
whole public surface:

```
apps/api/src/
  app/  common/  config/  prisma/  storage/  jobs/   infrastructure
  auth/  users/                              sign-in and accounts
  builds/  build-parts/  repairs/  configs/  the hangar
  parts/                                     inventory (catalogue, units, sources)
  media/                                     build photos
  flights/                                   the logbook: flights, sessions
  flight-logs/                               log import, a reader per format
  spots/                                     flying spots on a map
  comments/                                  questions and replies on spots, builds and posts
  posts/                                     the blog: posts pilots write about their builds
  likes/                                     hearts on posts and builds
  health/
```

## Conventions — follow these, they are deliberate

**Contracts live once, in `libs/shared`, as zod schemas.** The API validates
through `ZodValidationPipe`; the client builds its forms from the same schemas'
inferred types. Never define a request shape in two places. Do not introduce
class-validator — it would reintroduce the drift this avoids.

**The domain must not import Prisma.** Services and repository contracts speak
`UserEntity` / `BuildEntity` / `RefreshTokenEntity`. Only a
`prisma-*.repository.ts`, a file under a `repositories/` folder, and
`PrismaService` may import `@prisma/client`, and `no-restricted-imports` now
enforces it rather than discipline. If you find yourself importing a Prisma
type into a service, add an entity instead.

**Repository contracts are abstract classes, not interfaces**, so they double
as Nest injection tokens:

```ts
{ provide: BuildsRepository, useClass: PrismaBuildsRepository }
```

No string tokens anywhere in this codebase.

**One bounded context per API module**, and **a folder only once a kind has two
or more files**. A module with one controller keeps `foo.controller.ts` flat at
the module root; a module with four groups them under `controllers/`. Do not
create a folder in anticipation of a second file — most modules here are small
and stay flat:

```
builds/                          parts/
  abstract/builds.repository.ts    abstract/     4 files
  build.entity.ts                  controllers/  4 files
  builds.controller.ts             entities/     3 files
  builds.mapper.ts                 mappers/      3 files
  builds.module.ts                 repositories/ 4 files
  builds.service.ts                services/     4 files
  index.ts                         parts.facade.impl.ts
  prisma-builds.repository.ts      parts.module.ts
                                   index.ts
```

`abstract/` is the one exception and is always a folder, even for a single
contract: it marks the module's contract surface — the abstract repository and
facade classes that are also the DI tokens — rather than being another pile of
implementation files.

`common/`, `config/`, `prisma/`, `storage/`, `jobs/` and `app/` are
infrastructure, not feature modules, and keep their own shape.

**Object storage and the job queue are infrastructure, not features.**
`StorageGateway` (presign, get, put) began inside `media` and moved to
`storage/` when flight logs needed the same presigned rails — a port private to
one feature could only have been shared through that feature's facade, which
would have made `media` everyone's storage service. `JobQueue` runs anything
too slow for a request: the request enqueues and answers 202, and a worker in
the API process claims rows from the `jobs` table with `FOR UPDATE SKIP
LOCKED`, retrying with backoff and reclaiming a lock left by a process that
died. A module registers its handlers in `onModuleInit`; the worker starts on
application bootstrap, so no job can run before its handler exists. No Redis:
at a handful of jobs a day a table does everything a broker would, and ships
as a migration rather than another container to run and back up.

**A module's `index.ts` is its entire public API.** Cross-module imports name
the barrel (`../../repairs`), never a file inside it. `no-restricted-imports`
in `apps/api/eslint.config.mjs` enforces this against a **closed list of
top-level folder names — add your folder to that list when you add one**, or
the boundary silently does not apply to it. The barrel is imported only from
outside the module: no file inside `parts/` may import `'../index'`, which is
what keeps NestJS decorator evaluation out of a circular load.

**No module may inject another module's repository or service.** Cross-module
needs go through a facade — an abstract class in the owning module's
`abstract/`, implemented alongside it, bound with
`{ provide: RepairsFacade, useClass: RepairsFacadeImpl }` and the only entry in
that module's `exports`. There are eight: `UsersFacade` (consumed by auth),
`PartsFacade` and `RepairsFacade` (both consumed by build-parts),
`FlightsFacade` (consumed by flight-logs), `SpotsFacade` (consumed by
comments), `BuildsFacade` (consumed by comments and posts), `LikesFacade`
(consumed by builds and posts) and `PostsFacade` (consumed by comments). A facade
answers in DTOs, not entities, so a consumer is coupled only to the contract in
`libs/shared` that both sides of the wire already share.

The graph is acyclic by construction — `auth → users`, `build-parts → parts`,
`build-parts → repairs`, everything → `common`/`config`/`prisma` — so there is
no `forwardRef()` in this codebase and there should never be one. If you find
yourself reaching for one, the edge is pointing the wrong way. `build_parts`
owns the `repairId` column, which is why linking an install to a repair is a
build-parts write that _asks_ repairs whether the repair is real, rather than a
repairs write into somebody else's table.

**That rule is about TypeScript and DI, not about SQL.** `where: { buildId,
build: { ownerId } }` and `_count.installs` are joins inside a module's own
repository and they stay. Routing them through a facade would cost a round trip
and — worse — move the owner predicate out of the `updateMany`, which is
precisely the cross-tenant write the ownership convention makes inexpressible.

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

**One bounded context per client feature, mirroring the API split.** The
hangar used to be one `features/builds/` folder holding five contexts —
builds, build-parts, repairs, configs and photos — each already with its own
`*.api.ts` / `*.store.ts` pair that never called another's. That was a
discoverability problem, not a coupling bug: nothing enforced the split, so it
took reading file prefixes to tell "everything about repairs" apart from
"everything about builds". Split into five feature folders:

```
features/
  builds/       builds.api/store, build-status, containers (list, form, detail), build-card + build-form presenters
  build-parts/  build-parts.api/store, install-part-form + installed-parts-list presenters
  repairs/      repairs.api/store, repair-cause, repair-form + repair-timeline presenters
  configs/      configs.api/store, config-diff, config-compare.page container, config-list/-diff-view/-paste-form presenters
  photos/       photos.api/store, photo-gallery presenter
  parts/        catalogue, units, sources
  flights/      flights.api/store, flights.page container + flight-grid, session-flights/flight-bulk-bar/flight-trends presenters
  flight-logs/  flight-logs.api/store (the upload state machine), log-import-panel presenter
  spots/        spots.api/store, spot-style, containers (list + map, form, detail), spot-map/-card/-details/-form presenters
  comments/     comments.api/store, comments-section container, comment-form + questions presenters (dropped into the spot, build and post pages)
  posts/        posts.api/store/resolvers, containers (blog, post, my posts, form), post-card + post-form presenters
  likes/        likes.api, like-button container (dropped into the post and public build pages)
```

`build-detail.page.ts` stays in `builds/containers/` and imports the other
four as a composition root — the same relationship the API's `build-parts`
module has with `PartsFacade` / `RepairsFacade`. Nothing else changes: routes,
API calls and behaviour are identical, and no facade or DI boundary is needed
here, because a client store never reaches into another's HTTP calls the way
an API repository could reach into another module's table.

**The selector prefix is `sh-`**, set in `apps/client/eslint.config.mjs` and
the `prefix` field of `apps/client/project.json`. The root component is
`sh-root`.

## Shared UI components

**Reusable pieces live in `apps/client/src/app/core/components/`, and a
feature reaches for them before writing its own.** They are presenters: inputs
in, outputs out, no store.

- **`sh-section`** — every titled region of a page. Collapsible from its
  heading (`aria-expanded`), remembers the fold per viewer when given a
  `storageKey`, shows a count badge, and projects header actions through
  `[shSectionActions]`. Its body is hidden rather than destroyed, so a
  half-typed form survives being folded.
- **Forms are asked for, never shown by default.** A section with `addLabel`
  gets an Add button bound to `[(adding)]`; the container renders the form only
  while that is true, and closes it after a successful save (the fit-a-part
  form stays open, because fitting several parts in a sitting is normal).
- **`sh-autocomplete`** — the app's only dropdown. There is no `mat-select`
  left, and a new one should not appear. Works with `formControlName`,
  `ngModel` or plain `[value]`/`(valueChange)`; `emptyLabel` offers a null
  choice, `compact` gives a 40px field for a list row. It registers itself as
  its control's value accessor through `NgControl`, the way `MatSelect` does —
  not through an `NG_VALUE_ACCESSOR` provider, which would need `forwardRef`.
- **`ChoiceOption<T>` + `choicesFrom()`** — `{ value, label, icon?, hint? }`,
  built once from an enum and its label map and handed to either the
  autocomplete or the chips.
- **`sh-filter-chips`** — a single-choice chip row with "All" first; `null`
  means no filter.
- **`sh-grid-toolbar` + `gridView()`** — search, a projected filter slot, sort
  buttons (a second click reverses), and an "N of M" count. A grid declares a
  `GridSpec` (what the search box matches, how each key sorts) beside its
  component and keeps a `GridState` — view state, so a presenter may own one.
  Empty values sort last in both directions. Every list that can grow gets
  one: components, history, repairs, captures, parts, builds.

## Styling

**Layout and our own elements are Tailwind utilities in the template; a
component's `.scss` holds only what a utility cannot do.** Tailwind v4 runs
through `@tailwindcss/postcss` (`apps/client/.postcssrc.json`), set up in
`apps/client/src/styles/tailwind.css`. The look follows Betaflight: amber
(`#ffbb00`) headings and actions on neutral grey, Open Sans self-hosted from
`@fontsource-variable/open-sans`, light and dark themes toggled in the toolbar
by `ThemeStore` (`core/theme/`).

The rules that keep Tailwind and Angular Material from fighting:

- **No preflight.** `tailwind.css` imports only `theme` and `utilities`;
  preflight would reset Material's own elements.
- **Cascade layers decide who wins, not specificity.** `styles.scss` declares
  `@layer theme, base, components, utilities;` first. Element defaults (`h1`,
  `h2`, `a`, `body`) sit in `@layer base`, so a utility beats them. Material's
  styles are unlayered, so they beat every utility — which means **an override
  of a Material component's internals cannot be a utility.** It stays in the
  component's `.scss` (the card's severity stripe, the compact form
  field, the icon buttons laid over a photo).
- **Colours are Material's tokens, aliased.** `bg-surface`, `text-muted`,
  `text-primary`, `border-outline-variant` and the rest are `@theme inline`
  aliases for `--mat-sys-*`, so a utility and a Material component can never
  disagree, and both flip with `color-scheme`. That is why nothing needs a
  `dark:` variant — reach for one only for something Material has no token
  for.
- **Status colours are tones**: `tone-go|stop|work|ready|idle` set `--tone` and
  `--tone-surface`, read by `text-(--tone)`, `bg-(--tone-surface)`,
  `border-l-(--tone)`. They are safelisted in `tailwind.css` because templates
  build the class at runtime (`tone-{{ style.tone }}`).
- **Icon sizes are `icon-xs|sm|md`**, global and unlayered in `styles.scss`,
  because MatIcon injects its own 24px rule at runtime. A `size-*` utility on
  a `mat-icon` silently loses. Icons inside Material buttons keep Material's
  size.
- **A utility that sets `display` loses on a Material host element** (`hidden`
  on a `mat-icon`, for one). Put it on a wrapper.
- **The Material palette is generated, never hand-edited.** Regenerate
  `styles/_theme-colors.scss` with the command in the comment above
  `mat.theme()` in `styles.scss`. The neutral seeds must stay grey: left to
  derive from the amber, every surface and field turns tan. Pass the
  directory **with a trailing slash** — without it the schematic writes
  `src/styles_theme-colors.scss` beside the folder.
- **Old class names can collide with utilities.** `block`, `grid`, `hidden`,
  `row`-style names that were once component classes now mean something
  globally; do not reintroduce one as a private class name.

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
  3000 too and nothing bound 4200 — and on Windows the second bind _succeeds_
  (`::1:3000` alongside the API's `:::3000`), so there is no `EADDRINUSE` and
  no error, just a proxy returning 502. Hence
  `NX_LOAD_DOT_ENV_FILES=false` on the dev scripts. Nothing is lost:
  `@nestjs/config` and the Prisma CLI both read `.env` themselves. Setting
  `port` in the serve target does not help — the env var wins.
- **On Windows, run the tests from PowerShell or cmd, not Git Bash.** Git Bash
  starts child processes in `d:\…` with a lowercase drive letter while
  `node_modules` resolves under `D:\…`, so Vitest loads its runner twice and
  every suite dies with "Cannot read properties of undefined (reading
  'config')" before a single test runs. Nothing is wrong with the tests; CI on
  Linux is unaffected.
- **Lint must go through Nx.** ESLint flat config does not cascade, so
  `eslint apps libs` applies only the root config and silently skips every
  Angular and template rule. Use `nx run-many -t lint`, which is what
  `npm run lint` and CI now do.
- **`apps/api/eslint.config.mjs` globs are relative to `apps/api/`**, not the
  workspace root — Nx runs `eslint .` with `cwd: apps/api`, so that is ESLint's
  basePath. A block written as `files: ['apps/api/src/**']` matches nothing.
  This already bit us once: the root config's `apps/api/**/*.ts` block was dead
  for as long as it existed, and went unnoticed only because
  `consistent-type-imports` ignores decorated constructor parameters under
  `emitDecoratorMetadata`. Check with
  `cd apps/api && npx eslint --print-config <file>` before trusting a new
  path-scoped rule.

## Commands

```bash
npm run dev            # api :3000 + client :4200 (public pages server-rendered)
npx nx run client:serve-ssr   # the built client server on :4000
npm run db:up          # postgres + minio
npm run db:migrate     # create/apply a migration
npm run db:studio      # stand-in admin UI
npm run db:seed        # demo inventory, one real part per category
npm run db:seed:undo   # remove it again
npm run lint           # type-aware, zero warnings tolerated
npm run typecheck
npm test               # API unit tests (Vitest) — from PowerShell on Windows
npm run test:e2e       # API end-to-end, needs db:up first
npm run build
```

`prisma/seed.ts` is a **script, not a migration**. Migrations run at container
startup on every deploy, so demo data in `prisma/migrations` would land in
production. The seed is additive, idempotent and reversible, and it will not
delete a part whose units are fitted to a build.

Lint uses `strictTypeChecked` + `stylisticTypeChecked`. If a rule fires, fix
the code rather than disabling the rule; the few existing inline disables each
carry a comment explaining why.

**`npm test` is unit tests; `npm run test:e2e` is a separate suite.** The
former (`apps/api/src/**/*.spec.ts`) covers pure parsers and planners with no
I/O. The latter (`apps/api/e2e/`) boots the real `AppModule` through
`@nestjs/testing` and drives it with real HTTP requests, against a real
Postgres and MinIO — no mocked repositories, because repositories, services,
the import job and cross-tenant ownership had no coverage at all until this
suite. `scripts/run-e2e-tests.mjs` derives a separate database and bucket
(`<name>_test`, `<bucket>-test`) from `.env` so a run never touches your own
logbook, and CI gives it its own Postgres and MinIO service containers. The
one production seam it swaps is `BlackboxDecoder`, for a stub that reads
already-decoded fixtures, so no test needs the native decoder or Docker. Full
rationale and how a test is put together: `apps/api/e2e/README.md`.

## State

**Done:** workspace, docker-compose (Postgres + MinIO), Google OAuth with
rotating refresh tokens and reuse detection, ESLint + Prettier, CI that
verifies and publishes images to GHCR. **Every V1 feature:**

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
- Build photos — presigned PUT straight to storage, EXIF stripped and a
  thumbnail made on commit, carousel with a full-size viewer, cover image

**V3, first slice — flight log import (EdgeTX CSV).** Drop the radio's whole
LOGS folder: the client hashes every file, asks which checksums the server
already has, and uploads only the new ones, each straight to storage on a
presigned PUT. `POST /flight-logs/imports` answers 202 and the
`flight-log.import` job parses in the background; the client polls. A file that
is not a readable log fails on its own; anything unexpected fails the attempt
so the job retries, and a retry skips what was already parsed.

- `edgetx-csv.parser.ts` is pure and tested. Columns are matched by name
  without their unit, so every sensor is optional except the clock. A pause of
  more than 30 s splits a file into flights; when Betaflight's flight mode is
  logged, only armed rows count (`ACRO*` means disarmed), so bench time is not
  flight time.
- **A quad that sends no telemetry still gives a useful flight.** The receiver
  logs its own link statistics (RQly, 1RSS/2RSS, RSNR, TQly, TPWR) and the
  radio logs its sticks, channels and battery, so those need nothing from the
  flight controller. Without a flight mode, the arm switch on CH5 times the
  flight — ExpressLRS requires arming on AUX1 — but only if it moved during
  the log. Three things the first real log (an Air65 with telemetry off)
  turned up: EdgeTX **quotes text cells** (`""`, `"ACRO*"`), which hid the
  disarmed star; current and capacity **read 0, not blank**, when nothing
  sends them, so a flight-long zero is stored as null; and the date was
  **2000-01-01** — a radio whose clock is unset. The flights page flags any
  session before 2015 as "radio clock not set".
- **EdgeTX writes its header once, but a row's columns change** when a sensor
  comes online or its link goes stale mid-log — the flight controller's
  telemetry arriving a few seconds late inserts columns into every later row,
  and the header is never rewritten. A fixed header index then reads the wrong
  cell (current came through as link quality: "LQ −1006%"). Link stats, sticks
  and channels are read counting back from each row's own end; the columns
  before them are trusted only on a row whose layout still matches the header.
- **Times are the radio's wall clock stored as UTC** — the radio records no
  zone. Render them with `timeZone: 'UTC'` or every flight shifts.
- Sessions group flights less than 90 minutes apart and keep their ids across
  re-imports: `session-planner.ts` (pure, tested) reuses a group's existing
  session, merges ones a new flight bridges, and splits one a deletion gaps.
- Without a chosen build, a flight goes to the build named like the radio
  model, case-insensitively — most radios name the model after the quad.
- **A flight's battery pack is set by hand** — a log never says which pack was
  plugged in. It is a unit of a `BATTERY` part (`flights.battery_unit_id`, SET
  NULL), set on one flight or on many at once through `PATCH /flights`, which
  changes every named flight or none of them. A battery part's page lists each
  pack's cycles, airtime, average sag and lowest voltage, and charts its
  flights one pack at a time, which is where a pack's wear shows. A cycle is a
  flight — counted from the flights, never stored, as `fitted` is for units.
- **A log counts as imported while a flight from it is still in the
  logbook** (or if it never held one). Delete every flight a log gave and the
  next drop imports it again; delete only some and the rest keep it imported,
  so a flight deleted as "not really a flight" stays deleted. The first cut
  keyed this on `status = PARSED` alone, and a log whose flights had all been
  deleted could never be brought back.
- Real SD-card logs go in `apps/api/src/flight-logs/formats/edgetx/__fixtures__/`;
  the spec parses every one. `npm test` runs the API suite.

**Betaflight blackbox logs** come in on the same pipeline, and carry what a
quad with telemetry off never sends the radio: pack voltage and current.

- **Decoded by Betaflight's own `blackbox_decode`** (GPL-3.0, run as a separate
  program, never linked). The API image builds it from source at a pinned
  commit; where it is not installed, `BLACKBOX_DECODE_DOCKER_IMAGE` runs it
  through Docker — build that image with `npm run decoder:build`, since Windows
  has no C compiler. The npm `blackbox-log` parser refuses Betaflight 4.5 logs
  outright. `blackbox-csv.parser.ts` is pure and tested on decoded CSV from
  real logs (`flight-logs/formats/blackbox/__fixtures__/`).
- **One `.bbl` is one power-on, with a log per arm.** Logs less than 30 s apart
  join into one flight, as EdgeTX rows do, so a crash and a re-arm do not split
  a pack's flying. Charge is counted from current over time: the decoder's
  `energyCumulative` carried on across logs and read double within one.
- **A blackbox records no date.** A flight controller's clock is almost never
  set (`0000-01-01`), so the import asks which day the logs were flown. Files
  land on that day in `btfl_NNN` order, ten minutes apart, stored with
  `time_recorded = false`: those times only order the day, and the logbook
  says "time not recorded" instead of showing them.
- A flight controller's USB drive also offers `btfl_all.bbl`, the whole flash
  repeating every log, and a `padding.txt` of zeros. Both are skipped.
- Builds match a craft name or radio model ignoring case and spaces, so the
  flight controller's "Cinelog  20" finds the build Cinelog20.

**Import and the logbook are two modules.** `flight-logs` owns uploads, the
import job and the log formats; `flights` owns flights and sessions, and
`flight-logs` reaches it only through `FlightsFacade` — sessions regroup on
every flight write, and only `flights` knows how. They were one module until
the second format arrived, with the import job injecting the flights
repository and branching on format.

- **Each format is a `LogReader`** under `flight-logs/formats/<format>/`: its
  content type, its storage extension, and how its bytes become flights, with
  the pure parser and its fixtures beside it. `LogReaders` holds them as a
  `Record<LogFormat, LogReader>`, so a format added to the shared enum without
  a reader fails to compile, and neither the upload nor the job branches on
  format.
- The parsers import `FlightFigures` from `flights` as a type only, which the
  compiler erases. Keep them that way: **Vitest cannot resolve
  `@spothub/shared`**, so a pure file under test must not import it — which is
  why `SESSION_GAP_MS` sits in `flights.constants.ts`, not in
  `session-planner.ts`.
- The client splits the same way. `FlightLogsStore` never reloads the
  logbook; `flights.page` composes both stores and reloads `FlightsStore` once
  an import is over.

**GPX tracks** from a phone, goggles or GPS logger complete the formats. A GPX
file has positions, heights and true UTC times, and nothing else, so it adds
a track to a flight rather than being one.

- **A track joins the radio-log flight it lines up with.** `track-matcher.ts`
  (pure, tested) tries the track's times as recorded, then shifted by whole
  quarter hours, nearest first: a radio's clock is usually local time, and
  every real zone offset is a quarter-hour multiple. A flight is chosen only
  when exactly one flight's take-off and landing are both within 30 s at the
  first shift where any is; blackbox flights never match, their times being
  invented. A flight that already has GPS from its radio log keeps it; one
  without takes the track's figures. A track that lines up with nothing is
  stored as a GPS-only flight.
- **A joined track is linked, not stored.** `flights.track_log_file_id` (SET
  NULL) points at the GPX file, and "still imported" counts those links as it
  counts flights — without that, a GPX that only joined a flight would look
  new on every folder drop.
- GPX has no speed, so speed is measured from positions over windows of at
  least a second. `formats/gps-track.ts` sums distance, height, speed and
  home distance for both GPX and EdgeTX, which passes its GPS module's own
  speed readings instead.
- **EdgeTX logs speed in the unit its sensor sends** — `GSpd(km/h)` from
  ExpressLRS, `GSpd(kts)` from FrSky — and the parser converts from the unit
  in the heading. It once read knots as km/h and halved every top speed.
- The GPS fixtures are synthetic (a supplied EdgeTX log with GPS, and a GPX
  generated from it two hours earlier, as UTC); see their `README.md`s.

The API was restructured into one module per bounded context — `builds` used to
hold four, and `parts` held its catalogue, units, sources and URL preview in one
controller and one 301-line repository. Cross-module access now goes through
facades, enforced by lint. One route moved with it: linking an install to a
repair was `PATCH /builds/:buildId/repairs/installs/:installId` and is now
`PATCH /builds/:buildId/parts/:installId`, because the `repairId` column belongs
to the install. `RepairsFacade.existsForBuild` also closed a hole on the install
path, which accepted a `repairId` from another build without checking it.

Eight migrations applied. Two are hand-written because Prisma cannot express
them: `part_status_condition_only` (a `CASE` conversion between enum types) and
`part_units` (a `generate_series` expansion where only _open_ installs get a
distinct unit). Read those before changing the parts model.

CI builds both images on every run — pull requests included — and pushes to
GHCR on a branch, tagged with the branch name, the commit sha, and `latest` on
the default branch. Building them for the first time turned up three faults
worth remembering:

- There was no `.dockerignore`, so `COPY . .` dropped the host's `node_modules`
  over the one `npm ci` had just installed inside the image.
- The runtime stage installs with `--ignore-scripts`, which leaves
  `@prisma/engines` empty, so `prisma migrate deploy` tried to download the
  schema engine on boot — needing network at container start and write access
  the unprivileged `app` user does not have. The engines are copied from the
  build stage instead, where `prisma generate` has already fetched them.
- CI ran on pull requests but never on a push to `dev`, and a pull-request run
  deliberately builds without publishing — so no image would ever have been
  pushed for the branch the work actually lands on.

The GHCR packages are **private** by default, so the first deploy needs a pull
secret unless they are made public.

**Spots** are places to fly, kept apart from flights on purpose: a spot is
something you plan around and describe, not something a log proves. A spot has
its own page and a Leaflet map (`/spots`), where clicking an empty place offers
"Add a spot here", and the form's pin and its coordinate fields move each other.

- **Coordinates are `Decimal(9, 6)`** — about 11 cm — and the contract rounds
  to six places, so what the form shows is what is stored. The repository hands
  them out as numbers.
- **Leaflet is touched in one presenter, `spot-map`.** Pins are `divIcon`s
  holding a Material Icons glyph: Leaflet's default marker images are URLs a
  bundler rewrites into paths that do not exist. **`leaflet.css` is `@use`d
  from `styles.scss`.** Without it the panes lose their absolute positioning,
  and tiles land scattered with dark gaps and no zoom buttons. It is not in
  `project.json`'s styles list, because a running dev server reads that list
  only at start-up and kept serving maps without it; from the map component it
  blew the 8 kB per-component style budget. `invalidateSize` runs a frame
  after the ResizeObserver fires; calling it inside the callback is a layout
  loop.
- **"Add location" is the at-the-field action.** One tap asks the browser's
  Geolocation API for a fresh fix (`DeviceLocation`, the one place `navigator`
  is asked), `POST /spots/drafts` saves it as a private draft named "Unnamed
  location", and the edit form opens on it. Saving that form sends
  `isDraft: false`, which is also the one time a slug is rewritten — the
  placeholder's `unnamed-location-3` was never an address worth keeping. The
  contract accepts only `false` there: a spot never goes back to being a
  draft. **Anything that lists spots publicly must filter out drafts.**
  Geolocation needs a secure context — HTTPS, or localhost in development.
- **A spot's visibility is who can open it.** Private is the owner alone;
  Unlisted is anyone signed in who has the link; Public is also listed at
  `GET /spots/shared` (other owners' spots only). A draft is never shared,
  whatever its visibility says. Reads of someone else's spot go through
  `findVisibleForViewer` / `findSharedForViewer`, which name the rule they
  apply; every write stays owner-scoped through `updateMany` / `deleteMany`,
  so sharing opened reading and nothing else. The DTO carries
  `ownedByViewer` — the same spot answers differently to its owner — and the
  owner's display name, joined inside the spots repository, never their
  email. The client keeps the two lists apart in `SpotsStore` and hides
  Edit and Delete wherever `ownedByViewer` is false; `?scope=shared` on
  `/spots` is the shared list.
- **Comments are their own module, `comments`, reaching spots through
  `SpotsFacade.ownerIfVisible` and builds through `BuildsFacade.ownerIfVisible`.**
  One `comments` table serves both: each row has a `spot_id` or a `build_id`
  — exactly one, by a CHECK constraint Prisma cannot express, so it lives in
  the migration — and cascades with its subject. `comment_reads` is shaped
  the same way. The routes are the same six under `spots/:id/comments` and
  `builds/:id/comments`, plus `GET /comments/unread`, which counts spots and
  builds apart for the Spots and Hangar badges. Anyone who can open a spot can ask
  a question, and anyone who can open it can reply; replies go one level
  deep. The question's asker or the spot's owner marks at most one reply per
  question as the answer — never a reply the asker wrote, since a follow-up
  or a thank-you cannot answer their own question (`canMarkAnswer`). Authors reword their own words; a
  comment's author or the spot's owner deletes it. The owner's delete takes a
  question's replies with it (FK cascade); an asker deleting their own
  question that others replied to only clears it — empty body, `deleted_at`
  set, shown as "Question deleted" with no author — so the replies stay. That
  placeholder takes no replies or edits, stops counting as unread, and goes
  for good with its last reply or when the owner deletes it. Those rules are not checks before a write —
  they are the writes' own `where` clauses (`updateBodyForAuthor`,
  `deleteForViewer`'s `OR [author, spot.owner]`, `setAnswerForAskerOrOwner`), so
  a stranger's edit cannot be expressed. A spot someone cannot open answers
  404 for its comments too, never 403. Every change returns the whole
  conversation, with per-viewer flags (`byViewer`, `canDelete`,
  `viewerOwnsSubject`) the client renders rather than re-derives. Unread is
  per owner: `comment_reads` records when the owner last opened a spot or a
  build, and one grouped query counts others' comments since, for the Spots
  and Hangar badges and each card's "N new". The client's
  `sh-comments-section` container carries the whole section, so the spot and
  build pages each drop it in rather than holding the handlers themselves.
- **Every spot map carries its own controls**, in one column: full screen,
  zoom, show my location. They are view state, so they live in `spot-map`
  rather than in each container. Full screen uses the Fullscreen API on the
  map's host and falls back to the host covering the page (`map-covers-page`,
  Escape to leave) where the API is missing, as on iPhone Safari. "Show my
  location" takes one fresh fix through `DeviceLocation`, draws the blue dot
  and its accuracy circle, and forgets it — nothing is saved or handed up. The
  buttons sit in a Leaflet bar that stops click propagation, so pressing one
  never also picks a point.
- **Navigating to a spot is a plain link** to
  `google.com/maps/dir/?api=1&destination=lat,lng` (`googleDirectionsUrl`),
  which opens directions from the phone's position in the Maps app. No API
  key, and nothing is sent until someone taps it.
- **A spot's flight video is a YouTube link, not an upload** — no storage and
  no transcoding. `libs/shared/src/lib/youtube.ts` parses any YouTube link
  (watch, youtu.be, shorts, live, embed, with `t=` or `start=`) into an
  11-character id and a start time, and those two columns are all that is
  stored: never the pasted URL, and one video per spot by construction. The
  spot page loads nothing from Google until play is pressed, then embeds the
  youtube-nocookie player; `bypassSecurityTrustResourceUrl` is only ever given
  a URL built from an id re-checked against YouTube's alphabet. Uploaded,
  transcoded clips are a possible later extension.
- **A spot's cover is its video's thumbnail, stored, not linked.** Pointing a
  card at `i.ytimg.com` would tell Google who browsed which spots. Instead,
  setting a video queues `spot.cover`: the job asks the `YouTubeThumbnails`
  port for the largest thumbnail (`maxresdefault`, else `hqdefault`), crops it
  to a 640×360 WebP with sharp, puts it at
  `<owner>/spots/<spot>/cover-<videoId>.webp`, and records the key only while
  the spot still has that video (`setCoverForOwner` is scoped by it), deleting
  what it made otherwise. A new video, no video, or a deleted spot deletes the
  old image by its exact key; the same video with a new start time keeps it.
  The DTO carries a presigned `coverUrl`, never the key. The e2e suite swaps
  the port for `StubYouTubeThumbnails`, which generates a 4:3 image so the
  crop is tested too.
- Tiles come from OpenStreetMap, and nothing else sends a spot's coordinates
  anywhere. Weather was deliberately deferred for that reason.
- **zod 4 applies `.default()` inside `.partial()`.** An update schema built as
  `fields.partial()` over fields with defaults resets every field a PATCH does
  not name. It was live in builds, parts, part units, part sources and repairs
  from the start: renaming a build reset its status to PLANNING, a note on a
  part wiped its spec, relabelling a unit marked it serviceable again. **Every
  `*Fields` object in `libs/shared` carries no defaults; the create schema
  adds them with `.extend()`.** `apps/api/e2e/partial-updates.e2e.spec.ts`
  holds each entity to it — add a case there for any new update schema.

**Shared builds** follow the spots rule for who can open one — Private is the
owner alone, Unlisted anyone signed in with the link, Public also listed at
`GET /builds/shared` — but a build page reads from four modules, so the rule
is applied in each. `media` sits beneath `builds` (a card's cover), so no
builds facade can be asked; instead `build-parts`, `repairs` and `media` each
ask their own repository `findBuildOwnerVisibleToViewer` /
`findSubjectOwnerVisibleToViewer` — a join on `builds` — and then run their
existing owner-scoped read against that owner. What a shared reader never
gets: purchase prices, sources, part and unit notes, other units, the cost
rollup, repair cost and currency, a photo's original file name, firmware
captures, flights and packs. The redaction is in the service, next to the
read (`withoutOwnersDetails`); every write stays owner-scoped and untouched.
The client hides every owner section and control where `ownedByViewer` is
false, and does not even request configs, the inventory or the logbook;
`?scope=shared` on `/hangar` is the shared list.

**Public pages and the blog** open shared builds and posts to anyone, signed
in or not, and render them on the server.

- **A read a visitor may make is `@Public()` and takes `@CurrentViewer()`**
  — the signed-in user, or null. On a public route the global guard still
  checks a bearer token when one is sent, so an owner is recognised there
  too; a missing or bad token just leaves the request a visitor. The public
  reads are the Public builds list (`GET /builds/public`), one build, its
  parts, repairs, photos and questions, and the published posts and one post.
  Every repository read that takes a viewer accepts null and then lets
  through only what is shared; the owner-only redaction is unchanged, so a
  visitor sees exactly what a signed-in stranger does. Spots stay behind
  sign-in, as do every write and the cost rollup
  (`apps/api/e2e/public-builds.e2e.spec.ts`).
- **Posts are their own module**, `posts`: Markdown by any signed-in pilot,
  with the build visibility rule (Private is a draft, Unlisted opens by link,
  Public is also listed) and `published_at` stamped the first time a post
  leaves Private, then kept. `post_builds` links a post to builds; linking
  asks `BuildsFacade.idsOwnedBy`, so only the author's own builds, and
  reading asks `BuildsFacade.visibleToViewer`, so a build its owner makes
  private drops out of the post for everyone else. The raw link list goes to
  the author only. A summary carries those visible builds as tags (asked for
  once for the whole list), its cover thumbnail and a reading time, which is
  what the blog feed's full-width `sh-post-card` rows show.
- **Likes are one heart per pilot**, on posts and builds, in their own
  dependency-free `likes` module. One `likes` table holds both: a `post_id` or
  a `build_id`, exactly one by a CHECK constraint in the migration, unique per
  user and subject, cascading with either. Anyone who can open the subject
  sees the count (`GET …/likes` is public); liking is `PUT` and taking it back
  is `DELETE`, both idempotent and both answering the new count. Whether a
  subject may be liked is a join on `posts` / `builds` inside the likes
  repository — a draft or a private build answers 404. Builds and posts carry
  `likes` (`count`, `likedByViewer`) on every DTO, batched for a whole list
  through `LikesFacade`. The client's `sh-like-button` starts from that count
  (so the server's HTML and the browser agree), updates at once and settles on
  the API's answer, and sends a visitor to sign in
  (`apps/api/e2e/likes.e2e.spec.ts`).
- **A post carries a discussion, which is the same `comments` module.** `POST`
  joins `SPOT` and `BUILD` as a comment subject: a third nullable column on
  `comments` and `comment_reads`, with the CHECK widened to
  `num_nonnulls(spot_id, build_id, post_id) = 1`, and the same routes under
  `posts/:postId/comments`. `comments` asks the new `PostsFacade.authorIfVisible`
  who may open a post and who wrote it, so a draft answers 404 to everyone but
  its author. What differs is only the words and one rule: a post has
  "Comments", not "Questions", its author may join in rather than only answer,
  and no reply is marked as the answer — `canMarkAnswer` is false throughout
  and there is no answer route. A summary carries `commentCount`, counted as a
  join inside the posts repository rather than through a facade, which the feed
  rows show beside the likes (`apps/api/e2e/post-comments.e2e.spec.ts`).
- **Markdown is rendered by `sh-markdown`** (`marked`): raw HTML in the
  source is escaped, an image at any outside address becomes a link (loading
  it would tell its host who read the page), and the result still goes
  through Angular's `[innerHTML]` sanitizer.
- **A post's images are uploads, not addresses.** They go through the same
  presigned pipeline as build photos — `media` has a `post` subject beside
  `build`, with routes under `posts/:postId/images` — and the body refers to
  one as `![caption](image:<asset id>)`, which `sh-markdown` resolves against
  the post's `images`. `posts.cover_asset_id` is the cover. Saving a body
  deletes the images it no longer shows (the cover excepted) and deleting a
  post deletes them all, through `MediaFacade`, so storage never keeps an
  image nobody can reach (`apps/api/e2e/post-images.e2e.spec.ts`).
- **The editor is our own toolbar over a textarea**, not an editor library:
  images needed our pipeline either way, and posts stay Markdown.
  `core/components/markdown-editor` holds the text transforms
  (`markdown-edits.ts`, no DOM) and `sh-markdown-toolbar`, which writes
  through `execCommand('insertText')` so Ctrl+Z undoes a button. An image is
  a placeholder line until it uploads; the first image on a never-saved post
  saves it as a draft and swaps the address to its edit page with
  `Location.replaceState`, so nothing typed is lost. The toolbar is `sticky`,
  so nothing around it may clip overflow; and the body textarea has no padding
  of its own, because `cdkTextareaAutosize` sizes it to its content and
  padding inside that height scrolls. A loaded post calls
  `resizeToFitContent` itself — the autosize only measures on input. Tables
  are GFM; `sh-markdown` wraps each in a sideways-scrolling
  `.sh-markdown-table`.
- **Only `builds` and `blog` render on the server** (`app.routes.server.ts`);
  everything behind sign-in stays browser-rendered, since the server holds no
  session and the map touches browser APIs as it loads. `apps/client` builds
  to a Node server (`src/server.ts`) instead of static files, and its image
  runs that rather than nginx. It needs `API_INTERNAL_ORIGIN` (how it reaches
  the API without leaving the network) and `NG_ALLOWED_HOSTS` (the site's
  domain — Angular answers any other Host header with 400).
- **A server-rendered page renders from data resolved before it exists.** The
  browser's first render must match the server's HTML, and anything fetched
  after a component is created lands too late for that. So the public pages
  load through route resolvers and hand the result to the read-only
  presenters, with no store; `sh-comments-section` takes the resolved
  conversation as `initial`. In the browser the resolvers get the server's
  responses back from the transfer cache and fetch nothing.
- **The server's API rewrite is a root interceptor**, registered in
  `app.config.server.ts` through `ɵHTTP_ROOT_INTERCEPTOR_FNS`.
  `withInterceptors` ones run before the transfer cache keys a request, and a
  rewritten URL there made the browser fetch every response a second time.
  `API_BASE_URL` stays `/api` on both sides so the keys match.
- **A public page asks again once it knows the reader is signed in.**
  `App` restores the session after the first render, on public pages only
  (on the OAuth callback a failed refresh would race the handed-over token),
  and shows a guest header until then. The build and post pages then re-read
  as that user: the owner gets their controls, and their own private build
  or draft opens.

**Next, in order:** VPS + Caddy first deploy, then database backups with a
tested restore. V1 is feature-complete; what is left is getting it off the
laptop.

**The media pipeline never lets file bytes reach the API.** The client asks for
a presigned PUT, uploads straight to object storage, then calls commit — which
is the only point the API reads the object. The config file-load feature keeps
to the same rule: the file is read in the browser and its text posted in the
JSON body.

EXIF stripping happens on commit, server-side, because a client can claim to
have done it and a photo taken at a home field is a home address. `sharp`
re-encodes rather than copying, which is what drops the metadata; `rotate()`
runs first so the orientation tag is applied before it is discarded.

The `assets` table is polymorphic on `subject_type`, so parts and repairs get
photos later with a row rather than a table. `build` and `post` exist today;
a subject added to `AssetSubject` without its ownership and visibility
lookups in `prisma-assets.repository.ts` fails to compile.

**Storage CORS is per-environment.** MinIO allows the browser preflight for a
presigned PUT out of the box; R2 and Blob do not and need explicit
configuration for `PUT` from the app's origin. Nothing in the code changes —
which is the point of `StorageGateway` — but the first deploy has to set it.

## Verification

Lint and typecheck both pass, but **neither checks Angular templates** —
`tsc --noEmit` does not compile them. Only `nx build client` catches a template
reading a property that no longer exists. Run the production build before
calling a UI change done; two template errors have reached a commit this way.
