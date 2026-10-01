import { Injectable, computed, signal } from '@angular/core';
import {
  Diagram,
  DiagramEdge,
  DiagramNode,
  EdgeKind,
  NodeType,
  Point,
  emptyDiagram,
  nextId,
} from './diagram';

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

  readonly diagram = this._diagram.asReadonly();
  readonly nodes = computed(() => this._diagram().nodes);
  readonly edges = computed(() => this._diagram().edges);

  load(diagram: Diagram): void {
    this._diagram.set(diagram);
  }

  addNode(type: NodeType, position: Point): string {
    const id = nextId(type, this._diagram().nodes);
    const node: DiagramNode = { id, type, name: DEFAULT_NAMES[type], position };
    this._diagram.update((d) => ({ ...d, nodes: [...d.nodes, node] }));
    return id;
  }

  moveNodes(moves: readonly { id: string; position: Point }[]): void {
    const positions = new Map(moves.map((m) => [m.id, m.position]));
    this._diagram.update((d) => ({
      ...d,
      nodes: d.nodes.map((n) =>
        positions.has(n.id) ? { ...n, position: positions.get(n.id)! } : n,
      ),
    }));
  }

  /** Connects two nodes; returns the new edge id, or `null` if the connection is not allowed. */
  connect(source: string, target: string, kind: EdgeKind = 'forward'): string | null {
    const { nodes, edges } = this._diagram();
    const known = (id: string) => nodes.some((n) => n.id === id);
    if (source === target || !known(source) || !known(target)) return null;
    if (edges.some((e) => e.source === source && e.target === target && e.kind === kind)) {
      return null;
    }
    const id = nextId('edge', edges);
    const edge: DiagramEdge = { id, source, target, kind };
    this._diagram.update((d) => ({ ...d, edges: [...d.edges, edge] }));
    return id;
  }

  /** Removes nodes (and every edge attached to them) and edges. */
  remove(selection: { nodeIds?: readonly string[]; edgeIds?: readonly string[] }): void {
    const nodeIds = new Set(selection.nodeIds ?? []);
    const edgeIds = new Set(selection.edgeIds ?? []);
    this._diagram.update((d) => ({
      nodes: d.nodes.filter((n) => !nodeIds.has(n.id)),
      edges: d.edges.filter(
        (e) => !edgeIds.has(e.id) && !nodeIds.has(e.source) && !nodeIds.has(e.target),
      ),
    }));
  }
}
