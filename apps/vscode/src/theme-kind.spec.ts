import { COLOR_THEME_KIND, themeKindOf } from './theme-kind';

describe('themeKindOf', () => {
  it('maps the four theme kinds of VS Code', () => {
    expect(themeKindOf(COLOR_THEME_KIND.Light)).toBe('light');
    expect(themeKindOf(COLOR_THEME_KIND.Dark)).toBe('dark');
    expect(themeKindOf(COLOR_THEME_KIND.HighContrast)).toBe('high-contrast');
    expect(themeKindOf(COLOR_THEME_KIND.HighContrastLight)).toBe('high-contrast-light');
  });

  it('falls back to dark for a kind it does not know', () => {
    expect(themeKindOf(99)).toBe('dark');
  });
});
