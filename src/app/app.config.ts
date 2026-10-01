import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { BrowserFileStorage } from './storage/browser-file-storage';
import { FileStorage } from './storage/file-storage';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    { provide: FileStorage, useClass: BrowserFileStorage },
  ],
};
