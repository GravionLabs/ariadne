import { Diagram, DiagramEdge, SLIP_OUTCOMES, eventKindOf, slipEvent } from './diagram';
import { namingHint } from './messages';

export type Severity = 'error' | 'warning' | 'info';

/** Every rule has a stable code, so findings can be filtered, documented and tested. */
export type RuleCode =
  | 'no-initial-state'
  | 'multiple-initial-states'
  | 'unreachable-state'
  | 'transition-into-initial'
  | 'dead-end'
  | 'ambiguous-event'
  | 'missing-event'
  | 'external-without-source'
  | 'naming-command'
  | 'naming-event'
  | 'empty-routing-slip'
  | 'duplicate-routing-slip'
  | 'unhandled-slip-outcome'
  | 'slip-outcome-elsewhere';

export interface Finding {
  severity: Severity;
  code: RuleCode;
  message: string;
  /** The node or transition the finding is about; absent for the diagram as a whole. */
  elementId?: string;
}

export const SEVERITIES: readonly Severity[] = ['error', 'warning', 'info'];

/**
 * Documentation-quality checks, not compiler errors: they point at modelling mistakes. Pure and
 * deterministic (findings follow the order of the diagram), so the web app, a CLI and an editor
 * extension can report the same things.
 *
 * - error: no or several initial states, unreachable states, a transition into the initial state,
 *   a routing slip without activities, two routing slips (or a slip and a request) with one name;
 * - warning: dead ends, an event that two transitions of a state cannot be told apart by, a
 *   transition without an event, a routing slip outcome nothing reacts to, a transition on the
 *   outcome of a routing slip its state does not start;
 * - info: an external event without a source, naming hints.
 */
export function validate(diagram: Diagram): Finding[] {
  const findings: Finding[] = [];
  const nodes = new Map(diagram.nodes.map((n) => [n.id, n]));
  const edges = diagram.edges.filter((e) => nodes.has(e.source) && nodes.has(e.target));
  const starts = diagram.nodes.filter((n) => n.type === 'start');

  // ---- errors
  if (starts.length === 0) {
    findings.push({
      severity: 'error',
      code: 'no-initial-state',
      message: 'The saga has no initial state.',
    });
  }
  for (const start of starts.slice(1)) {
    findings.push({
      severity: 'error',
      code: 'multiple-initial-states',
      message: `“${start.name}” is a second initial state: a saga has only one.`,
      elementId: start.id,
    });
  }
  for (const edge of edges) {
    if (nodes.get(edge.target)?.type === 'start') {
      findings.push({
        severity: 'error',
        code: 'transition-into-initial',
        message: `A transition leads into the initial state “${nodes.get(edge.target)!.name}”.`,
        elementId: edge.id,
      });
    }
  }

  // Reachable from an initial state or from the Any node (whose transitions apply everywhere).
  // With no initial state at all every state would be unreachable: that is already reported.
  if (starts.length > 0) {
    const reached = reach(
      diagram.nodes.filter((n) => n.type === 'start' || n.type === 'any').map((n) => n.id),
      edges,
    );
    for (const node of diagram.nodes) {
      if (node.type === 'start' || node.type === 'any' || reached.has(node.id)) continue;
      findings.push({
        severity: 'error',
        code: 'unreachable-state',
        message: `“${node.name}” cannot be reached from the initial state.`,
        elementId: node.id,
      });
    }
  }

  // Routing slips (ADR 0023): an itinerary, and a name of its own, since the outcomes are named after it.
  const slipNames = new Map<string, number>();
  const requestNames = new Set(diagram.nodes.flatMap((n) => (n.requests ?? []).map((r) => r.name)));
  for (const node of diagram.nodes) {
    for (const slip of node.routingSlips ?? []) {
      slipNames.set(slip.name, (slipNames.get(slip.name) ?? 0) + 1);
      if (!slip.activities.length) {
        findings.push({
          severity: 'error',
          code: 'empty-routing-slip',
          message: `The routing slip “${slip.name}” of “${node.name}” has no activities.`,
          elementId: node.id,
        });
      }
      if (
        slipNames.get(slip.name) === 2 ||
        (slipNames.get(slip.name) === 1 && requestNames.has(slip.name))
      ) {
        findings.push({
          severity: 'error',
          code: 'duplicate-routing-slip',
          message: requestNames.has(slip.name)
            ? `The routing slip “${slip.name}” has the name of a request: their outcomes would be the same events.`
            : `Two routing slips are called “${slip.name}”: their outcomes would be the same events.`,
          elementId: node.id,
        });
      }
    }
  }

  // ---- warnings
  const forward = edges.filter((e) => e.kind === 'forward');
  const canFinish = reachBackwards(
    diagram.nodes.filter((n) => n.type === 'end').map((n) => n.id),
    forward,
  );
  for (const node of diagram.nodes) {
    if ((node.type === 'state' || node.type === 'join') && !canFinish.has(node.id)) {
      findings.push({
        severity: 'warning',
        code: 'dead-end',
        message: `“${node.name}” has no way to a final state.`,
        elementId: node.id,
      });
    }
  }
  for (const [source, group] of groupBy(
    forward.filter((e) => e.event),
    (e) => e.source,
  )) {
    for (const [event, same] of groupBy(group, (e) => e.event!)) {
      if (same.length < 2 || !ambiguous(same)) continue;
      for (const edge of same) {
        findings.push({
          severity: 'warning',
          code: 'ambiguous-event',
          message: `“${event}” leaves “${nodes.get(source)!.name}” more than once without a guard that tells the transitions apart.`,
          elementId: edge.id,
        });
      }
    }
  }
  for (const edge of forward) {
    const from = nodes.get(edge.source)!;
    if (!edge.event && from.type !== 'start') {
      findings.push({
        severity: 'warning',
        code: 'missing-event',
        message: `The transition from “${from.name}” to “${nodes.get(edge.target)!.name}” has no event.`,
        elementId: edge.id,
      });
    }
  }

  // An outcome of a routing slip that no transition of its state reacts to: the saga would wait.
  const startedBy = new Map<string, Set<string>>();
  for (const node of diagram.nodes) {
    for (const slip of node.routingSlips ?? []) {
      for (const outcome of SLIP_OUTCOMES) {
        const event = slipEvent(slip.name, outcome);
        startedBy.set(event, (startedBy.get(event) ?? new Set()).add(node.id));
        const handled = edges.some(
          (e) => e.event === event && (e.source === node.id || nodes.get(e.source)?.type === 'any'),
        );
        if (!handled) {
          findings.push({
            severity: 'warning',
            code: 'unhandled-slip-outcome',
            message: `“${node.name}” starts the routing slip “${slip.name}” but nothing reacts to ${event}.`,
            elementId: node.id,
          });
        }
      }
    }
  }
  for (const edge of edges) {
    const states = edge.event ? startedBy.get(edge.event) : undefined;
    const from = nodes.get(edge.source)!;
    if (states && from.type === 'state' && !states.has(edge.source)) {
      findings.push({
        severity: 'warning',
        code: 'slip-outcome-elsewhere',
        message: `“${from.name}” reacts to ${edge.event}, but it does not start that routing slip.`,
        elementId: edge.id,
      });
    }
  }

  // ---- info
  const kindOf = eventKindOf(diagram);
  for (const edge of forward) {
    if (edge.event && kindOf(edge) === 'external' && !edge.eventSource) {
      findings.push({
        severity: 'info',
        code: 'external-without-source',
        message: `“${edge.event}” comes from outside the saga; say where from.`,
        elementId: edge.id,
      });
    }
    // Replies, faults, timeouts and composite events have fixed names: only the others get hints.
    const hint =
      edge.event && (kindOf(edge) === 'internal' || kindOf(edge) === 'external')
        ? namingHint('event', edge.event)
        : null;
    if (hint) {
      findings.push({
        severity: 'info',
        code: 'naming-event',
        message: `“${edge.event}”: ${hint}.`,
        elementId: edge.id,
      });
    }
  }
  for (const node of diagram.nodes) {
    for (const activity of node.activities ?? []) {
      const hint = namingHint(activity.kind, activity.name);
      if (!hint) continue;
      findings.push({
        severity: 'info',
        code: activity.kind === 'command' ? 'naming-command' : 'naming-event',
        message: `“${activity.name}” in “${node.name}”: ${hint}.`,
        elementId: node.id,
      });
    }
  }

  return findings;
}

