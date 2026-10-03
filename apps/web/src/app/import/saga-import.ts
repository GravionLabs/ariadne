import { Injectable, inject } from '@angular/core';
import type { ImportResult } from '@ariadne/masstransit';
import { FileStorage, TextFile } from '../storage/file-storage';
import { CSHARP_IMPORTER, CSharpImporter } from './csharp-parser';

/** What the user picks to import from: C# source files. */
export const CSHARP_FILES = { extensions: ['.cs'], description: 'C# source files' } as const;

/**
 * Importing saga state machines from C# source files, entirely in the browser: the files are read
 * here and parsed here, nothing is sent anywhere. The parser is loaded when the first file is read.
 */
@Injectable({ providedIn: 'root' })
export class SagaImport {
  private readonly storage = inject(FileStorage);
  private readonly load = inject(CSHARP_IMPORTER);
  private importer: Promise<CSharpImporter> | undefined;

  /** Asks for C# files. `null` when the user cancels. */
  pick(): Promise<TextFile[] | null> {
    return this.storage.openFiles(CSHARP_FILES);
  }

  /** Finds the sagas in the files; what cannot be shown is in the warnings. */
  async read(files: readonly TextFile[]): Promise<ImportResult> {
    // A failed load is not kept: the next try loads again (e.g. after the network came back).
    this.importer ??= this.load().catch((e) => {
      this.importer = undefined;
      throw e;
    });
    const { parser, importSagas } = await this.importer;
    return importSagas(
      files.map((f) => ({ path: f.name, content: f.content })),
      parser,
    );
  }
}
