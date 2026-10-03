import { DOCUMENT } from '@angular/common';
import { InjectionToken, inject } from '@angular/core';
import type { CSharpParser, importSagas } from '@ariadne/masstransit';

/** The importer and the parser it reads C# with. */
export interface CSharpImporter {
  readonly parser: CSharpParser;
  readonly importSagas: typeof importSagas;
}

/**
 * Loads the importer and the C# grammar on first use. Both are WebAssembly (about 5.5 MB, 400 kB
 * compressed) that stays out of the first download: this code is a separate chunk, the `.wasm`
 * files are assets under `wasm/`. A test provides its own.
 */
export const CSHARP_IMPORTER = new InjectionToken<() => Promise<CSharpImporter>>(
  'CSHARP_IMPORTER',
  {
    providedIn: 'root',
    factory: () => {
      const base = inject(DOCUMENT).baseURI;
      return async () => {
        const module = await import('@ariadne/masstransit');
        const parser = await module.createCSharpParser({
          grammar: new URL('wasm/tree-sitter-c_sharp.wasm', base),
          runtime: new URL('wasm/web-tree-sitter.wasm', base),
        });
        return { parser, importSagas: module.importSagas };
      };
    },
  },
);
