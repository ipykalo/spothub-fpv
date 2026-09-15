# API end-to-end tests

Real HTTP requests, against a real Nest app, a real Postgres and a real
MinIO — no mocked repositories. `apps/api/src` covers pure parsers and
planners; this covers the wiring between them: repositories, services, the
import job, and — the one thing nothing else tests — that one owner can never
read, change or delete another's data.

## Running

```bash
npm run db:up        # postgres + minio, if not already running
npm run test:e2e
```

`test:e2e` (`scripts/run-e2e-tests.mjs`) derives a **separate database and
bucket** from your `.env` — `<POSTGRES_DB>_test` and `<S3_BUCKET>-test` — so a
run never touches your own logbook. It creates the database if needed, runs
migrations against it, creates the bucket if needed, then runs the suite.
Everything else (JWT secrets, S3 credentials, Google client id — unused here,
since sign-in is bypassed) comes from your ordinary `.env`, the same as
`npm run dev:api`.

Test files run one at a time (`--no-file-parallelism`): each boots its own
copy of the app, including a real job-queue worker polling the same Postgres
table, and interleaving that with per-test setup is not worth the risk for a
suite this size.

## How a test gets in

- `support/app.ts` boots the real `AppModule` through `@nestjs/testing`, with
  one override: `BlackboxDecoder` becomes `StubBlackboxDecoder`, which reads
  the CSVs already decoded and committed under
  `../src/flight-logs/formats/blackbox/__fixtures__/decoded/`, keyed by the
  checksum of the `.bbl` fixture they came from. No test needs the native
  decoder or Docker.
- `support/users.ts` creates a real user via `UsersFacade.upsertFromIdentity`
  (the same call a Google sign-in makes) and mints a real access token via
  `TokenService.issueForLogin` — no hand-rolled JWT signing, and no allowlist
  check to work around, since that only runs on the OAuth callback path this
  bypasses.
- `support/seed.ts` reaches into `PrismaService` directly to arrange rows an
  HTTP call would take too many steps to set up (a build, a battery pack, a
  flight already in the logbook) — production code may not do this, but a
  test harness arranging fixtures is not production code.
- Every test deletes the user(s) it created, by exact id, in `afterAll`.
  Every owned row cascades from the user, so that one delete is the whole
  cleanup.
