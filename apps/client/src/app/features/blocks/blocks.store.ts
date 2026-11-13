import { Injectable, inject, signal } from '@angular/core';
import type { BlockedPilotDto } from '@spothub/shared';
import { firstValueFrom } from 'rxjs';

import { apiMessage } from '../../core/api/api-error';
import { BlocksApi } from './blocks.api';

/**
 * The pilots the signed-in pilot has blocked: listed on `/account`, added
 * from a comment. A blocked pilot can no longer comment on anything the
 * blocker owns, and the blocker no longer sees what they write.
 */
@Injectable({ providedIn: 'root' })
export class BlocksStore {
  private readonly api = inject(BlocksApi);

  private readonly pilots = signal<readonly BlockedPilotDto[]>([]);
  private readonly busy = signal(false);
  private readonly failure = signal<string | null>(null);

  readonly blocked = this.pilots.asReadonly();
  readonly saving = this.busy.asReadonly();
  readonly error = this.failure.asReadonly();

  async load(): Promise<void> {
    this.failure.set(null);

    try {
      this.pilots.set(await firstValueFrom(this.api.list()));
    } catch (error) {
      this.failure.set(apiMessage(error, 'Could not load the pilots you blocked.'));
    }
  }

  /** True once blocked; false with the reason in `error`. */
  block(userId: string): Promise<boolean> {
    return this.run(async () => {
      await firstValueFrom(this.api.block(userId));
    }, 'Could not block that pilot. Try again.');
  }

  unblock(userId: string): Promise<boolean> {
    return this.run(async () => {
      await firstValueFrom(this.api.unblock(userId));
      this.pilots.update((pilots) => pilots.filter((pilot) => pilot.userId !== userId));
    }, 'Could not unblock that pilot. Try again.');
  }

  private async run(call: () => Promise<void>, fallback: string): Promise<boolean> {
    this.busy.set(true);
    this.failure.set(null);

    try {
      await call();
      return true;
    } catch (error) {
      this.failure.set(apiMessage(error, fallback));
      return false;
    } finally {
      this.busy.set(false);
    }
  }
}
