import { z } from 'zod';

/**
 * The process environment, validated once at boot.
 *
 * Failing fast here means a missing secret is a startup error with a readable
 * message, rather than an `undefined` that surfaces as a 500 three days later.
 */

const seconds = z.coerce.number().int().positive();

const csvEmails = z
  .string()
  .default('')
  .transform((raw) =>
    raw
      .split(',')
      .map((entry) => entry.trim().toLowerCase())
      .filter((entry) => entry.length > 0),
  );

/**
 * A rate limit: a whole number of requests a minute, never zero. Empty counts
 * as unset, because the production compose file passes each one through as
 * `${RATE_LIMIT_…:-}` — and the default stays here, in one place.
 */
const perMinute = (fallback: number): z.ZodPreprocess<z.ZodDefault<z.ZodCoercedNumber>> =>
  z.preprocess(
    (value) => (value === '' ? undefined : value),
    z.coerce.number().int().min(1).default(fallback),
  );

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),

  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),

  CLIENT_URL: z.url().default('http://localhost:4200'),

  GOOGLE_CLIENT_ID: z.string().min(1, 'GOOGLE_CLIENT_ID is required'),
  GOOGLE_CLIENT_SECRET: z.string().min(1, 'GOOGLE_CLIENT_SECRET is required'),
  GOOGLE_CALLBACK_URL: z.url(),

  /**
   * The single gate on registration. `*` opens sign-up to any Google account;
   * a comma-separated list restricts it; empty admits nobody.
   */
  /**
   * Who may sign in, as a fresh database starts: read once, when the
   * `app_settings` row is first created, and changed on the Admin page from
   * then on. Open, any Google account may sign in; closed — the default —
   * only the addresses on the list.
   */
  ALLOWED_EMAILS: csvEmails,
  OPEN_REGISTRATION: z
    .union([z.boolean(), z.enum(['true', 'false'])])
    .transform((value) => value === true || value === 'true')
    .default(false),

  JWT_ACCESS_SECRET: z
    .string()
    .min(32, 'JWT_ACCESS_SECRET must be at least 32 characters'),
  JWT_REFRESH_SECRET: z
    .string()
    .min(32, 'JWT_REFRESH_SECRET must be at least 32 characters'),
  JWT_ACCESS_TTL: seconds.default(900),
  JWT_REFRESH_TTL: seconds.default(2_592_000),
  /**
   * The longest a sign-in lasts, however often the pilot comes back: each
   * refresh grants JWT_REFRESH_TTL more, but never past this from the moment
   * they signed in with Google. 90 days.
   */
  JWT_SESSION_MAX_TTL: seconds.default(7_776_000),

  /**
   * S3-compatible object storage. MinIO locally, Blob/R2 in production — the
   * difference is these five values and nothing in the code.
   */
  S3_ENDPOINT: z.url(),
  /**
   * Where the *browser* reaches storage, when that is not where the API does.
   *
   * A presigned URL signs the host it names, so it has to be built against an
   * address the browser can resolve — and on a single VPS that is a public
   * name in DNS, which a container inside the network cannot look up. The API
   * keeps using `S3_ENDPOINT` for its own reads and writes, straight to the
   * service; only the signing uses this. Left unset they are the same, which
   * is the local and single-host case.
   */
  S3_PUBLIC_ENDPOINT: z.url().optional(),
  S3_REGION: z.string().min(1).default('us-east-1'),
  S3_BUCKET: z.string().min(1),
  S3_ACCESS_KEY: z.string().min(1),
  S3_SECRET_KEY: z.string().min(1),
  /**
   * MinIO addresses buckets by path (`host/bucket/key`); AWS uses a virtual
   * host (`bucket.host/key`). Getting this wrong makes every presigned URL
   * point at a hostname that does not resolve.
   */
  S3_FORCE_PATH_STYLE: z
    .union([z.boolean(), z.enum(['true', 'false'])])
    .transform((value) => value === true || value === 'true')
    .default(true),

  /** How long a presigned upload or download URL stays valid. */
  S3_UPLOAD_URL_TTL: seconds.default(300),
  S3_DOWNLOAD_URL_TTL: seconds.default(3600),

  /**
   * Betaflight's blackbox_decode, which turns a .bbl log into CSV. The API
   * image builds it in. On a machine without it — Windows has no C compiler
   * to build it with — name a Docker image built from the Dockerfile's
   * `blackbox-decode` stage instead, and the decoder runs through Docker.
   */
  BLACKBOX_DECODE_PATH: z.string().min(1).default('blackbox_decode'),
  BLACKBOX_DECODE_DOCKER_IMAGE: z.string().default(''),

  /**
   * The National Bank of Ukraine's official exchange rates: every currency it
   * publishes for one day, as hryvnias per unit, asked for with
   * `?json&date=YYYYMMDD`. Free, with no key. And how long to wait for an
   * answer before the job gives up and tries again later.
   */
  NBU_RATES_URL: z
    .url()
    .default('https://bank.gov.ua/NBUStatService/v1/statdirectory/exchangenew'),
  NBU_RATES_TIMEOUT_MS: z.coerce.number().int().positive().default(10_000),

  /**
   * DB-IP's "IP to Country Lite" database (CC BY 4.0), which says which
   * country a sign-in comes from. The API image downloads it when it is
   * built; in development, `npm run geo:download`. Missing: nobody is
   * refused for their country, and the log says so.
   */
  GEOIP_COUNTRY_DB: z.string().min(1).default('data/geoip/dbip-country-lite.mmdb'),

  /**
   * Countries nobody may sign in from (ISO codes, comma-separated): the
   * starting list of the Admin page's setting, read once when the settings
   * row is first created. Admins are never refused.
   */
  BLOCKED_COUNTRIES: z
    .string()
    .default('RU,BY,IR,KP,SY,CU')
    .transform((value) =>
      value
        .split(',')
        .map((code) => code.trim().toUpperCase())
        .filter((code) => /^[A-Z]{2}$/.test(code)),
    ),

  /**
   * How many proxies stand in front of the API, so the visitor's own address
   * is read from X-Forwarded-For rather than the proxy's. Production has one,
   * Caddy; development has none.
   */
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(5).default(0),

  /**
   * Rate limits, each a count per minute, per route and per caller — the
   * signed-in pilot, else the address. Changed here rather than in code so
   * a limit that turns out too tight needs a restart, not a release
   * (`common/guards/rate-limit.guard.ts`).
   */
  /** Any request to any route. */
  RATE_LIMIT_REQUESTS: perMinute(300),
  /** Any request that changes something: not GET, HEAD or OPTIONS. */
  RATE_LIMIT_WRITES: perMinute(60),
  /** Google sign-in and its callback, by address. */
  RATE_LIMIT_SIGN_IN: perMinute(10),
  /** A new question, reply or comment. */
  RATE_LIMIT_COMMENTS: perMinute(10),
  /** The one route where the server opens an address someone else chose. */
  RATE_LIMIT_URL_PREVIEW: perMinute(20),
  /** Signing a photo or post image upload: one per file. */
  RATE_LIMIT_IMAGE_UPLOADS: perMinute(30),
  /**
   * Signing a flight-log upload. Looser than other writes: a radio's LOGS
   * folder signs one file after another, and the storage limit bounds it.
   */
  RATE_LIMIT_LOG_UPLOADS: perMinute(600),
});

export type Env = z.output<typeof envSchema>;

export function validateEnv(raw: Record<string, unknown>): Env {
  const result = envSchema.safeParse(raw);

  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }

  return result.data;
}
