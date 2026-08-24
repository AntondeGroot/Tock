// @ts-check
//
// NOTE: architectural-boundary linting (eslint-plugin-boundaries) is deliberately
// NOT used. This app is feature-co-located — a component (features/board/board.ts)
// sits beside its pure helpers (features/board/board-geometry.ts) with no path
// convention separating layers, so boundaries can't classify them without a brittle
// hand-list. Its load-bearing rule (forbid component -> store) is also inappropriate
// here: GameStore is a tiny signal holder that components idiomatically read directly.
// The sonarjs design rules + size caps below cover the god-object risk instead.
const eslint = require('@eslint/js');
const { defineConfig } = require('eslint/config');
const tseslint = require('typescript-eslint');
const angular = require('angular-eslint');
const sonarjs = require('eslint-plugin-sonarjs');

module.exports = defineConfig([
  {
    // Generated OpenAPI client is regenerated on every install/build — never linted.
    ignores: [
      'src/app/api/**',
      'dist/**',
      'coverage/**',
      'playwright-report/**',
      'test-results/**',
      '.angular/**',
    ],
  },
  {
    // Application + unit-test sources: type-aware linting (projectService powers the
    // type-checked rules below — prefer-readonly, no-floating-promises, no-deprecated).
    files: ['src/**/*.ts'],
    extends: [
      eslint.configs.recommended,
      tseslint.configs.recommended,
      tseslint.configs.stylistic,
      angular.configs.tsRecommended,
      sonarjs.configs.recommended,
    ],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: __dirname,
      },
    },
    processor: angular.processInlineTemplates,
    rules: {
      '@angular-eslint/directive-selector': [
        'error',
        {
          type: 'attribute',
          prefix: 'app',
          style: 'camelCase',
        },
      ],
      '@angular-eslint/component-selector': [
        'error',
        {
          type: 'element',
          prefix: 'app',
          style: 'kebab-case',
        },
      ],
      'no-console': 'error',
      // Enforce === everywhere except `== null`, the idiomatic null-or-undefined check.
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/prefer-readonly': 'error',
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-deprecated': 'error',
      // Generated client: import from the barrel (…/api), never deep service/model paths.
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/api/api/*', '**/api/model/*'],
              message: 'Import generated client symbols from the barrel (…/api), not deep paths.',
            },
          ],
        },
      ],
      // God-object / size caps. Files already over a cap are ratchet-pinned in a
      // per-file override below (frozen ceiling; lower the TODO as they are slimmed).
      'max-lines': ['error', { max: 400, skipBlankLines: true, skipComments: true }],
      'max-lines-per-function': ['error', { max: 80, skipBlankLines: true, skipComments: true }],
      'max-classes-per-file': ['error', 1],
    },
  },
  {
    // Specs are legitimately long (fixtures, setup) — size caps do not apply.
    files: ['src/**/*.spec.ts'],
    rules: {
      'max-lines': 'off',
      'max-lines-per-function': 'off',
      'max-classes-per-file': 'off',
      // sonarjs's design rules target production code; these misfire on the Angular
      // testing idioms (e.g. HttpTestingController.expectNone is not seen as an assertion).
      'sonarjs/assertions-in-tests': 'off',
      'sonarjs/prefer-specific-assertions': 'off',
      'sonarjs/no-alphabetical-sort': 'off',
    },
  },
  {
    // RATCHET: board.ts is still over the 400-line file cap (428 counted) after a long series of
    // extractions. Pinned at its current size (frozen ceiling — can shrink, never grow). Everything
    // else now meets the global caps: per-function size (80), cognitive complexity (15), and nested
    // functions all pass, so those pins are gone. TODO: extract ~28 more lines to reach 400, then
    // delete this override entirely.
    files: ['src/app/features/board/board.ts'],
    rules: {
      'max-lines': ['error', { max: 428, skipBlankLines: true, skipComments: true }],
    },
  },
  {
    // Bootstrap entrypoint: console.error on a failed bootstrap is legitimate.
    files: ['src/main.ts'],
    rules: { 'no-console': 'off' },
  },
  {
    // E2E (Playwright) + root config files are not in a tsconfig — lint without type info.
    files: ['e2e/**/*.ts', '*.ts'],
    extends: [eslint.configs.recommended, tseslint.configs.recommended, tseslint.configs.stylistic],
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
    },
  },
  {
    files: ['**/*.html'],
    extends: [angular.configs.templateRecommended, angular.configs.templateAccessibility],
    rules: {},
  },
]);
