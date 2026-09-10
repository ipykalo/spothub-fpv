import { Injectable } from '@nestjs/common';

import { type RepairCostSummary, RepairsFacade } from './abstract/repairs.facade';
import { RepairsRepository } from './abstract/repairs.repository';
import { rollUpRepairs } from './repairs.mapper';

/** Serves the repairs facade out of the module's own repository. */
@Injectable()
export class RepairsFacadeImpl extends RepairsFacade {
  constructor(private readonly repairs: RepairsRepository) {
    super();
  }

  async costForBuild(ownerId: string, buildId: string): Promise<RepairCostSummary> {
    const repairs = await this.repairs.findManyForOwner(ownerId, buildId);
    return { totals: rollUpRepairs(repairs), count: repairs.length };
  }

  existsForBuild(ownerId: string, buildId: string, repairId: string): Promise<boolean> {
    return this.repairs.existsForOwner(ownerId, buildId, repairId);
  }
}
