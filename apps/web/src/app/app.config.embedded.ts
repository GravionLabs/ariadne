import {
  ApplicationConfig,
  ErrorHandler,
  inject,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import { AppErrorHandler } from './error-handler';
import { EmbeddedSync } from './host/embedded-sync';
import { EditorHost } from './host/editor-host';
import { VsCodeEditorHost } from './host/vscode-editor-host';
import { FileStorage } from './storage/file-storage';
import { NoFileStorage } from './storage/no-file-storage';

/** The `embedded` build (angular.json): the editor in the VS Code webview, replacing `app.config.ts`. */
export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    { provide: ErrorHandler, useClass: AppErrorHandler },
    // Listen before the first message can arrive, then say `ready`.
    provideAppInitializer(() => inject(EmbeddedSync).start()),
    // A factory, not `useClass`: a subclass would inherit the default provider of EditorHost.
    { provide: EditorHost, useFactory: () => new VsCodeEditorHost() },
    // The host owns the files; the file actions are not shown.
    { provide: FileStorage, useClass: NoFileStorage },
  ],
};
