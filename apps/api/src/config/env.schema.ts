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
  ALLOWED_EMAILS: csvEmails,

  JWT_ACCESS_SECRET: z
    .string()
    .min(32, 'JWT_ACCESS_SECRET must be at least 32 characters'),
  JWT_REFRESH_SECRET: z
    .string()
    .min(32, 'JWT_REFRESH_SECRET must be at least 32 characters'),
  JWT_ACCESS_TTL: seconds.default(900),
  JWT_REFRESH_TTL: seconds.default(2_592_000),

  /**
   * S3-compatible object storage. MinIO locally, Blob/R2 in production — the
   * difference is these five values and nothing in the code.
   */
  S3_ENDPOINT: z.url(),
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
