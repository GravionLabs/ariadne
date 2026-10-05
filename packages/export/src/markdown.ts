import { diagramToMermaid, mermaidMarkdown } from './mermaid';
import { replaceLineBreaks } from './text';
import {
  ACTIVITY_VERBS,
  DECISION_INFO,
  decisionIds,
  Diagram,
  DiagramNode,
  EventKind,
  eventKindOf,
  joinEventsOf,
  NODE_INFO,
} from '@ariadne/core';

export interface MarkdownOptions {
  /** Page title when the diagram has no name of its own (the editor passes the file name). */
  title?: string;
  /** Short text under the title when the diagram has no description. */
  description?: string;
}

/**
 * A Markdown page documenting the saga, for READMEs and wikis: the Mermaid diagram, a table of
 * states, a table of transitions and the commands and events with where they are used.
 * Deterministic: rows follow the diagram's order, messages are sorted by name.
 */
export function diagramToMarkdown(diagram: Diagram, options: MarkdownOptions = {}): string {
  const nodes = new Map(diagram.nodes.map((n) => [n.id, n]));
  const kindOf = eventKindOf(diagram);
  const sourceOf = (kind: EventKind | undefined) =>
    kind
      ? {
          internal: 'saga',
          external: 'external',
          timeout: 'timeout',
          reply: 'reply',
          fault: 'fault',
          composite: 'join',
        }[kind]
      : '';
  const name = (id: string) => nodes.get(id)?.name ?? id;
  const decisions = decisionIds(diagram);
  const typeLabel = (n: DiagramNode) =>
    (decisions.has(n.id) ? DECISION_INFO : NODE_INFO[n.type]).label;
  const edges = diagram.edges.filter((e) => nodes.has(e.source) && nodes.has(e.target));

  const title = diagram.name?.trim() || options.title?.trim() || 'Saga';
  const description = diagram.description?.trim() || options.description?.trim();
  const out = [`# ${cell(title)}`];
  if (description) out.push(description);
  out.push('## Diagram', mermaidMarkdown(diagramToMermaid(diagram)).trimEnd());

  // The Waits for column only appears when the diagram has a join.
  const joins = joinEventsOf(diagram);
  const joining = joins.size > 0;
  // The Requests column only appears when some state makes a request.
  const requesting = diagram.nodes.some((n) => n.requests?.length);
  // The Timers column only appears when some state schedules a timeout.
  const timing = diagram.nodes.some((n) => n.timers?.length);
  // The Ignores column only appears when some state ignores an event.
  const ignoring = diagram.nodes.some((n) => n.ignores?.length);
  out.push(
    '## States',
    diagram.nodes.length
      ? table(
          [
            'State',
            'Type',
            'Description',
            'Activities',
            ...(joining ? ['Waits for'] : []),
            ...(requesting ? ['Requests'] : []),
            ...(timing ? ['Timers'] : []),
            ...(ignoring ? ['Ignores'] : []),
            'Compensation',
            'Retry',
            'Timeout',
          ],
          diagram.nodes.map((n) => [
            n.name,
            typeLabel(n),
            n.description ?? '',
            (n.activities ?? []).map((a) => `${ACTIVITY_VERBS[a.kind]} ${a.name}`).join('\n'),
            ...(joining ? [(joins.get(n.id) ?? []).join('\n')] : []),
            ...(requesting
              ? [
                  (n.requests ?? [])
                    .map((r) => `Request ${r.name}${r.timeout ? ` (timeout ${r.timeout})` : ''}`)
                    .join('\n'),
                ]
              : []),
            ...(timing
              ? [
                  (n.timers ?? [])
                    .map(
                      (t) =>
                        `${t.action === 'schedule' ? 'Schedule' : 'Unschedule'} ${t.name}${t.delay ? ` in ${t.delay}` : ''}`,
                    )
                    .join('\n'),
                ]
              : []),
            ...(ignoring ? [(n.ignores ?? []).join('\n')] : []),
            n.compensation
              ? [n.compensation.name, n.compensation.description].filter(Boolean).join(': ')
              : '',
            n.retry ?? '',
            n.timeout ?? '',
          ]),
        )
      : none,
  );

  // The Guard column only appears when some transition has one.
  const guarded = edges.some((e) => e.guard);
  out.push(
    '## Transitions',
    edges.length
      ? table(
          ['From', 'Event', ...(guarded ? ['Guard'] : []), 'Source', 'To', 'Kind'],
          edges.map((e) => [
            name(e.source),
            e.event ?? '',
            ...(guarded ? [e.guard ?? ''] : []),
            e.eventSource ?? sourceOf(kindOf(e)),
            name(e.target),
            e.kind === 'compensation' ? 'Compensation' : 'Forward',
          ]),
        )
      : none,
  );

  const sentBy = new Map<string, string[]>();
  const publishedBy = new Map<string, string[]>();
  for (const n of diagram.nodes) {
    for (const a of n.activities ?? []) {
      push(a.kind === 'command' ? sentBy : publishedBy, a.name, n.name);
    }
  }
  const reactions = new Map<string, string[]>();
  for (const e of edges)
    if (e.event) push(reactions, e.event, `${name(e.source)} → ${name(e.target)}`);

  const commands = [...sentBy.keys()].sort();
  out.push(
    '## Commands',
    commands.length
      ? table(
          ['Command', 'Sent in'],
          commands.map((c) => [c, sentBy.get(c)!.join(', ')]),
        )
      : none,
  );
  const events = [...new Set([...publishedBy.keys(), ...reactions.keys()])].sort();
  out.push(
    '## Events',
    events.length
      ? table(
          ['Event', 'Origin', 'Published in', 'Triggers'],
          events.map((ev) => [
            ev,
            {
              internal: 'Internal',
              external: 'External',
              timeout: 'Timeout',
              reply: 'Reply',
              fault: 'Fault',
              composite: 'Composite',
            }[kindOf({ event: ev })!],
            (publishedBy.get(ev) ?? []).join(', '),
            (reactions.get(ev) ?? []).join('\n'),
          ]),
        )
      : none,
  );

  return `${out.join('\n\n')}\n`;
}

const none = '_None._';

function push(map: Map<string, string[]>, key: string, value: string): void {
  const list = map.get(key) ?? [];
  if (!list.includes(value)) list.push(value);
  map.set(key, list);
}

/** A cell: `|` would end it, line breaks become `<br>`. */
const cell = (s: string): string =>
  replaceLineBreaks(s.replace(/\\/g, '\\\\').replace(/\|/g, '\\|'), '<br>').trim();

const table = (header: string[], rows: string[][]): string =>
  [header, header.map(() => '---'), ...rows]
    .map((row) => `| ${row.map(cell).join(' | ')} |`)
    .join('\n');
