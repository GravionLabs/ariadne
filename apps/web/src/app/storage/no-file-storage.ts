import { FileStorage } from './file-storage';

const MESSAGE = 'Files are handled by the host of the editor.';

/** For the embedded editor: the host reads and writes files, so nothing here may. */
export class NoFileStorage extends FileStorage {
  open(): Promise<never> {
    return Promise.reject(new Error(MESSAGE));
  }
  openFiles(): Promise<never> {
    return Promise.reject(new Error(MESSAGE));
  }
  saveFiles(): Promise<never> {
    return Promise.reject(new Error(MESSAGE));
  }
  save(): Promise<never> {
    return Promise.reject(new Error(MESSAGE));
  }
  saveAs(): Promise<never> {
    return Promise.reject(new Error(MESSAGE));
  }
  exportFile(): Promise<never> {
    return Promise.reject(new Error(MESSAGE));
  }
}
