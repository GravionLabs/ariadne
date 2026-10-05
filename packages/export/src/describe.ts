import { Diagram } from '@ariadne/core';
import { replaceLineBreaks } from './text';

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** `A`, `A or B`, `A, B or C`. */
const listOf = (names: string[]): string =>
  names.length < 2 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} or ${names.at(-1)}`;

const unique = (names: (string | undefined)[]): string[] => [
  ...new Set(names.map((n) => n?.trim()).filter((n): n is string => !!n)),
];

/**
 * One sentence that says what the diagram is made of, for those who cannot see it:
 * `5 states and 7 transitions, from Initial to Completed or Cancelled.` The states are the initial
 * state, the final states and the states between them (a join and the Any node are not states).
 */
export function describeDiagram(diagram: Diagram): string {
  const states = diagram.nodes.filter(
    (n) => n.type === 'start' || n.type === 'end' || n.type === 'state',
  ).length;
  const starts = unique(diagram.nodes.filter((n) => n.type === 'start').map((n) => n.name));
  const ends = unique(diagram.nodes.filter((n) => n.type === 'end').map((n) => n.name));
  const size = `${plural(states, 'state', 'states')} and ${plural(diagram.edges.length, 'transition', 'transitions')}`;
  const route = [
    starts.length ? `from ${listOf(starts)}` : '',
    ends.length ? `to ${listOf(ends)}` : '',
  ].filter(Boolean);
  return route.length ? `${size}, ${route.join(' ')}.` : `${size}.`;
}

/** What a picture of the diagram is called: its name, or `Saga diagram`. */
export const diagramTitle = (diagram: Diagram): string => diagram.name?.trim() || 'Saga diagram';

/**
 * The text alternative of a picture of the diagram, beyond its title: the description when there is
 * one, then {@link describeDiagram}. One line of plain text.
 */
export function diagramAlternative(diagram: Diagram): string {
  const description = diagram.description && replaceLineBreaks(diagram.description.trim(), ' ');
  return [description, describeDiagram(diagram)].filter(Boolean).join(' ');
}
