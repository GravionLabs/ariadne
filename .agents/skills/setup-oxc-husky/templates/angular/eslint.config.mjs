// @ts-check
// ESLint lints the Angular templates only; oxlint lints every .ts file (ADR 0006 of GravionLabs/skills).
// Templates live in .html files, so no processInlineTemplates.
import angular from 'angular-eslint';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist/**', 'coverage/**', 'node_modules/**', '.angular/**', 'out-tsc/**', 'lint-probe/**'] },
  {
    files: ['**/*.html'],
    extends: [...angular.configs.templateRecommended, ...angular.configs.templateAccessibility],
  },
);
