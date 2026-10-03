/** A class that derives from `MassTransitStateMachine<T>`, found without parsing the file. */
export interface StateMachineClass {
  name: string;
  /** Zero-based line of the class declaration. */
  line: number;
}

// `class Name … : … MassTransitStateMachine<`, also with modifiers and attributes before `class`
// and a base list over several lines. A quick scan for the CodeLens; the import does the real work.
const DECLARATION = /\bclass\s+([A-Za-z_]\w*)\s*(?:<[^>{]*>)?\s*:\s*([^{;]*)/g;

export function findStateMachines(source: string): StateMachineClass[] {
  const found: StateMachineClass[] = [];
  const code = withoutComments(source);
  for (const match of code.matchAll(DECLARATION)) {
    if (!/\bMassTransitStateMachine\s*</.test(match[2]!)) continue;
    const line = code.slice(0, match.index).split('\n').length - 1;
    found.push({ name: match[1]!, line });
  }
  return found;
}

/** Comments become spaces (newlines stay), so a commented-out class is not found. */
function withoutComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/\/\/[^\n]*/g, (m) => ' '.repeat(m.length));
}
