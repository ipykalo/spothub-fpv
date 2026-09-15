import { Injectable } from '@nestjs/common';

import { SpotsFacade } from './abstract/spots.facade';
import { SpotsRepository } from './abstract/spots.repository';

/** Serves the spots facade out of the module's own repository. */
@Injectable()
export class SpotsFacadeImpl extends SpotsFacade {
  constructor(private readonly spots: SpotsRepository) {
    super();
  }

  async ownerIfVisible(viewerId: string, spotId: string): Promise<string | null> {
    // The same rule a spot's own page applies: the viewer's spot, or a shared, finished one.
    const spot = await this.spots.findVisibleForViewer(viewerId, spotId);
    return spot?.ownerId ?? null;
  }
}
