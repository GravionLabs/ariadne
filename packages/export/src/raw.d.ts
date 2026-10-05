// Example sagas are read as text in specs: `import text from '…saga.yaml?raw'` (Vite).
declare module '*.yaml?raw' {
  const text: string;
  export default text;
}
