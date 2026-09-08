import baseConfig from '../../eslint.config.mjs';

export default [
  ...baseConfig,
  {
    // A NestJS module is an intentionally empty class: the @Module() decorator
    // carries the configuration and Nest uses the class itself as the token.
    // There is no static-only misuse to catch here, so the rule reports a false
    // positive on every module in the app.
    files: ['**/*.module.ts'],
    rules: {
      '@typescript-eslint/no-extraneous-class': 'off',
    },
  },
];
