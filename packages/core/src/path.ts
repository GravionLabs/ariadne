import { parse } from 'yaml';
import { Diagram, DiagramEdge, DiagramNode, EventKind, NodeType, eventKindOf } from './diagram';
import { optionsAt, startOf } from './walkthrough';

/**
 * One step of what a saga instance did, as the host app has it: the event it received, or the state
 * it moved to. `to` says which transition when several react to the same event (guards).
 */
export interface PathStep {
  /** The event the saga reacted to. */
  event?: string;
  /** The state the step led to, by name or id. */
  state?: string;
  /** Like `state`, to tell apart transitions on one event. */
  to?: string;
  /** When it happened; shown with the step. */
  at?: string;
  /** Anything worth saying about the step; shown with it. */
  note?: string;
}

export type PathProblemKind =
  /** The diagram has no initial state to start from. */
  | 'no-initial-state'
  /** The step has neither an event nor a state. */
  | 'empty-step'
  /** No transition of the current state matches. */
  | 'no-transition'
  /** Several transitions of the current state match; the step does not say which. */
  | 'ambiguous'
  /** The saga had already reached a final state. */
  | 'after-final';

export interface PathProblem {
  /** Position in the steps given (0-based); -1 for the diagram. */
  index: number;
  kind: PathProblemKind;
  message: string;
  /** The transitions that matched, for `ambiguous`. */
  candidates?: string[];
}

export interface ResolvedStep {
  /** Position in the steps given (0-based). */
  index: number;
  /** The transition taken. */
  edgeId: string;
  /** Node ids. */
  from: string;
  to: string;
  step: PathStep;
}

export interface ResolvedPath {
  /** The states visited, in order, from the initial state; as far as the path could be resolved. */
  nodes: string[];
  transitions: ResolvedStep[];
  /** Step numbers (1-based, as in the steps given) by transition id; a loop taken twice has two. */
  stepNumbers: Record<string, number[]>;
  /** How often each state was visited. */
  visits: Record<string, number>;
  /** Where the instance is now: the last state reached. */
  current?: string;
  /** The path ends in a final state, without problems. */
  finished: boolean;
  /** What could not be resolved; the path stops at the first one. */
  problems: PathProblem[];
}

/**
 * Resolves the path of a saga instance against the diagram, from the initial state on: each step
 * follows a transition the current state offers (`optionsAt`, the rules of the walkthrough). A step
 * that cannot be resolved, or that does not say which of several transitions, is reported and the
 * path stops there; the viewer does not guess.
 *
 * A first step that only names the initial state is the starting point, not a transition.
 */
export function resolvePath(diagram: Diagram, steps: readonly PathStep[]): ResolvedPath {
  const result: ResolvedPath = {
    nodes: [],
    transitions: [],
    stepNumbers: {},
    visits: {},
    finished: false,
    problems: [],
  };
  const start = startOf(diagram);
  if (!start) {
    result.problems.push({
      index: -1,
      kind: 'no-initial-state',
      message: 'The diagram has no initial state.',
    });
    return result;
  }
  const nodes = new Map(diagram.nodes.map((n) => [n.id, n]));
  const visit = (node: DiagramNode) => {
    result.nodes.push(node.id);
    result.visits[node.id] = (result.visits[node.id] ?? 0) + 1;
    result.current = node.id;
  };
  visit(start);

  for (const [index, step] of steps.entries()) {
    const here = nodes.get(result.current!)!;
    const problem = (kind: PathProblemKind, message: string, candidates?: DiagramEdge[]) => {
      result.problems.push({
        index,
        kind,
        message: `Step ${index + 1}: ${message}`,
        ...(candidates ? { candidates: candidates.map((e) => e.id) } : {}),
      });
    };
    const event = step.event?.trim();
    const wanted = [step.state, step.to].map((s) => s?.trim()).filter((s): s is string => !!s);
    if (!event && !wanted.length) {
      problem('empty-step', 'it names neither an event nor a state.');
      break;
    }
    if (index === 0 && !event && wanted.every((w) => w === start.name || w === start.id)) continue;
    if (here.type === 'end') {
      problem('after-final', `the saga had already finished in “${here.name}”.`);
      break;
    }
    const matches = optionsAt(diagram, here.id).filter(
      (e) =>
        (!event || e.event === event) &&
        wanted.every((w) => {
          const target = nodes.get(e.target);
          return target?.id === w || target?.name === w;
        }),
    );
    const what = [event && `event “${event}”`, ...wanted.map((w) => `state “${w}”`)]
      .filter(Boolean)
      .join(' to ');
    if (!matches.length) {
      problem('no-transition', `“${here.name}” has no transition for ${what}.`);
      break;
    }
    if (matches.length > 1) {
      problem(
        'ambiguous',
        `${matches.length} transitions of “${here.name}” match ${what}; say which with \`to\`.`,
        matches,
      );
      break;
    }
    const edge = matches[0];
    const target = nodes.get(edge.target)!;
    result.transitions.push({ index, edgeId: edge.id, from: here.id, to: target.id, step });
    (result.stepNumbers[edge.id] ??= []).push(index + 1);
    visit(target);
  }
  result.finished = !result.problems.length && nodes.get(result.current!)?.type === 'end';
  return result;
}

