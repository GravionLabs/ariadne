import { Injectable, computed, signal } from '@angular/core';
import {
  DEFAULT_NAMES,
  Diagram,
  DiagramEdge,
  DiagramNode,
  Direction,
  EdgeKind,
  NodeType,
  emptyDiagram,
  hasInput,
  hasOutput,
  nextId,
} from './diagram';

const MAX_HISTORY = 100;

export type NodePatch = Partial<Omit<DiagramNode, 'id' | 'type'>>;
export type EdgePatch = Partial<Pick<DiagramEdge, 'event' | 'eventSource' | 'kind'>>;

/** App-owned diagram state (f-flow's "classic" mode): all edits go through this store. */
@Injectable({ providedIn: 'root' })
export class DiagramStore {
  private readonly _diagram = signal<Diagram>(emptyDiagram());
  private readonly _past = signal<Diagram[]>([]);
  private readonly _future = signal<Diagram[]>([]);

  readonly diagram = this._diagram.asReadonly();
  readonly canUndo = computed(() => this._past().length > 0);
  readonly canRedo = computed(() => this._future().length > 0);
  readonly nodes = computed(() => this._diagram().nodes);
  readonly edges = computed(() => this._diagram().edges);
  readonly direction = computed(() => this._diagram().direction);

  /** Replaces the whole diagram (e.g. after opening a file) and clears the undo history. */
  load(diagram: Diagram): void {
    this._diagram.set(diagram);
    this._past.set([]);
    this._future.set([]);
  }

  undo(): void {
    const past = this._past();
    if (past.length === 0) return;
    this._future.update((f) => [this._diagram(), ...f]);
    this._diagram.set(past[past.length - 1]);
    this._past.set(past.slice(0, -1));
  }

  redo(): void {
    const [next, ...rest] = this._future();
    if (!next) return;
    this._past.update((p) => [...p, this._diagram()]);
    this._diagram.set(next);
    this._future.set(rest);
  }

  /** Applies one edit as a single undo step. Every mutation goes through here. */
  private commit(change: (d: Diagram) => Diagram): void {
    const current = this._diagram();
    this._diagram.set(change(current));
    this._past.update((p) => [...p, current].slice(-MAX_HISTORY));
    this._future.set([]);
  }

  private newNode(type: NodeType): DiagramNode {
    return { id: nextId(type, this._diagram().nodes), type, name: DEFAULT_NAMES[type] };
  }

  /** Adds an unconnected node, e.g. the start of an empty diagram. */
  addNode(type: NodeType): string {
    const node = this.newNode(type);
    this.commit((d) => ({ ...d, nodes: [...d.nodes, node] }));
    return node.id;
  }

  /**
   * Adds a node that follows `source`, connected by a forward edge, as a single undo step.
   * Returns the new node id, or `null` if `source` is unknown or the connection is not allowed.
   */
  appendNode(source: string, type: NodeType): string | null {
    const { nodes, edges } = this._diagram();
    const from = nodes.find((n) => n.id === source);
    if (!from || !hasOutput(from.type) || !hasInput(type)) return null;
    const node = this.newNode(type);
    const edge: DiagramEdge = {
      id: nextId('edge', edges),
      source,
      target: node.id,
      kind: 'forward',
    };
    this.commit((d) => ({ ...d, nodes: [...d.nodes, node], edges: [...d.edges, edge] }));
    return node.id;
  }

  /**
   * Splits edge A→B into A→X→B with a new state X. A→X keeps the edge's id and event (with its
   * source), so the transition out of A still reacts to the same event; X→B has no event yet. Returns the new node
   * id, or `null` if the edge is unknown or `type` cannot sit in the middle of a path (start, end).
   */
  insertOnEdge(edgeId: string, type: NodeType): string | null {
    const { edges } = this._diagram();
    const edge = edges.find((e) => e.id === edgeId);
    if (!edge || !hasInput(type) || !hasOutput(type)) return null;
    const node = this.newNode(type);
    const next: DiagramEdge = {
      id: nextId('edge', edges),
      source: node.id,
      target: edge.target,
      kind: edge.kind,
    };
    this.commit((d) => ({
      ...d,
      nodes: [...d.nodes, node],
      edges: [...d.edges.map((e) => (e.id === edgeId ? { ...e, target: node.id } : e)), next],
    }));
    return node.id;
  }

  updateNode(id: string, patch: NodePatch): void {
    this.commit((d) => ({
      ...d,
      nodes: d.nodes.map((n) => (n.id === id ? withoutUndefined({ ...n, ...patch }) : n)),
    }));
  }

  updateEdge(id: string, patch: EdgePatch): void {
    this.commit((d) => ({
      ...d,
      edges: d.edges.map((e) => (e.id === id ? withoutUndefined({ ...e, ...patch }) : e)),
    }));
  }

  setDirection(direction: Direction): void {
    if (direction === this._diagram().direction) return;
    this.commit((d) => ({ ...d, direction }));
  }

  /** Connects two nodes; returns the new edge id, or `null` if the connection is not allowed. */
  connect(source: string, target: string, kind: EdgeKind = 'forward'): string | null {
    const { nodes, edges } = this._diagram();
    const from = nodes.find((n) => n.id === source);
    const to = nodes.find((n) => n.id === target);
    if (source === target || !from || !to || !hasOutput(from.type) || !hasInput(to.type)) {
      return null;
    }
    if (edges.some((e) => e.source === source && e.target === target && e.kind === kind)) {
      return null;
    }
    const id = nextId('edge', edges);
    this.commit((d) => ({ ...d, edges: [...d.edges, { id, source, target, kind }] }));
    return id;
  }

  /**
   * Removes nodes (and every edge attached to them) and edges. Removing a single node that sits
   * on a path (one forward edge in, one out) closes the gap: A→X→B becomes A→B.
   */
  remove(selection: { nodeIds?: readonly string[]; edgeIds?: readonly string[] }): void {
    const nodeIds = new Set(selection.nodeIds ?? []);
    const edgeIds = new Set(selection.edgeIds ?? []);
    if (nodeIds.size === 0 && edgeIds.size === 0) return;
    this.commit((d) => {
      const bridge = nodeIds.size === 1 ? bridgeOver([...nodeIds][0], d.edges, edgeIds) : null;
      const edges = d.edges.filter(
        (e) => !edgeIds.has(e.id) && !nodeIds.has(e.source) && !nodeIds.has(e.target),
      );
      return {
        ...d,
        nodes: d.nodes.filter((n) => !nodeIds.has(n.id)),
        edges: bridge ? [...edges, bridge] : edges,
      };
    });
  }
}

/** The edge that replaces node `id` on its path, or `null` if it is not on a single path. */
function bridgeOver(
  id: string,
  edges: readonly DiagramEdge[],
  removedEdges: ReadonlySet<string>,
): DiagramEdge | null {
  const live = edges.filter((e) => e.kind === 'forward' && !removedEdges.has(e.id));
  const incoming = live.filter((e) => e.target === id);
  const outgoing = live.filter((e) => e.source === id);
  if (incoming.length !== 1 || outgoing.length !== 1) return null;
  const [into] = incoming;
  const [out] = outgoing;
  if (into.source === out.target) return null;
  const duplicate = edges.some(
    (e) => e.source === into.source && e.target === out.target && e.kind === 'forward',
  );
  return duplicate ? null : { ...into, target: out.target };
}

function withoutUndefined<T extends object>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as T;
}
