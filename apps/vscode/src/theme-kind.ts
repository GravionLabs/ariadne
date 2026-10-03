import type { ThemeKind } from '@ariadne/editor-protocol';

/** The values of `vscode.ColorThemeKind`, so this file needs no VS Code API to be tested. */
export const COLOR_THEME_KIND = { Light: 1, Dark: 2, HighContrast: 3, HighContrastLight: 4 };

export function themeKindOf(kind: number): ThemeKind {
  switch (kind) {
    case COLOR_THEME_KIND.Light:
      return 'light';
    case COLOR_THEME_KIND.HighContrast:
      return 'high-contrast';
    case COLOR_THEME_KIND.HighContrastLight:
      return 'high-contrast-light';
    default:
      return 'dark';
  }
}
