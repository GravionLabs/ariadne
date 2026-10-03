// YAML files imported by specs (docs/examples) are inlined as text; see `loader` in angular.json.
declare module '*.yaml' {
  const text: string;
  export default text;
}
