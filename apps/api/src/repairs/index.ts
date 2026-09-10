/**
 * The repairs module's public API.
 *
 * `RepairsFacade` is an abstract class and therefore a runtime value — it is
 * the DI token other modules inject, so it must not be exported as a type.
 */
export { RepairsFacade } from './abstract/repairs.facade';
export type { RepairCostSummary } from './abstract/repairs.facade';
export { RepairsModule } from './repairs.module';
