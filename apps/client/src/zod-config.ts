/**
 * zod 4 compiles fast validators with `new Function` when it may, and finds
 * out by trying one as each object schema is defined. The page's
 * Content-Security-Policy forbids that, so the try failed quietly and the
 * browser logged a violation on every page. With `jitless`, zod never tries.
 *
 * Set on the global zod reads its settings from, and loaded as the build's
 * `polyfills` entry (project.json), which runs before `main` and every chunk
 * it pulls in. A `z.config()` call in `main.ts` ran too late: the bundler
 * moves shared code into chunks that load before main's own first line, and
 * the schemas in them had already probed. Not importing zod here also keeps
 * a second copy of it out of the bundle.
 */
const scope = globalThis as { __zod_globalConfig?: Record<string, unknown> };

scope.__zod_globalConfig = { ...scope.__zod_globalConfig, jitless: true };

export {};
