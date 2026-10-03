/**
 * @ariadne/masstransit: MassTransit saga state machines and Ariadne diagrams.
 *
 * - `importSagas`: C# source -> diagrams (tree-sitter, so it runs in the browser too);
 * - `createCSharpParser`: loads the tree-sitter runtime and the C# grammar (WebAssembly);
 * - for Node there is `createNodeParser` in `@ariadne/masstransit/node`.
 */
export * from './import';
export * from './parser';
