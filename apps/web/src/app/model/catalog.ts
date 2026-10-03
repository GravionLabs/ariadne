import { Diagram, EventKind, MessageKind, eventKindOf } from './diagram';

/** A state that sends a command or publishes an event when the saga enters it. */
export interface Producer {
  nodeId: string;
  name: string;
}

/** A transition that reacts to an event. */
export interface Reaction {
  edgeId: string;
  from: string;
  to: string;
}

/** One command or event of the saga, with where it comes from and where it is used. */
export interface MessageEntry {
  kind: MessageKind;
  name: string;
  /** Events only: published by the saga, from outside, a timeout, a reply, a fault, a join. */
  origin?: EventKind;
  /** Events only: where an outside event comes from (`eventSource` of its transitions). */
  sources: string[];
  /** States that send the command / publish the event on entering. */
  producers: Producer[];
  /** Transitions that react to the event. */
  reactions: Reaction[];
  /** The nodes and transitions this message is about, for highlighting. */
  nodeIds: string[];
  edgeIds: string[];
  /**
   * Whether renaming it here renames it everywhere. Events with a fixed name (timeouts, replies,
   * faults, joins) are named where they are defined, not here.
   */
  renamable: boolean;
}

/**
 * Every command and event of the diagram: commands first, then events, each by name. Events are
 * the ones states publish and the ones transitions react to.
 */
export function buildCatalog(diagram: Diagram): MessageEntry[] {
  const kindOf = eventKindOf(diagram);
  const nodeName = (id: string) => diagram.nodes.find((n) => n.id === id)?.name ?? id;
  const entries = new Map<string, MessageEntry>();
  const entry = (kind: MessageKind, name: string): MessageEntry => {
    const key = `${kind}:${name}`;
    let found = entries.get(key);
    if (!found) {
      found = {
        kind,
        name,
        sources: [],
        producers: [],
        reactions: [],
        nodeIds: [],
        edgeIds: [],
        renamable: true,
      };
      entries.set(key, found);
    }
    return found;
  };

  for (const node of diagram.nodes) {
    for (const activity of node.activities ?? []) {
      const e = entry(activity.kind, activity.name);
      if (!e.producers.some((p) => p.nodeId === node.id)) {
        e.producers.push({ nodeId: node.id, name: node.name });
        e.nodeIds.push(node.id);
      }
    }
  }
  for (const edge of diagram.edges) {
    if (!edge.event) continue;
    const e = entry('event', edge.event);
    e.reactions.push({ edgeId: edge.id, from: nodeName(edge.source), to: nodeName(edge.target) });
    e.edgeIds.push(edge.id);
    for (const id of [edge.source, edge.target]) if (!e.nodeIds.includes(id)) e.nodeIds.push(id);
    if (edge.eventSource && !e.sources.includes(edge.eventSource)) e.sources.push(edge.eventSource);
  }
  for (const e of entries.values()) {
    if (e.kind === 'event') {
      e.origin = kindOf({ event: e.name }) ?? 'external';
      e.renamable = e.origin === 'internal' || e.origin === 'external';
    }
  }

  return [...entries.values()].sort(
    (a, b) =>
      (a.kind === b.kind ? 0 : a.kind === 'command' ? -1 : 1) || a.name.localeCompare(b.name),
  );
}

/**
 * Renames a message everywhere it is used: the activities of that kind and, for an event, the
 * transitions that react to it. `null` if the new name is empty, the same, or already taken by
 * another message of that kind.
 */
export function renameMessage(
  diagram: Diagram,
  kind: MessageKind,
  from: string,
  to: string,
): Diagram | null {
  const name = to.trim();
  if (!name || name === from) return null;
  const taken = buildCatalog(diagram).some((m) => m.kind === kind && m.name === name);
  if (taken) return null;
  return {
    ...diagram,
    nodes: diagram.nodes.map((n) =>
      n.activities?.some((a) => a.kind === kind && a.name === from)
        ? {
            ...n,
            activities: n.activities.map((a) =>
              a.kind === kind && a.name === from ? { ...a, name } : a,
            ),
          }
        : n,
    ),
    edges:
      kind === 'event'
        ? diagram.edges.map((e) => (e.event === from ? { ...e, event: name } : e))
        : diagram.edges,
  };
}
