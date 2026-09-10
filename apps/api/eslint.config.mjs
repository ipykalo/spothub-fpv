import baseConfig from '../../eslint.config.mjs';

/**
 * Every top-level folder under `src/` is a module, and its `index.ts` is its
 * whole public surface. Reaching past that barrel is how one module ends up
 * injecting another's repository, which is what this forbids.
 *
 * The list *is* the boundary — add a folder here when you add one under
 * `src/`, or the rule silently does not apply to it.
 *
 * A closed list is what makes this precise. A generic "up a level, then
 * deeper" pattern cannot tell `../../auth/services/auth.service` (illegal)
 * from `../abstract/builds.repository` (an ordinary intra-module import),
 * because both are "up then deeper".
 */
const MODULES =
  'app|auth|build-parts|builds|common|config|configs|health|media|parts|prisma|repairs|users';

const BARREL_ONLY = [
  {
    regex: `^(\\.\\./)+(${MODULES})/`,
    message:
      "Deep cross-module import. A module's index.ts is its public API — import the barrel instead, e.g. `../../repairs`. If you need behaviour rather than a type, add it to that module's facade.",
  },
  {
    // `main.ts` and anything else at the root of src/ reaches modules with `./`.
    regex: `^\\./(${MODULES})/`,
    message: 'Deep cross-module import. Import the module barrel instead, e.g. `./app`.',
  },
];

export default [
  ...baseConfig,

  {
    // NOTE: these globs are relative to apps/api/, not the workspace root —
    // Nx runs `eslint .` with cwd=apps/api and ESLint takes its basePath from
    // the config file it finds there. `apps/api/src/**` would match nothing.
    files: ['src/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@prisma/client',
              message:
                'The domain must not import Prisma. Only a prisma-*.repository.ts, a file under a repositories/ folder, and PrismaService may.',
            },
          ],
          patterns: BARREL_ONLY,
        },
      ],

      // Moved here from the root config, where `files: ['apps/api/**/*.ts']`
      // never matched under `nx lint api` and both rules were silently dead.
      // Nest resolves constructor parameters from decorator metadata, which
      // needs the parameter types emitted rather than erased.
      '@typescript-eslint/consistent-type-imports': 'off',
      // Decorated classes — modules especially — legitimately have no members.
      '@typescript-eslint/no-extraneous-class': 'off',
    },
  },

  {
    // The persistence layer is the one place Prisma is allowed to exist. A
    // module with one Prisma repository keeps it flat as
    // `prisma-*.repository.ts` and only folders it at two, so both shapes are
    // listed. Rule options are replaced rather than merged, so the barrel
    // patterns have to be restated here.
    files: [
      'src/**/prisma-*.repository.ts',
      'src/**/repositories/**/*.ts',
      'src/prisma/**/*.ts',
    ],
    rules: {
      'no-restricted-imports': ['error', { patterns: BARREL_ONLY }],
    },
  },
];
