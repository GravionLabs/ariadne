import { Diagram, Finding, MessageEntry, Severity, worst } from '@ariadne/core';

/** What the host or the user picked out in the diagram: states by id (or name), transitions by id. */
export interface SagaEmphasis {
  nodes?: readonly string[];
  edges?: readonly string[];
}

export type SagaSelection = { kind: 'node'; id: string } | { kind: 'edge'; id: string };

/** Everything that marks elements of the SVG; each is optional and independent. */
export interface Marks {
  emphasis?: SagaEmphasis | null;
  selection?: SagaSelection | null;
  /** The states and transitions of the walkthrough so far; `current` is where it stands. */
  walk?: { nodes: readonly string[]; edges: readonly string[]; current?: string } | null;
  message?: MessageEntry | null;
  findings?: readonly Finding[];
}

/** Node ids for what a host called a state: an id, or else a name. */
function nodeIdsOf(diagram: Diagram, refs: readonly string[] = []): Set<string> {
  const ids = new Set<string>();
  for (const ref of refs) {
    const byId = diagram.nodes.find((n) => n.id === ref);
    if (byId) ids.add(byId.id);
    else diagram.nodes.filter((n) => n.name === ref).forEach((n) => ids.add(n.id));
  }
  return ids;
}

type MarkAttribute =
  'data-selected' | 'data-emphasis' | 'data-walk' | 'data-message' | 'data-problem' | 'data-hl';

/**
 * Writes the marks as attributes on the addressable groups, and `data-dim` on the stage while
 * something is picked out (emphasis, walkthrough or a message), so the rest can fade. The viewer's
 * CSS styles the attributes; a host can too (`::part` does not reach inside, custom properties do).
 */
export function applyMarks(stage: Element, diagram: Diagram, marks: Marks): void {
  const groups = stage.querySelectorAll<SVGGElement>('[data-node-id], [data-edge-id]');
  const emphasisNodes = nodeIdsOf(diagram, marks.emphasis?.nodes);
  const emphasisEdges = new Set(marks.emphasis?.edges);
  const walkNodes = new Set(marks.walk?.nodes);
  const walkEdges = new Set(marks.walk?.edges);
  const messageNodes = new Set(marks.message?.nodeIds);
  const messageEdges = new Set(marks.message?.edgeIds);
  const bySeverity = new Map<string, Severity>();
  for (const id of new Set(marks.findings?.map((f) => f.elementId))) {
    if (!id) continue;
    const severity = worst(marks.findings!.filter((f) => f.elementId === id));
    if (severity) bySeverity.set(id, severity);
  }

  let highlighted = false;
  for (const g of groups) {
    const node = g.dataset['nodeId'] !== undefined;
    const id = (node ? g.dataset['nodeId'] : g.dataset['edgeId'])!;
    const set = (attribute: MarkAttribute, value: string | false) => {
      if (value === false) g.removeAttribute(attribute);
      else g.setAttribute(attribute, value);
    };
    const emphasised = (node ? emphasisNodes : emphasisEdges).has(id);
    const walked = (node ? walkNodes : walkEdges).has(id);
    const message = (node ? messageNodes : messageEdges).has(id);
    set(
      'data-selected',
      marks.selection?.kind === (node ? 'node' : 'edge') && marks.selection.id === id && 'true',
    );
    set('data-emphasis', emphasised && 'true');
    set('data-walk', walked && (node && marks.walk?.current === id ? 'current' : 'visited'));
    set('data-message', message && 'true');
    set('data-problem', bySeverity.get(id) ?? false);
    const on = emphasised || walked || message;
    set('data-hl', on && 'true');
    highlighted ||= on;
  }
  if (highlighted) stage.setAttribute('data-dim', 'true');
  else stage.removeAttribute('data-dim');
}
