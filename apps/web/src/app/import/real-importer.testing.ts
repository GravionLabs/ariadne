import grammar from '../../../node_modules/tree-sitter-c-sharp/tree-sitter-c_sharp.wasm';
import runtime from '../../../node_modules/web-tree-sitter/web-tree-sitter.wasm';
import type { CSharpImporter } from './csharp-parser';

/** The real parser, with the WebAssembly handed over as bytes (the app serves it as assets). */
export const realImporter = async (): Promise<CSharpImporter> => {
  const module = await import('@ariadne/masstransit');
  return {
    parser: await module.createCSharpParser({ grammar, runtime }),
    importSagas: module.importSagas,
  };
};
