import { InjectionToken } from '@angular/core';

/**
 * True in the `demo` build (angular.json), which is the editor published on GitHub Pages: files
 * stay in the browser, and the app says so. Everywhere else it is false.
 */
export const DEMO_MODE = new InjectionToken<boolean>('DEMO_MODE', {
  providedIn: 'root',
  factory: () => false,
});
