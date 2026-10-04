import { ApplicationConfig, ErrorHandler, provideBrowserGlobalErrorListeners } from '@angular/core';
import { AppErrorHandler } from './error-handler';
import { BrowserFileStorage } from './storage/browser-file-storage';
import { FileStorage } from './storage/file-storage';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    { provide: ErrorHandler, useClass: AppErrorHandler },
    { provide: FileStorage, useClass: BrowserFileStorage },
  ],
};
