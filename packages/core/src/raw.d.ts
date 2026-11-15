// Example sagas are read as text in specs: `import text from '…saga.yaml?raw'` (Vite).
declare module '*.yaml?raw' {
  const text: string;
  export default text;
}

// `import.meta.glob(…, { eager: true })` reads every matching file as text in specs (Vite).
interface ImportMeta {
  glob(
    pattern: string | string[],
    options: { query: string; import: string; eager: true },
  ): Record<string, unknown>;
}
