import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { Env } from '../../config';

/**
 * Decides who may sign in. That is its only job.
 *
 * This is the single gate between a personal app and a multi-user one:
 * opening sign-up is `OPEN_REGISTRATION=true`, not a migration. Every owned
 * row already carries an owner, so nothing else has to change. With it off,
 * `ALLOWED_EMAILS` is the list, and an empty list lets nobody in.
 */
@Injectable()
export class AllowlistService {
  private readonly logger = new Logger(AllowlistService.name);
  private readonly allowed: ReadonlySet<string>;
  private readonly openToAll: boolean;

  constructor(config: ConfigService<Env, true>) {
    const entries = config.get('ALLOWED_EMAILS', { infer: true });

    this.openToAll = config.get('OPEN_REGISTRATION', { infer: true });
    this.allowed = new Set(entries);

    if (this.openToAll) {
      this.logger.warn(
        'OPEN_REGISTRATION is on — anyone with a Google account can sign in',
      );
    } else if (entries.includes('*')) {
      // "*" used to be how sign-up was opened. It no longer means anything, and
      // a deployment still relying on it would otherwise just lock everyone out.
      this.logger.warn(
        'ALLOWED_EMAILS contains "*", which no longer opens sign-up — set OPEN_REGISTRATION=true',
      );
    } else if (this.allowed.size === 0) {
      this.logger.warn(
        'ALLOWED_EMAILS is empty and OPEN_REGISTRATION is off — no one can sign in',
      );
    }
  }

  permits(email: string): boolean {
    return this.openToAll || this.allowed.has(email.toLowerCase());
  }
}
