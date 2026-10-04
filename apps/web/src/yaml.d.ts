// Example sagas (docs/examples, samples) and the READMEs of the library samples are inlined as text and the tree-sitter WebAssembly as
// bytes when specs import them; see `loader` in angular.json.
declare module '*.yaml' {
  const text: string;
  export default text;
}
declare module '*.cs' {
  const text: string;
  export default text;
}
declare module '*.md' {
  const text: string;
  export default text;
}
declare module '*.wasm' {
  const bytes: Uint8Array;
  export default bytes;
}