/** A state the instance went through, as the timeline shows it. */
export interface TimelineState {
  kind: 'state';
  nodeId: string;
  name: string;
  type: NodeType;
  /** `current`: where the instance is now; `finished`: the final state it ended in. */
  status: 'visited' | 'current' | 'finished';
  /** The how-manieth time the instance is in this state (1 the first time): loops are unrolled. */
  visit: number;
}

/** A transition the instance took, between the states before and after it. */
export interface TimelineStep {
  kind: 'step';
  /** As the steps were numbered (1-based), the same numbers the diagram shows. */
  number: number;
  edgeId: string;
  event?: string;
  guard?: string;
  /** Where the event came from: a reply, a timeout, a join… (`eventKindOf`). */
  eventKind?: EventKind;
  at?: string;
  note?: string;
}

/** Where the path could not be followed any further. */
export interface TimelineProblem {
  kind: 'problem';
  /** The step that could not be followed (1-based); 0 for a problem of the diagram. */
  number: number;
  problem: PathProblemKind;
  message: string;
}

export type TimelineEntry = TimelineState | TimelineStep | TimelineProblem;

/**
 * The path of an instance as a timeline, left to right: the states it went through, with the
 * transition it took between each two, in order. A loop is unrolled (a state taken three times is
 * there three times); the last state is `current`, or `finished` when the instance ended in a final
 * state; where the path stopped, a problem says why. The editor, the viewer and the exports draw this.
 */
export function pathTimeline(diagram: Diagram, resolved: ResolvedPath): TimelineEntry[] {
  const nodes = new Map(diagram.nodes.map((n) => [n.id, n]));
  const edges = new Map(diagram.edges.map((e) => [e.id, e]));
  const kindOf = eventKindOf(diagram);
  const visits = new Map<string, number>();
  const entries: TimelineEntry[] = [];
  const state = (nodeId: string): TimelineState | undefined => {
    const node = nodes.get(nodeId);
    if (!node) return undefined;
    const visit = (visits.get(nodeId) ?? 0) + 1;
    visits.set(nodeId, visit);
    return { kind: 'state', nodeId, name: node.name, type: node.type, status: 'visited', visit };
  };

  const first = resolved.nodes[0] && state(resolved.nodes[0]);
  if (first) entries.push(first);
  for (const taken of resolved.transitions) {
    const edge = edges.get(taken.edgeId);
    const eventKind = edge ? kindOf(edge) : undefined;
    entries.push({
      kind: 'step',
      number: taken.index + 1,
      edgeId: taken.edgeId,
      ...(edge?.event ? { event: edge.event } : {}),
      ...(edge?.guard ? { guard: edge.guard } : {}),
      ...(eventKind ? { eventKind } : {}),
      ...(taken.step.at ? { at: taken.step.at } : {}),
      ...(taken.step.note ? { note: taken.step.note } : {}),
    });
    const next = state(taken.to);
    if (next) entries.push(next);
  }
  const last = [...entries].reverse().find((e): e is TimelineState => e.kind === 'state');
  if (last) last.status = resolved.finished ? 'finished' : 'current';
  for (const problem of resolved.problems) {
    entries.push({
      kind: 'problem',
      number: problem.index + 1,
      problem: problem.kind,
      message: problem.message,
    });
  }
  return entries;
}

/** A pasted path longer than this is refused: no saga instance goes through that many transitions. */
export const PATH_LIMITS = { maxBytes: 1_000_000, maxSteps: 10_000 } as const;

export type ParsedPathSteps = { steps: PathStep[] } | { error: string };

const STEP_KEYS = ['event', 'state', 'to', 'at', 'note'] as const;

/**
 * Reads a pasted path: a JSON or YAML list whose items are an event name or a step object
 * (`{ event, state, to, at, note }`). Empty text is an empty path. The error is for people.
 */
export function parsePathSteps(text: string): ParsedPathSteps {
  if (!text.trim()) return { steps: [] };
  if (text.length > PATH_LIMITS.maxBytes) {
    return { error: `The path is too long: up to ${PATH_LIMITS.maxBytes / 1_000_000} MB of text.` };
  }
  let value: unknown;
  try {
    value = parse(text);
  } catch (e) {
    return { error: `Not valid JSON or YAML: ${(e as Error).message.split('\n')[0]}` };
  }
  if (!Array.isArray(value)) return { error: 'A path is a list of steps, one per event or state.' };
  if (value.length > PATH_LIMITS.maxSteps) {
    return { error: `The path has ${value.length} steps; up to ${PATH_LIMITS.maxSteps} are read.` };
  }
  const steps: PathStep[] = [];
  for (const [i, item] of value.entries()) {
    if (typeof item === 'string') {
      steps.push({ event: item });
      continue;
    }
    if (item === null || typeof item !== 'object' || Array.isArray(item)) {
      return { error: `Step ${i + 1} is neither an event name nor a step object.` };
    }
    const record = item as Record<string, unknown>;
    const step: PathStep = {};
    for (const key of STEP_KEYS) {
      const field = record[key];
      if (field === undefined || field === null) continue;
      if (typeof field === 'object' && !(field instanceof Date)) {
        return { error: `Step ${i + 1}: \`${key}\` must be text.` };
      }
      step[key] = field instanceof Date ? field.toISOString() : String(field);
    }
    steps.push(step);
  }
  return { steps };
}
