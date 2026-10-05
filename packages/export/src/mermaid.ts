import { diagramAlternative, diagramTitle } from './describe';
import { replaceLineBreaks, trimChar } from './text';
import {
  ACTIVITY_VERBS,
  Diagram,
  DiagramEdge,
  DiagramNode,
  eventLabel,
  joinEventsOf,
} from '@ariadne/core';

/** Words Mermaid's state diagram grammar treats as keywords; an id must not be one of them. */
const RESERVED = new Set([
  'state',
  'end',
  'note',
  'class',
  'classdef',
  'direction',
  'style',
  'click',
  'as',
  'left',
  'right',
  'of',
  'title',
  'default',
  'hide',
  'scale',
  'accdescr',
  'acctitle',
]);

/**
 * Mermaid ids cannot contain spaces or punctuation: the name with every other character replaced
 * by `_`, made unique. States whose name differs from their id are declared `state "Name" as id`.
 */
function stateIds(nodes: readonly DiagramNode[]): Map<string, string> {
  const used = new Set<string>();
  const ids = new Map<string, string>();
  for (const node of nodes) {
    let base = trimChar(node.name.replace(/[^\p{L}\p{N}_]+/gu, '_'), '_') || node.type;
    if (/^\d/.test(base) || RESERVED.has(base.toLowerCase())) base = `s_${base}`;
    let id = base;
    for (let i = 2; used.has(id.toLowerCase()); i++) id = `${base}_${i}`;
    used.add(id.toLowerCase());
    ids.set(node.id, id);
  }
  return ids;
}

/** Text in a label or a quoted name: `"` and `;` would end it, line breaks would split it. `;` goes first: `#quot;` has one. */
const text = (s: string): string =>
  replaceLineBreaks(s.replace(/;/g, '#59;').replace(/"/g, '#quot;'), ' ').trim();

/** Text for `accTitle` and `accDescr`, which run to the end of the line: no line breaks, and `%%` would start a comment. */
const accessible = (s: string): string => replaceLineBreaks(s, ' ').replace(/%%/g, '% %').trim();

/**
 * `Event / Send A, Publish B`: the event that triggers the transition, then what the saga does on
 * entering the target state. An event from outside the saga is marked `(from Shop API)`.
 */
function transitionLabel(edge: DiagramEdge, target: DiagramNode): string {
  const event =
    edge.event && `${eventLabel(edge)}${edge.eventSource ? ` (from ${edge.eventSource})` : ''}`;
  const activities = (target.activities ?? [])
    .map((a) => `${ACTIVITY_VERBS[a.kind]} ${a.name}`)
    .join(', ');
  const body = [event, activities && (event ? `/ ${activities}` : activities)].filter(Boolean);
  const label = body.join(' ');
  return edge.kind === 'compensation' ? `compensate${label ? `: ${label}` : ''}` : label;
}

/**
 * The diagram as Mermaid `stateDiagram-v2` text. A named diagram starts with `title` front matter.
 *
 * - The initial state is `[*]`; a final state is a named state with `--> [*]`, so its name stays
 *   visible (an alias pointing to `[*]` would render as the bare end marker, without the name).
 * - A decision is a plain state with several transitions, not `<<choice>>`: a choice renders as an
 *   unlabelled diamond, which hides the name and the activities.
 * - A compensation transition is labelled `compensate`, and states that have a compensation are
 *   in the `compensation` class (amber, like the editor).
 */
/** Mermaid's `direction` for each of the diagram's (#113). */
const MERMAID_DIRECTION: Readonly<Record<string, 'TB' | 'BT' | 'LR' | 'RL'>> = {
  'top-bottom': 'TB',
  'bottom-top': 'BT',
  'left-right': 'LR',
  'right-left': 'RL',
};

export function diagramToMermaid(diagram: Diagram): string {
  const ids = stateIds(diagram.nodes.filter((n) => n.type !== 'start'));
  const nodes = new Map(diagram.nodes.map((n) => [n.id, n]));
  const ref = (id: string) => (nodes.get(id)?.type === 'start' ? '[*]' : ids.get(id)!);
  const joins = joinEventsOf(diagram);
  const lines = [
    ...(diagram.name?.trim()
      ? ['---', `title: ${JSON.stringify(diagram.name.trim())}`, '---']
      : []),
    'stateDiagram-v2',
    // Mermaid's accessibility syntax: GitHub draws it into the title and description of its SVG.
    `  accTitle: ${accessible(diagramTitle(diagram))}`,
    `  accDescr: ${accessible(diagramAlternative(diagram))}`,
    `  direction ${MERMAID_DIRECTION[diagram.direction] ?? 'TB'}`,
  ];

  for (const node of diagram.nodes) {
    if (node.type === 'start') continue;
    const id = ids.get(node.id)!;
    // A join is Mermaid's bar; it shows no name, so a note carries it (below).
    if (node.type === 'join') lines.push(`  state ${id} <<join>>`);
    else if (id !== node.name) lines.push(`  state "${text(node.name)}" as ${id}`);
  }
  for (const edge of diagram.edges) {
    const target = nodes.get(edge.target);
    if (!nodes.has(edge.source) || !target) continue;
    const label = transitionLabel(edge, target);
    lines.push(`  ${ref(edge.source)} --> ${ref(edge.target)}${label ? ` : ${text(label)}` : ''}`);
  }
  for (const node of diagram.nodes) {
    if (node.type === 'end') lines.push(`  ${ids.get(node.id)} --> [*]`);
  }
  for (const node of diagram.nodes) {
    const notes = [
      ...(node.requests ?? []).map(
        (r) => `Requests ${r.name}${r.timeout ? ` (timeout ${r.timeout})` : ''}`,
      ),
      ...(node.timers ?? []).map(
        (t) =>
          `${t.action === 'schedule' ? 'Schedules' : 'Unschedules'} ${t.name}${t.delay ? ` in ${t.delay}` : ''}`,
      ),
      ...(node.type === 'join'
        ? [
            `${node.name} when ${(joins.get(node.id) ?? []).join(' + ') || 'its events'} have all arrived`,
          ]
        : []),
      ...(node.ignores?.length ? [`Ignores ${node.ignores.join(', ')}`] : []),
    ];
    if (notes.length)
      lines.push(`  note right of ${ids.get(node.id)} : ${text(notes.join(' · '))}`);
  }
  const compensated = diagram.nodes.filter((n) => n.compensation).map((n) => ids.get(n.id)!);
  if (compensated.length) {
    lines.push('  classDef compensation fill:#fef3c7,stroke:#f59e0b,color:#92400e');
    lines.push(`  class ${compensated.join(',')} compensation`);
  }
  return `${lines.join('\n')}\n`;
}

/** The Mermaid text in a fenced block, for READMEs and wikis. */
export const mermaidMarkdown = (mermaid: string): string => `\`\`\`mermaid\n${mermaid}\`\`\`\n`;
