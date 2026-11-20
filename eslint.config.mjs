// @ts-check
// ESLint lints the Angular templates only: oxlint lints every .ts and .js file, the Angular class
// rules included (.oxlintrc.json), but cannot parse templates (ADR 0006 of GravionLabs/skills, #597).
// Every template is a .html file (an inline `template:` is an oxlint error), so no inline-template
// processor is needed.
import angular from 'angular-eslint';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/.angular/**',
      '**/node_modules/**',
      '**/.claude/**',
      '**/.agents/**',
      '**/.worktrees/**',
      '**/test-results/**',
      '**/.vscode-test/**',
      '**/dist-test/**',
      'dotnet/**',
      // The lint probe breaks rules on purpose; lint-probe/check.mjs lints it with --no-ignore.
      'lint-probe/**',
    ],
  },
  {
    files: ['**/*.html'],
    extends: [...angular.configs.templateRecommended, ...angular.configs.templateAccessibility],
  },
);
