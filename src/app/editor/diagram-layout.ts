import { Injectable, computed, inject } from '@angular/core';
import dagre from '@dagrejs/dagre';
import { Diagram, DiagramEdge, DiagramNode, Direction, Point, hasOutput } from '../model/diagram';
import { DiagramStore } from '../model/diagram-store';

export interface Size {
  width: number;
  height: number;
}

/** A "+" placeholder after a state, laid out like a node so it lines up with the graph. */
export interface AddSlot {
  id: string;
  sourceId: string;
  position: Point;
}

/** Where the label of a forward transition (its event, activities and "+") sits. */
export interface TransitionLabel {
  id: string;
  edgeId: string;
  position: Point;
  size: Size;
}

export interface DiagramLayoutResult {
  positions: ReadonlyMap<string, Point>;
  slots: readonly AddSlot[];
  labels: readonly TransitionLabel[];
}

export const SLOT_SIZE: Size = { width: 40, height: 40 };

const CARD_WIDTH = 260;
const CARD_HEADER = 58;
const CHIP_ROW = 24;
const NODE_GAP = 80;
// dagre puts edge labels in their own rank, so this is the gap node → label → node.
const LAYER_GAP = 60;

/** Transition label metrics; the label component draws to the same numbers. */
export const LABEL_ROW = 22;
export const LABEL_PADDING = 6;
/** The insert "+" overhangs the card by half its size, along the line. */
export const INSERT_OVERHANG = 13;
const INSERT_SIZE = 26;
const LABEL_CHAR_WIDTH = 6.6;
const LABEL_MIN_WIDTH = 110;
const LABEL_MAX_WIDTH = 240;

/**
 * Rendered size of a node. Cards are sized here rather than measured so the layout is known
 * before anything is drawn; the editor passes the same size to f-flow.
 */
export function nodeSize(node: DiagramNode): Size {
  if (node.type === 'start' || node.type === 'end') return { width: 180, height: 48 };
  const rows = node.compensation ? 1 : 0;
  return { width: CARD_WIDTH, height: CARD_HEADER + (rows ? rows * CHIP_ROW + 6 : 0) };
}

/** Rows of a transition label: the event and its source, then one per activity. */
export const labelRows = (edge: DiagramEdge): number =>
  (edge.event ? 1 : 0) + (edge.event && edge.eventSource ? 1 : 0) + (edge.activities?.length ?? 0);

/**
 * Size of a transition label: a card with its rows plus the overhanging "+", or just the "+"
 * when the transition has neither event nor activities.
 */
export function labelSize(edge: DiagramEdge, direction: Direction): Size {
  const rows = labelRows(edge);
  if (rows === 0) return { width: INSERT_SIZE, height: INSERT_SIZE };
  const texts = [
    edge.event ?? '',
    `from ${edge.eventSource ?? ''}`,
    ...(edge.activities ?? []).map((a) => `Publish ${a.name}`),
  ];
  const longest = Math.max(...texts.map((t) => t.length));
  const width = Math.min(
    LABEL_MAX_WIDTH,
    Math.max(LABEL_MIN_WIDTH, Math.ceil(44 + longest * LABEL_CHAR_WIDTH)),
  );
  const height = rows * LABEL_ROW + 2 * LABEL_PADDING;
  return direction === 'left-right'
    ? { width: width + INSERT_OVERHANG, height }
    : { width, height: height + INSERT_OVERHANG };
}

/** Number of forward transitions leaving each state. */
export function outgoingCounts(diagram: Diagram): Map<string, number> {
  const counts = new Map<string, number>();
  for (const e of diagram.edges) {
    if (e.kind === 'forward') counts.set(e.source, (counts.get(e.source) ?? 0) + 1);
  }
  return counts;
}

/**
 * States that get a "+" slot: those nothing follows yet, and decisions (states with several
 * transitions), which can always branch once more.
 */
export function slotSources(diagram: Diagram): DiagramNode[] {
  const counts = outgoingCounts(diagram);
  return diagram.nodes.filter((n) => hasOutput(n.type) && (counts.get(n.id) ?? 0) !== 1);
}

export const slotId = (sourceId: string): string => `slot:${sourceId}`;
export const labelId = (edgeId: string): string => `label:${edgeId}`;

/**
 * Lays out the forward graph with dagre, with the add slots and the transition labels (as dagre
 * edge labels, so they get room between the layers). Compensation transitions point backwards
 * and would distort the layers, so they are left out.
 */
export function layoutDiagram(diagram: Diagram): DiagramLayoutResult {
  const graph = new dagre.graphlib.Graph();
  graph.setGraph({
    rankdir: diagram.direction === 'left-right' ? 'LR' : 'TB',
    nodesep: NODE_GAP,
    ranksep: LAYER_GAP,
    ranker: 'network-simplex',
  });
  graph.setDefaultEdgeLabel(() => ({}));
  const sizes = new Map<string, Size>();
  const addNode = (id: string, size: Size) => {
    sizes.set(id, size);
    graph.setNode(id, { ...size });
  };
  diagram.nodes.forEach((n) => addNode(n.id, nodeSize(n)));
  const forward = diagram.edges.filter((e) => e.kind === 'forward');
  const labelSizes = new Map(forward.map((e) => [e.id, labelSize(e, diagram.direction)]));
  forward.forEach((e) =>
    graph.setEdge(e.source, e.target, { ...labelSizes.get(e.id)!, labelpos: 'c' }),
  );
  const sources = slotSources(diagram);
  sources.forEach((n) => {
    addNode(slotId(n.id), SLOT_SIZE);
    graph.setEdge(n.id, slotId(n.id));
  });

  dagre.layout(graph);

  // dagre places centres; f-flow positions are top-left corners.
  const corner = ({ x, y }: Point, { width, height }: Size): Point => ({
    x: x - width / 2,
    y: y - height / 2,
  });
  const topLeft = (id: string) => corner(graph.node(id), sizes.get(id)!);
  return {
    positions: new Map(diagram.nodes.map((n) => [n.id, topLeft(n.id)])),
    slots: sources.map((n) => ({
      id: slotId(n.id),
      sourceId: n.id,
      position: topLeft(slotId(n.id)),
    })),
    labels: forward.map((e) => {
      const size = labelSizes.get(e.id)!;
      const { x, y } = graph.edge(e.source, e.target);
      return { id: labelId(e.id), edgeId: e.id, position: corner({ x, y }, size), size };
    }),
  };
}

/** Layout of the store's diagram; recalculated after every change (incl. undo/redo). */
@Injectable()
export class DiagramLayout {
  private readonly store = inject(DiagramStore);
  private readonly result = computed(() => layoutDiagram(this.store.diagram()));

  readonly positions = computed(() => this.result().positions);
  readonly slots = computed(() => this.result().slots);
  readonly labels = computed(() => this.result().labels);
  /** Ids of states that several transitions leave: shown as decisions. */
  readonly decisions = computed(() => {
    const counts = outgoingCounts(this.store.diagram());
    return new Set([...counts].filter(([, n]) => n > 1).map(([id]) => id));
  });
}
