import js from '@eslint/js';
import nx from '@nx/eslint-plugin';
import angular from 'angular-eslint';
import prettier from 'eslint-config-prettier';
import tseslint from 'typescript-eslint';

/**
 * Lint configuration.
 *
 * Type-aware rules are on (`strictTypeChecked`), which catches the class of
 * bug plain ESLint cannot see: floating promises, unsafe `any` flowing through
 * a call chain, misused nullish values. It costs a slower lint run and is
 * worth it.
 *
 * Prettier is applied last so formatting rules never fight the formatter.
 */
export default tseslint.config(
  {
    ignores: [
      '**/dist',
      '**/node_modules',
      '**/.nx',
      '**/*.timestamp*',
      'node_modules/.prisma',
    ],
  },

  js.configs.recommended,
  ...nx.configs['flat/base'],
  ...nx.configs['flat/typescript'],
  ...nx.configs['flat/javascript'],

  // ---------------------------------------------------------------- TypeScript
  {
    files: ['**/*.ts'],
    extends: [
      ...tseslint.configs.strictTypeChecked,
      ...tseslint.configs.stylisticTypeChecked,
    ],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // A dropped promise in a controller silently swallows failures.
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': [
        'error',
        { checksVoidReturn: { attributes: false } },
      ],
      // `import type` keeps types out of the emitted JS, which matters for
      // NestJS decorator metadata and for tree-shaking in the client.
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
      '@typescript-eslint/explicit-function-return-type': [
        'error',
        { allowExpressions: true, allowTypedFunctionExpressions: true },
      ],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      // Interfaces are used deliberately for domain entities; do not rewrite
      // them into type aliases.
      '@typescript-eslint/consistent-type-definitions': 'off',
      // Interpolating a number into a string is intentional and readable.
      '@typescript-eslint/restrict-template-expressions': [
        'error',
        { allowNumber: true },
      ],
      // `Observable<void>` and `Promise<void>` are legitimate.
      '@typescript-eslint/no-invalid-void-type': [
        'error',
        { allowInGenericTypeArguments: true },
      ],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      curly: ['error', 'all'],
    },
  },

  // ------------------------------------------------------ Angular components
  {
    files: ['apps/client/**/*.ts'],
    extends: [...angular.configs.tsRecommended],
    processor: angular.processInlineTemplates,
    rules: {
      '@angular-eslint/directive-selector': [
        'error',
        { type: 'attribute', prefix: 'sh', style: 'camelCase' },
      ],
      '@angular-eslint/component-selector': [
        'error',
        { type: 'element', prefix: ['sh', 'app'], style: 'kebab-case' },
      ],
      // Modern Angular: standalone by default, signals, inject().
      '@angular-eslint/prefer-standalone': 'error',
      '@angular-eslint/prefer-on-push-component-change-detection': 'error',
      '@angular-eslint/use-lifecycle-interface': 'error',
      '@angular-eslint/no-empty-lifecycle-method': 'error',
    },
  },
  {
    files: ['apps/client/**/*.html'],
    extends: [
      ...angular.configs.templateRecommended,
      ...angular.configs.templateAccessibility,
    ],
  },

  // NestJS overrides live in apps/api/eslint.config.mjs, not here. Nx runs
  // `eslint .` with cwd=apps/api, so ESLint's basePath is that directory and a
  // block scoped to `apps/api/**/*.ts` never matches — this one was dead for
  // as long as it existed. Check with `cd apps/api && npx eslint
  // --print-config <file>` before trusting a new path-scoped rule.

  // -------------------------------------------------------------- test files
  {
    files: ['**/*.spec.ts', '**/*.test.ts'],
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
    },
  },

  prettier,
);
