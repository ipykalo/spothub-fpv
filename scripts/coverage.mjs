#!/usr/bin/env node
/**
 * Coverage for the whole repository, in one number per area.
 *
 * Three suites measure the same files from the same root — the API's unit
 * tests, its e2e suite, and the client's logic tests — so their reports add
 * together file by file. Anything only the e2e suite reaches still counts as
 * covered, which is the point: the API is proven by driving the real app, not
 * by mocking its repositories.
 *
 * Each area is then held to the floor in `coverage.thresholds.json`. The
 * floors ratchet: they start at what the area measures today and are raised as
 * tests land, so coverage can never quietly slide, and no work is blocked
 * waiting for a number nobody has written the tests for yet.
 *
 *   npm run coverage              every suite, then the floors
 *   npm run coverage -- --skip-e2e    without a database or a bucket
 *   npm run coverage -- --update      write what it measured back as the floors
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const THRESHOLDS = join(ROOT, 'coverage.thresholds.json');

const args = process.argv.slice(2);
const skipE2e = args.includes('--skip-e2e');
const update = args.includes('--update');

/**
 * Where each area's report lands. The e2e run goes through its own script,
 * which prepares a separate database and bucket first.
 */
const SUITES = [
  {
    name: 'API unit',
    report: 'coverage/api-unit',
    command: [
      'npx',
      'vitest',
      'run',
      '--config',
      'apps/api/vitest.config.ts',
      '--coverage.enabled',
    ],
  },
  {
    name: 'API e2e',
    report: 'coverage/api-e2e',
    skip: skipE2e,
    command: ['node', 'scripts/run-e2e-tests.mjs', '--coverage.enabled'],
  },
  {
    name: 'Client logic',
    report: 'coverage/client',
    command: [
      'npx',
      'vitest',
      'run',
      '--config',
      'apps/client/vitest.config.ts',
      '--coverage.enabled',
    ],
  },
];

/**
 * What each area is, in the order they are reported.
 *
 * A client file with a template beside it is a component: its logic is the
 * template, which the production build type-checks and which a unit test would
 * mostly be re-describing. Those are counted and shown, never gated — hence
 * `gated: false`.
 */
const AREAS = [
  {
    name: 'libs/shared',
    gated: true,
    holds: (path) => path.startsWith('libs/shared/'),
  },
  {
    name: 'apps/api/src',
    gated: true,
    holds: (path) => path.startsWith('apps/api/src/'),
  },
  {
    name: 'apps/client (logic)',
    gated: true,
    holds: (path) => path.startsWith('apps/client/') && !hasTemplate(path),
  },
  {
    name: 'apps/client (components)',
    gated: false,
    holds: (path) => path.startsWith('apps/client/') && hasTemplate(path),
  },
];

function hasTemplate(path) {
  return existsSync(join(ROOT, path.replace(/\.ts$/, '.html')));
}

function run({ name, command, skip }) {
  if (skip) {
    process.stdout.write(`\n— ${name}: skipped\n`);
    return;
  }

  process.stdout.write(`\n— ${name}\n`);
  const [binary, ...rest] = command;
  const result = spawnSync(binary, rest, {
    cwd: ROOT,
    stdio: 'inherit',
    // Windows cannot exec a .cmd shim without a shell; on POSIX this is the
    // same command through /bin/sh -c.
    shell: true,
  });

  if (result.status !== 0) {
    process.stderr.write(`\n${name} failed; coverage was not measured.\n`);
    process.exit(result.status ?? 1);
  }
}

/** One suite's report, as covered and total statements per file. */
function readReport(report) {
  const file = join(ROOT, report, 'coverage-final.json');

  if (!existsSync(file)) {
    return new Map();
  }

  const raw = JSON.parse(readFileSync(file, 'utf8'));
  const files = new Map();

  for (const [absolute, entry] of Object.entries(raw)) {
    const path = relative(ROOT, absolute).split('\\').join('/');
    const counts = Object.values(entry.s ?? {});

    files.set(path, {
      total: counts.length,
      hits: counts.map((count) => (count > 0 ? 1 : 0)),
    });
  }

  return files;
}

/**
 * The suites added together: a statement covered by any run is covered. Two
 * runs disagreeing about how many statements a file has means they measured
 * different builds of it, so the longer count wins and its own hits stand.
 */
function merge(reports) {
  const merged = new Map();

  for (const report of reports) {
    for (const [path, file] of report) {
      const existing = merged.get(path);

      if (!existing) {
        merged.set(path, { total: file.total, hits: [...file.hits] });
        continue;
      }

      if (existing.total !== file.total) {
        if (file.total > existing.total) {
          merged.set(path, { total: file.total, hits: [...file.hits] });
        }
        continue;
      }

      existing.hits = existing.hits.map((hit, index) => hit || file.hits[index]);
    }
  }

  return merged;
}

function summarize(merged) {
  return AREAS.map((area) => {
    let covered = 0;
    let total = 0;
    let files = 0;

    for (const [path, file] of merged) {
      if (!area.holds(path)) {
        continue;
      }

      files += 1;
      total += file.total;
      covered += file.hits.reduce((sum, hit) => sum + hit, 0);
    }

    return {
      ...area,
      files,
      covered,
      total,
      percent: total === 0 ? 0 : (covered / total) * 100,
    };
  });
}

for (const suite of SUITES) {
  run(suite);
}

const merged = merge(SUITES.map((suite) => readReport(suite.report)));
const areas = summarize(merged);
const floors = JSON.parse(readFileSync(THRESHOLDS, 'utf8'));

process.stdout.write('\nCoverage by area — statements\n\n');

let failed = false;

for (const area of areas) {
  const floor = floors.areas[area.name];
  const measured = area.percent.toFixed(1);
  const short = area.gated && floor !== undefined && area.percent + 0.05 < floor;

  if (short) {
    failed = true;
  }

  const verdict = !area.gated
    ? 'not gated'
    : floor === undefined
      ? 'no floor set'
      : short
        ? `BELOW its floor of ${String(floor)}%`
        : `floor ${String(floor)}%`;

  process.stdout.write(
    `  ${area.name.padEnd(26)} ${measured.padStart(5)}%  ` +
      `(${String(area.covered)}/${String(area.total)} in ${String(area.files)} files)  ${verdict}\n`,
  );
}

if (update) {
  for (const area of areas.filter((entry) => entry.gated)) {
    // A point of slack, so an unrelated refactor that moves one branch does
    // not fail the build the next morning.
    floors.areas[area.name] = Math.max(0, Math.floor(area.percent - 1));
  }

  writeFileSync(THRESHOLDS, `${JSON.stringify(floors, null, 2)}\n`);
  process.stdout.write('\nFloors updated from what was measured.\n');
  process.exit(0);
}

if (skipE2e) {
  process.stdout.write(
    '\nThe e2e suite was skipped, so the API is far below what it really covers. Floors not enforced.\n',
  );
  process.exit(0);
}

if (failed) {
  process.stderr.write(
    '\nCoverage fell below a floor. Add tests, or lower the floor in coverage.thresholds.json and say why.\n',
  );
  process.exit(1);
}

process.stdout.write('\nEvery area is at or above its floor.\n');
