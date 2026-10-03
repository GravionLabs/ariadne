import { outgoingCounts } from '../editor/diagram-layout';
import { ACTIVITY_VERBS, DECISION, NODE_TYPES } from '../editor/node-types';
import { Diagram, DiagramNode, publishedEvents } from '../model/diagram';
import { diagramToMermaid, mermaidMarkdown } from './diagram-mermaid';

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
  const published = publishedEvents(diagram);
  const name = (id: string) => nodes.get(id)?.name ?? id;
  const decisions = new Set(
    [...outgoingCounts(diagram)].filter(([, n]) => n > 1).map(([id]) => id),
  );
  const typeLabel = (n: DiagramNode) => (decisions.has(n.id) ? DECISION : NODE_TYPES[n.type]).label;
  const edges = diagram.edges.filter((e) => nodes.has(e.source) && nodes.has(e.target));

  const title = diagram.name?.trim() || options.title?.trim() || 'Saga';
  const description = diagram.description?.trim() || options.description?.trim();
  const out = [`# ${cell(title)}`];
  if (description) out.push(description);
  out.push('## Diagram', mermaidMarkdown(diagramToMermaid(diagram)).trimEnd());

  out.push(
    '## States',
    diagram.nodes.length
      ? table(
          ['State', 'Type', 'Description', 'Activities', 'Compensation', 'Retry', 'Timeout'],
          diagram.nodes.map((n) => [
            n.name,
            typeLabel(n),
            n.description ?? '',
            (n.activities ?? []).map((a) => `${ACTIVITY_VERBS[a.kind]} ${a.name}`).join('\n'),
            n.compensation
              ? [n.compensation.name, n.compensation.description].filter(Boolean).join(': ')
              : '',
            n.retry ?? '',
            n.timeout ?? '',
          ]),
        )
      : none,
  );

  out.push(
    '## Transitions',
    edges.length
      ? table(
          ['From', 'Event', 'Source', 'To', 'Kind'],
          edges.map((e) => [
            name(e.source),
            e.event ?? '',
            e.eventSource ??
              (e.event && !published.has(e.event) ? 'external' : e.event ? 'saga' : ''),
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
            published.has(ev) ? 'Internal' : 'External',
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
  s
    .replace(/\\/g, '\\\\')
    .replace(/\|/g, '\\|')
    .replace(/\s*\n\s*/g, '<br>')
    .trim();

const table = (header: string[], rows: string[][]): string =>
  [header, header.map(() => '---'), ...rows]
    .map((row) => `| ${row.map(cell).join(' | ')} |`)
    .join('\n');
