import { ApplicationConfig, ErrorHandler, provideBrowserGlobalErrorListeners } from '@angular/core';
import { DEMO_MODE } from './demo-mode';
import { AppErrorHandler } from './error-handler';
import { BrowserFileStorage } from './storage/browser-file-storage';
import { FileStorage } from './storage/file-storage';

/**
 * The `demo` build (angular.json), replacing `app.config.ts`: the same app, which also says that it
 * is a demo. (It repeats the providers: importing `app.config` would import this file itself.)
 */
export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    { provide: ErrorHandler, useClass: AppErrorHandler },
    { provide: FileStorage, useClass: BrowserFileStorage },
    { provide: DEMO_MODE, useValue: true },
  ],
};
