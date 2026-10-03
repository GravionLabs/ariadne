import { Injectable, computed, inject, signal } from '@angular/core';
import dagre from '@dagrejs/dagre';
import {
  Diagram,
  DiagramEdge,
  DiagramNode,
  Direction,
  Point,
  eventLabel,
  hasOutput,
} from '../model/diagram';
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
// Unfolded description: a text box under the heading; the card's scss uses the same numbers.
const DESCRIPTION_GAP = 10;
const DESCRIPTION_PADDING = 8;
const DESCRIPTION_LINE = 17;
const DESCRIPTION_LINE_CHARS = 32;
const DESCRIPTION_MAX_LINES = 8;
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
export function nodeSize(node: DiagramNode, expanded = false): Size {
  if (isCompact(node)) return { width: 180, height: 48 };
  const rows =
    (node.activities?.length ?? 0) + (node.ignores?.length ?? 0) + (node.compensation ? 1 : 0);
  const base = CARD_HEADER + (rows ? rows * CHIP_ROW + 6 : 0);
  return { width: CARD_WIDTH, height: base + (expanded ? descriptionHeight(node) : 0) };
}

/** The initial, the final and the "any" node are small pills; only states are full cards. */
export const isCompact = (node: DiagramNode): boolean => node.type !== 'state';

/** Whether a node's card can unfold its description. */
export const canExpand = (node: DiagramNode): boolean =>
  node.type === 'state' && !!node.description;

/** Height the unfolded description adds; the card draws to the same numbers. */
function descriptionHeight(node: DiagramNode): number {
  if (!canExpand(node)) return 0;
  const lines = node
    .description!.split('\n')
    .reduce((sum, line) => sum + Math.max(1, Math.ceil(line.length / DESCRIPTION_LINE_CHARS)), 0);
  return (
    DESCRIPTION_GAP +
    2 * DESCRIPTION_PADDING +
    Math.min(lines, DESCRIPTION_MAX_LINES) * DESCRIPTION_LINE
  );
}

/** Rows of a transition label: the event, then its source. */
export const labelRows = (edge: DiagramEdge): number =>
  (edge.event ? 1 : 0) + (edge.event && edge.eventSource ? 1 : 0);

/**
 * Size of a transition label: a card with its rows plus the overhanging "+", or just the "+"
 * when the transition has no event.
 */
export function labelSize(edge: DiagramEdge, direction: Direction): Size {
  const rows = labelRows(edge);
  if (rows === 0) return { width: INSERT_SIZE, height: INSERT_SIZE };
  const texts = [eventLabel(edge), edge.eventSource ? `from ${edge.eventSource}` : ''];
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

/** States several transitions leave. The "any" node is not one: it fans out by design. */
export function decisionIds(diagram: Diagram): Set<string> {
  const anyIds = new Set(diagram.nodes.filter((n) => n.type === 'any').map((n) => n.id));
  return new Set(
    [...outgoingCounts(diagram)].filter(([id, n]) => n > 1 && !anyIds.has(id)).map(([id]) => id),
  );
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
export function layoutDiagram(
  diagram: Diagram,
  expanded: ReadonlySet<string> = new Set(),
): DiagramLayoutResult {
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
  diagram.nodes.forEach((n) => addNode(n.id, nodeSize(n, expanded.has(n.id))));
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
  /** Ids of nodes whose description is unfolded. View state: not saved, not undoable. */
  private readonly _expanded = signal<ReadonlySet<string>>(new Set());
  private readonly result = computed(() => layoutDiagram(this.store.diagram(), this._expanded()));

  readonly expanded = this._expanded.asReadonly();

  toggleExpanded(id: string): void {
    this._expanded.update((s) => {
      const next = new Set(s);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  }

  readonly positions = computed(() => this.result().positions);
  readonly slots = computed(() => this.result().slots);
  readonly labels = computed(() => this.result().labels);
  /** Ids of states that several transitions leave: shown as decisions. */
  readonly decisions = computed(() => {
    return decisionIds(this.store.diagram());
  });
}
