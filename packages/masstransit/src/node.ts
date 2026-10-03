import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { CSharpParser, createCSharpParser } from './parser';

/** The parser for Node (tests, the CLI): grammar and runtime come from the installed packages. */
export async function createNodeParser(): Promise<CSharpParser> {
  const require = createRequire(import.meta.url);
  return createCSharpParser({
    grammar: new Uint8Array(
      await readFile(require.resolve('tree-sitter-c-sharp/tree-sitter-c_sharp.wasm')),
    ),
    runtime: require.resolve('web-tree-sitter/web-tree-sitter.wasm'),
  });
}
