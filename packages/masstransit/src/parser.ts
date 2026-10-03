import type { Node } from 'web-tree-sitter';

/** A syntax tree node (tree-sitter). Re-exported so callers need not depend on web-tree-sitter. */
export type SyntaxNode = Node;

/** Turns C# source text into a syntax tree. */
export interface CSharpParser {
  parse(source: string): SyntaxNode;
}

export interface CSharpParserOptions {
  /** The C# grammar, `tree-sitter-c_sharp.wasm`: a URL or path to fetch/read, or its bytes. */
  grammar: string | URL | Uint8Array;
  /**
   * The tree-sitter runtime, `web-tree-sitter.wasm`. Without it the runtime looks next to its own
   * script, which works in Node but not once a bundler has moved the script.
   */
  runtime?: string | URL | Uint8Array;
}

/**
 * Loads tree-sitter and the C# grammar. Both are WebAssembly: the grammar is about 5 MB (300 kB
 * compressed), so load it only when a C# file is about to be read.
 */
export async function createCSharpParser(options: CSharpParserOptions): Promise<CSharpParser> {
  const { Parser, Language } = await import('web-tree-sitter');
  const runtime = options.runtime;
  await Parser.init(
    runtime instanceof Uint8Array
      ? { wasmBinary: runtime }
      : runtime
        ? { locateFile: () => String(runtime) }
        : {},
  );
  const grammar = options.grammar;
  const language = await Language.load(grammar instanceof URL ? String(grammar) : grammar);
  const parser = new Parser();
  parser.setLanguage(language);
  return {
    parse(source) {
      const tree = parser.parse(source);
      if (!tree) throw new Error('The C# source could not be parsed.');
      return tree.rootNode;
    },
  };
}
