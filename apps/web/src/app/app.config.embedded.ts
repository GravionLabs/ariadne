import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { EditorHost } from './host/editor-host';
import { VsCodeEditorHost } from './host/vscode-editor-host';
import { FileStorage } from './storage/file-storage';
import { NoFileStorage } from './storage/no-file-storage';

/** The `embedded` build (angular.json): the editor in the VS Code webview, replacing `app.config.ts`. */
export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    // A factory, not `useClass`: a subclass would inherit the default provider of EditorHost.
    { provide: EditorHost, useFactory: () => new VsCodeEditorHost() },
    // The host owns the files; the file actions are not shown.
    { provide: FileStorage, useClass: NoFileStorage },
  ],
};
