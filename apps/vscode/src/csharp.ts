import { readFile } from 'node:fs/promises';
import * as path from 'node:path';
import { createCSharpParser, type CSharpParser } from '@ariadne/masstransit';

let parser: Promise<CSharpParser> | undefined;

/**
 * The C# parser, created on first use (the grammar is about 5 MB of WebAssembly) and shared. The
 * build copies both `.wasm` files next to the bundle, which is `__dirname`.
 */
export function csharpParser(): Promise<CSharpParser> {
  parser ??= (async () =>
    createCSharpParser({
      grammar: new Uint8Array(await readFile(path.join(__dirname, 'tree-sitter-c_sharp.wasm'))),
      runtime: path.join(__dirname, 'web-tree-sitter.wasm'),
    }))().catch((e) => {
    // A failed start is tried again next time.
    parser = undefined;
    throw e;
  });
  return parser;
}
