import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { Env } from '../config/env.schema';

/**
 * Decides who may sign in. That is its only job.
 *
 * This is the single gate between a personal app and a multi-user one: opening
 * registration is setting `ALLOWED_EMAILS=*`, not a migration. Every owned row
 * already carries an owner, so nothing else has to change.
 */
@Injectable()
export class AllowlistService {
  private readonly logger = new Logger(AllowlistService.name);
  private readonly allowed: ReadonlySet<string>;
  private readonly openToAll: boolean;

  constructor(config: ConfigService<Env, true>) {
    const entries = config.get('ALLOWED_EMAILS', { infer: true });

    this.openToAll = entries.includes('*');
    this.allowed = new Set(entries);

    if (this.openToAll) {
      this.logger.warn(
        'ALLOWED_EMAILS is "*" — anyone with a Google account can sign in',
      );
    } else if (this.allowed.size === 0) {
      this.logger.warn('ALLOWED_EMAILS is empty — no one can sign in');
    }
  }

  permits(email: string): boolean {
    return this.openToAll || this.allowed.has(email.toLowerCase());
  }
}
