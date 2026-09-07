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
