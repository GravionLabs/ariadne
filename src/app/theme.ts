import { DOCUMENT } from '@angular/common';
import { Injectable, computed, effect, inject, signal } from '@angular/core';

export type ThemeName = 'light' | 'dark' | 'high-contrast';

/** What a host that embeds the editor (the VS Code webview) may ask for. */
const HOST_THEMES: Record<string, ThemeName> = {
  light: 'light',
  dark: 'dark',
  'high-contrast': 'high-contrast',
  // VS Code's theme kinds; there is no light high-contrast token set, so it falls back to light.
  'high-contrast-light': 'light',
};

const STORAGE_KEY = 'ariadne.theme';

/**
 * The colour theme. Without a choice it follows `prefers-color-scheme`; the toggle makes an
 * explicit choice, remembered per user. A host that embeds the editor can drive the theme with
 * {@link setHost} or `postMessage({ type: 'ariadne:theme', kind })`, which wins over both.
 * The token sets live in `src/styles.scss`, selected by `data-theme` on `<html>`.
 */
@Injectable({ providedIn: 'root' })
export class Theme {
  private readonly document = inject(DOCUMENT);
  private readonly view = this.document.defaultView;
  private readonly systemQuery = this.view?.matchMedia?.('(prefers-color-scheme: dark)');

  private readonly systemDark = signal(this.systemQuery?.matches ?? false);
  private readonly choice = signal<'light' | 'dark' | null>(readChoice());
  private readonly host = signal<ThemeName | null>(null);

  /** The theme in effect. */
  readonly name = computed<ThemeName>(
    () => this.host() ?? this.choice() ?? (this.systemDark() ? 'dark' : 'light'),
  );
  readonly isDark = computed(() => this.name() !== 'light');

  constructor() {
    this.systemQuery?.addEventListener?.('change', (e) => this.systemDark.set(e.matches));
    this.view?.addEventListener('message', (e: MessageEvent) => this.onMessage(e));

    effect(() => {
      const root = this.document.documentElement;
      // Nothing chosen: no attribute, so the stylesheet's `prefers-color-scheme` rule applies.
      const explicit = this.host() ?? this.choice();
      if (explicit) root.setAttribute('data-theme', explicit);
      else root.removeAttribute('data-theme');
    });
  }

  /** The toggle: switch to the other of light and dark, and remember it. */
  toggle(): void {
    const next = this.isDark() ? 'light' : 'dark';
    this.choice.set(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Not remembered: fine.
    }
  }

  /** Let the embedding host decide; `null` hands the decision back. */
  setHost(kind: string | null): void {
    this.host.set(kind === null ? null : (HOST_THEMES[kind] ?? this.host()));
  }

  private onMessage(event: MessageEvent): void {
    const data = event.data as { type?: unknown; kind?: unknown } | null;
    if (data?.type !== 'ariadne:theme') return;
    this.setHost(typeof data.kind === 'string' ? data.kind : null);
  }
}

function readChoice(): 'light' | 'dark' | null {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value === 'light' || value === 'dark' ? value : null;
  } catch {
    return null;
  }
}
