import { Injectable } from '@nestjs/common';
import type { BuildDto } from '@spothub/shared';

import { BuildsFacade } from './abstract/builds.facade';
import { BuildsRepository } from './abstract/builds.repository';
import { BuildsService } from './builds.service';

/**
 * Serves the builds facade out of the module's own repository, and its own
 * service where a card needs a cover URL signed.
 */
@Injectable()
export class BuildsFacadeImpl extends BuildsFacade {
  constructor(
    private readonly builds: BuildsRepository,
    private readonly service: BuildsService,
  ) {
    super();
  }

  async ownerIfVisible(viewerId: string | null, buildId: string): Promise<string | null> {
    // The same rule a build's own page applies: the viewer's build, or a shared one.
    const build = await this.builds.findVisibleForViewer(viewerId, buildId);
    return build?.ownerId ?? null;
  }

  async idsOwnedBy(
    ownerId: string,
    buildIds: readonly string[],
  ): Promise<ReadonlySet<string>> {
    return new Set(await this.builds.findIdsOwnedBy(ownerId, buildIds));
  }

  visibleToViewer(
    viewerId: string | null,
    buildIds: readonly string[],
  ): Promise<BuildDto[]> {
    return this.service.listVisible(viewerId, buildIds);
  }
}
