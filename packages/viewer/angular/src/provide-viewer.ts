import { isPlatformBrowser } from '@angular/common';
import {
  EnvironmentProviders,
  inject,
  makeEnvironmentProviders,
  PLATFORM_ID,
  provideAppInitializer,
} from '@angular/core';
import { defineAriadneSaga } from '@ariadne/viewer';

/**
 * Registers the `<ariadne-saga>` custom element, once, when the app starts in the browser (there
 * is no custom element on the server). Add it next to `provideHttpClient()`, which `url` needs.
 */
export function provideAriadneViewer(): EnvironmentProviders {
  return makeEnvironmentProviders([
    provideAppInitializer(() => {
      if (isPlatformBrowser(inject(PLATFORM_ID))) defineAriadneSaga();
    }),
  ]);
}
