import { Injectable, computed, signal } from '@angular/core';
import {
  Diagram,
  DiagramEdge,
  DiagramNode,
  EdgeKind,
  NodeType,
  Point,
  Port,
  emptyDiagram,
  hasInput,
  hasOutput,
  nextId,
} from './diagram';

const MAX_HISTORY = 100;

/** Where an edge attaches to its source and target node; omitted ports use the defaults. */
export interface EdgePorts {
  sourcePort?: Port;
  targetPort?: Port;
}

const DEFAULT_NAMES: Record<NodeType, string> = {
  start: 'Start',
  end: 'End',
  step: 'Step',
  decision: 'Decision',
};

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

  addNode(type: NodeType, position: Point): string {
    const id = nextId(type, this._diagram().nodes);
    const node: DiagramNode = { id, type, name: DEFAULT_NAMES[type], position };
    this.commit((d) => ({ ...d, nodes: [...d.nodes, node] }));
    return id;
  }

  updateNode(id: string, patch: Partial<Omit<DiagramNode, 'id' | 'type'>>): void {
    this.commit((d) => ({
      ...d,
      nodes: d.nodes.map((n) => (n.id === id ? { ...n, ...patch } : n)),
    }));
  }

  moveNodes(moves: readonly { id: string; position: Point }[]): void {
    const positions = new Map(moves.map((m) => [m.id, m.position]));
    this.commit((d) => ({
      ...d,
      nodes: d.nodes.map((n) =>
        positions.has(n.id) ? { ...n, position: positions.get(n.id)! } : n,
      ),
    }));
  }

  /** Connects two nodes; returns the new edge id, or `null` if the connection is not allowed. */
  connect(
    source: string,
    target: string,
    kind: EdgeKind = 'forward',
    ports: EdgePorts = {},
  ): string | null {
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
    const edge: DiagramEdge = { id, source, target, kind, ...ports };
    this.commit((d) => ({ ...d, edges: [...d.edges, edge] }));
    return id;
  }

  /**
   * Adds a node connected from `source` as a single undo step; returns the new node id,
   * or `null` if `source` is unknown or the connection is not allowed.
   */
  addConnectedNode(
    source: string,
    type: NodeType,
    position: Point,
    ports: EdgePorts = {},
  ): string | null {
    const { nodes, edges } = this._diagram();
    const from = nodes.find((n) => n.id === source);
    if (!from || !hasOutput(from.type) || !hasInput(type)) return null;
    const id = nextId(type, nodes);
    const node: DiagramNode = { id, type, name: DEFAULT_NAMES[type], position };
    const edge: DiagramEdge = {
      id: nextId('edge', edges),
      source,
      target: id,
      kind: 'forward',
      ...ports,
    };
    this.commit((d) => ({ nodes: [...d.nodes, node], edges: [...d.edges, edge] }));
    return id;
  }

  /** Removes nodes (and every edge attached to them) and edges. */
  remove(selection: { nodeIds?: readonly string[]; edgeIds?: readonly string[] }): void {
    const nodeIds = new Set(selection.nodeIds ?? []);
    const edgeIds = new Set(selection.edgeIds ?? []);
    if (nodeIds.size === 0 && edgeIds.size === 0) return;
    this.commit((d) => ({
      nodes: d.nodes.filter((n) => !nodeIds.has(n.id)),
      edges: d.edges.filter(
        (e) => !edgeIds.has(e.id) && !nodeIds.has(e.source) && !nodeIds.has(e.target),
      ),
    }));
  }
}
