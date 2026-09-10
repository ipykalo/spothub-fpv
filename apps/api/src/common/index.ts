/**
 * The shared kernel: the request pipeline and the handful of domain types that
 * belong to no single feature.
 *
 * Everything here is imported by feature modules; nothing here imports one.
 * That is what keeps it a sink in the dependency graph.
 */
export { CurrentUser } from './decorators/current-user.decorator';
export { IS_PUBLIC_KEY, Public } from './decorators/public.decorator';
export { fromDateOnly, toDateOnly, toNullableDateOnly } from './domain/date-only';
export { sumByCurrency } from './domain/currency-total';
export type { CurrencyTotal } from './domain/currency-total';
export { AllExceptionsFilter } from './filters/all-exceptions.filter';
export { JwtAuthGuard } from './guards/jwt-auth.guard';
export { ZodValidationPipe } from './pipes/zod-validation.pipe';
export type { AuthenticatedUser } from './types/authenticated-user';
export { uniqueSlug } from './utils/slug.util';