/** The worst severity among findings, or `undefined` without any. */
export function worst(findings: readonly Finding[]): Severity | undefined {
  return SEVERITIES.find((s) => findings.some((f) => f.severity === s));
}

/** Findings by element id, for the markers on the canvas. */
export function findingsByElement(findings: readonly Finding[]): Map<string, Finding[]> {
  const byElement = new Map<string, Finding[]>();
  for (const f of findings) {
    if (f.elementId) byElement.set(f.elementId, [...(byElement.get(f.elementId) ?? []), f]);
  }
  return byElement;
}

/** Two transitions on one event are ambiguous unless every one has a guard of its own. */
function ambiguous(same: readonly DiagramEdge[]): boolean {
  const guards = same.map((e) => e.guard?.trim() ?? '');
  return guards.some((g) => g === '') || new Set(guards).size < guards.length;
}

function reach(from: readonly string[], edges: readonly DiagramEdge[]): Set<string> {
  const seen = new Set(from);
  const queue = [...from];
  while (queue.length) {
    const id = queue.shift()!;
    for (const e of edges) {
      if (e.source === id && !seen.has(e.target)) {
        seen.add(e.target);
        queue.push(e.target);
      }
    }
  }
  return seen;
}

function reachBackwards(to: readonly string[], edges: readonly DiagramEdge[]): Set<string> {
  const seen = new Set(to);
  const queue = [...to];
  while (queue.length) {
    const id = queue.shift()!;
    for (const e of edges) {
      if (e.target === id && !seen.has(e.source)) {
        seen.add(e.source);
        queue.push(e.source);
      }
    }
  }
  return seen;
}

function groupBy<T>(items: readonly T[], key: (item: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const item of items) groups.set(key(item), [...(groups.get(key(item)) ?? []), item]);
  return groups;
}
