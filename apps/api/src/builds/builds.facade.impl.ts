import { Injectable } from '@nestjs/common';

import { BuildsFacade } from './abstract/builds.facade';
import { BuildsRepository } from './abstract/builds.repository';

/** Serves the builds facade out of the module's own repository. */
@Injectable()
export class BuildsFacadeImpl extends BuildsFacade {
  constructor(private readonly builds: BuildsRepository) {
    super();
  }

  async ownerIfVisible(viewerId: string, buildId: string): Promise<string | null> {
    // The same rule a build's own page applies: the viewer's build, or a shared one.
    const build = await this.builds.findVisibleForViewer(viewerId, buildId);
    return build?.ownerId ?? null;
  }
}
