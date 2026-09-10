/**
 * The builds module's public API.
 *
 * Nothing but the module class. Sibling modules reach a build through an
 * ownership join in their own repository, never through a call into here.
 */
export { BuildsModule } from './builds.module';
