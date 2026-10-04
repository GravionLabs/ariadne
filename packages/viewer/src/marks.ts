import { Diagram, Finding, MessageEntry, ResolvedPath, Severity, worst } from '@ariadne/core';

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
  /** The path an instance took (resolved); unvisited elements fade unless `showUntaken`. */
  path?: ResolvedPath | null;
  showUntaken?: boolean;
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
  | 'data-selected'
  | 'data-emphasis'
  | 'data-walk'
  | 'data-message'
  | 'data-problem'
  | 'data-path'
  | 'data-hl';

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
  const path = marks.path;
  const pathNodes = new Set(path?.nodes);
  const pathEdges = new Set(path?.transitions.map((t) => t.edgeId));
  const pathStopped = !!path?.problems.length;
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
    const pathMark = !path
      ? false
      : node
        ? id === path.current
          ? path.finished
            ? 'finished'
            : 'current'
          : pathNodes.has(id) && 'visited'
        : pathEdges.has(id) && 'taken';
    set('data-path', pathMark);
    if (node && pathMark === 'current' && pathStopped) g.setAttribute('data-path-problem', 'true');
    else g.removeAttribute('data-path-problem');
    if (node && pathMark) g.setAttribute('aria-current', pathMark === 'visited' ? 'false' : 'true');
    else g.removeAttribute('aria-current');
    const fades = !!path && !marks.showUntaken;
    const on = emphasised || walked || message || (fades && !!pathMark);
    set('data-hl', on && 'true');
    highlighted ||= on;
  }
  highlighted ||= !!path && !marks.showUntaken;
  if (highlighted) stage.setAttribute('data-dim', 'true');
  else stage.removeAttribute('data-dim');
}

const SVG = 'http://www.w3.org/2000/svg';

function svg<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attributes: Record<string, string> = {},
  text?: string,
): SVGElementTagNameMap[K] {
  const element = document.createElementNS(SVG, tag);
  for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, value);
  if (text !== undefined) element.textContent = text;
  return element;
}

/** A small pill on the corner of a card. */
function badge(host: Element, anchor: Element, text: string, kind: string): void {
  const x = Number(anchor.getAttribute('x'));
  const y = Number(anchor.getAttribute('y'));
  const width = Number(anchor.getAttribute('width'));
  if (Number.isNaN(x) || Number.isNaN(y) || Number.isNaN(width)) return;
  const w = Math.max(18, 10 + text.length * 6.2);
  const pill = svg('g', {
    'data-path-badge': kind,
    'aria-hidden': 'true',
    'pointer-events': 'none',
  });
  pill.append(
    svg('rect', {
      x: String(x + width - w + 6),
      y: String(y - 9),
      width: String(w),
      height: '18',
      rx: '9',
      fill: kind === 'problem' ? 'var(--ariadne-fault, #dc2626)' : 'var(--ariadne-path, #2563eb)',
    }),
    svg(
      'text',
      {
        x: String(x + width - w / 2 + 6),
        y: String(y),
        'font-size': '10',
        'font-weight': '700',
        'text-anchor': 'middle',
        'dominant-baseline': 'central',
        fill: 'var(--ariadne-on-path, #ffffff)',
      },
      text,
    ),
  );
  host.append(pill);
}

/**
 * Step numbers on the transitions taken (a loop taken twice reads `2, 4`), how often each state was
 * visited, a `!` where the path stopped, and tooltips with each step's time and note. Replaces what
 * an earlier path drew; pass `null` to take it all away.
 */
export function drawPath(stage: Element, diagram: Diagram, path: ResolvedPath | null): void {
  stage.querySelectorAll('[data-path-badge], [data-path-title]').forEach((e) => e.remove());
  if (!path) return;
  const names = new Map(diagram.nodes.map((n) => [n.id, n.name]));
  const steps = new Map<string, string[]>();
  for (const t of path.transitions) {
    const detail = [`Step ${t.index + 1}`, t.step.at, t.step.note].filter(Boolean).join(' · ');
    steps.set(t.edgeId, [...(steps.get(t.edgeId) ?? []), detail]);
  }
  const title = (text: string) => svg('title', { 'data-path-title': '' }, text);

  for (const g of stage.querySelectorAll<SVGGElement>('[data-edge-id]')) {
    const id = g.dataset['edgeId']!;
    const taken = steps.get(id);
    if (!taken) continue;
    g.prepend(title(taken.join('\n')));
    const card = g.querySelector('rect');
    if (g.dataset['part'] === 'label' && card)
      badge(g, card, path.stepNumbers[id].join(', '), 'steps');
  }
  for (const g of stage.querySelectorAll<SVGGElement>('[data-node-id]')) {
    const id = g.dataset['nodeId']!;
    const visits = path.visits[id];
    if (!visits) continue;
    g.prepend(title(`${names.get(id)}: visited ${visits === 1 ? 'once' : `${visits} times`}`));
    const card = g.querySelector('rect');
    if (!card) continue;
    if (id === path.current && path.problems.length) badge(g, card, '!', 'problem');
    else badge(g, card, `×${visits}`, 'visits');
  }
}
