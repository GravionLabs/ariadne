import { TestBed } from '@angular/core/testing';
import { Theme } from './theme';

describe('Theme', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
  });

  function setup(): Theme {
    const theme = TestBed.inject(Theme);
    TestBed.tick();
    return theme;
  }

  const attribute = () => document.documentElement.getAttribute('data-theme');

  it('leaves the choice to prefers-color-scheme until one is made', () => {
    const theme = setup();
    expect(attribute()).toBeNull();
    expect(theme.name()).toBe('light'); // jsdom has no dark preference
  });

  it('toggles to an explicit theme and remembers it', () => {
    const theme = setup();
    theme.toggle();
    TestBed.tick();
    expect(attribute()).toBe('dark');
    expect(localStorage.getItem('ariadne.theme')).toBe('dark');

    theme.toggle();
    TestBed.tick();
    expect(attribute()).toBe('light');
  });

  it('restores the remembered theme', () => {
    localStorage.setItem('ariadne.theme', 'dark');
    expect(setup().name()).toBe('dark');
    expect(attribute()).toBe('dark');
  });

  it('ignores a remembered value it does not know', () => {
    localStorage.setItem('ariadne.theme', 'sepia');
    expect(setup().name()).toBe('light');
  });

  it('lets the host decide, over the user choice', () => {
    const theme = setup();
    theme.toggle();
    theme.setHost('high-contrast');
    TestBed.tick();
    expect(theme.name()).toBe('high-contrast');
    expect(attribute()).toBe('high-contrast');

    theme.setHost(null);
    TestBed.tick();
    expect(attribute()).toBe('dark');
  });

  it('maps high-contrast light to light and ignores unknown kinds', () => {
    const theme = setup();
    theme.setHost('high-contrast-light');
    expect(theme.name()).toBe('light');
    theme.setHost('dark');
    theme.setHost('neon');
    expect(theme.name()).toBe('dark');
  });

  it('follows a theme message from the host', () => {
    const theme = setup();
    window.dispatchEvent(
      new MessageEvent('message', { data: { type: 'ariadne:theme', kind: 'dark' } }),
    );
    expect(theme.name()).toBe('dark');
    window.dispatchEvent(new MessageEvent('message', { data: { type: 'other', kind: 'light' } }));
    expect(theme.name()).toBe('dark');
  });
});
