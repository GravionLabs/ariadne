// Stylelint config that enforces the design tokens of docs/STYLEGUIDE.md.
// Copy to the repository root as stylelint.config.mjs (setup-oxc-husky does it). Token rules: ng-implementation references/style-lint.md.
// Former Biome CSS rules: no duplicate properties, no unknown pseudo-elements (ng-deep allowed).
const guide = 'See docs/STYLEGUIDE.md.';

/** @type {import('stylelint').Config} */
export default {
  extends: ['stylelint-config-standard-scss'],
  customSyntax: 'postcss-scss',
  rules: {
    'declaration-block-no-duplicate-properties': true,
    'selector-pseudo-element-no-unknown': [true, { ignorePseudoElements: ['ng-deep'] }],
    'color-no-hex': [
      true,
      { message: `Why: raw hex colors bypass the color tokens. Instead: use var(--…). ${guide}` },
    ],
    'function-disallowed-list': [
      ['rgb', 'rgba', 'hsl', 'hsla'],
      {
        message: (name) =>
          `Why: ${name}() is a raw color and bypasses the color tokens. Instead: use var(--…). ${guide}`,
      },
    ],
    'declaration-property-value-allowed-list': [
      {
        // Tokens, or the scale of the guide: adapt the rem values to the scale of docs/STYLEGUIDE.md.
        'font-size': [
          '/^var\\(--[\\w-]+(,.*)?\\)$/',
          '/^(0\\.75|0\\.875|1|1\\.125|1\\.25|1\\.5|2)rem$/',
          'inherit',
        ],
      },
      {
        message: (property, value) =>
          `Why: ${property}: ${value} is not a token or a step of the type scale. Instead: use var(--font-size-…). ${guide}`,
      },
    ],
  },
  overrides: [
    {
      // The token definitions themselves may use raw values.
      files: ['**/tokens.css', '**/tokens.scss', '**/_tokens.scss', '**/styles/tokens/**'],
      rules: {
        'color-no-hex': null,
        'function-disallowed-list': null,
        'declaration-property-value-allowed-list': null,
      },
    },
  ],
};
