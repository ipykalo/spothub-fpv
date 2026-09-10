/**
 * The auth module's public API.
 *
 * Nothing but the module class: the pieces other modules used to import from
 * here — `JwtAuthGuard`, `Public`, `CurrentUser`, `AuthenticatedUser` — are
 * the request pipeline and live in `common/`.
 */
export { AuthModule } from './auth.module';
