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
  /**
   * Waypoints a transition's line has to pass, in canvas coordinates. Only for transitions that
   * cannot take the straight way between their two states: parallel ones (each goes through its
   * own label), loops and transitions outside the layout (they run around the diagram).
   */
  routes: ReadonlyMap<string, readonly Point[]>;
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
  if (isBar(node)) return { width: BAR_WIDTH, height: BAR_HEIGHT };
  if (isCompact(node)) return { width: 180, height: 48 };
  const rows =
    (node.activities?.length ?? 0) +
    (node.requests?.length ?? 0) +
    (node.timers?.length ?? 0) +
    (node.ignores?.length ?? 0) +
    (node.compensation ? 1 : 0);
  const base = CARD_HEADER + (rows ? rows * CHIP_ROW + 6 : 0);
  return { width: CARD_WIDTH, height: base + (expanded ? descriptionHeight(node) : 0) };
}

/** A join is a thick bar with its name and the events it waits for under it. */
export const isBar = (node: DiagramNode): boolean => node.type === 'join';
const BAR_WIDTH = 200;
const BAR_HEIGHT = 50;

/** The initial, the final, the "any" node and the join are small; only states are full cards. */
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

/**
 * Forward transitions that close a loop (they lead back to a state on the path to their source).
 * They would distort the layers, so the layout leaves them out and they are drawn like
 * compensation transitions. Found by depth-first search from the states nothing leads to, in node
 * order, so the same diagram always gives the same answer.
 */
export function backEdgeIds(diagram: Diagram): Set<string> {
  const outgoing = new Map<string, DiagramEdge[]>();
  const entered = new Set<string>();
  for (const e of diagram.edges) {
    if (e.kind !== 'forward') continue;
    outgoing.set(e.source, [...(outgoing.get(e.source) ?? []), e]);
    entered.add(e.target);
  }
  const back = new Set<string>();
  const done = new Set<string>();
  const onPath = new Set<string>();
  const visit = (id: string): void => {
    onPath.add(id);
    for (const e of outgoing.get(id) ?? []) {
      if (onPath.has(e.target)) back.add(e.id);
      else if (!done.has(e.target)) visit(e.target);
    }
    onPath.delete(id);
    done.add(id);
  };
  const roots = diagram.nodes.filter((n) => !entered.has(n.id));
  for (const { id } of [...roots, ...diagram.nodes]) if (!done.has(id)) visit(id);
  return back;
}

/** States several transitions leave. The "any" node and joins are not: they fan out by design. */
export function decisionIds(diagram: Diagram): Set<string> {
  const anyIds = new Set(
    diagram.nodes.filter((n) => n.type === 'any' || n.type === 'join').map((n) => n.id),
  );
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
 * edge labels, so they get room between the layers). Compensation transitions and transitions
 * that close a loop point backwards and would distort the layers, so they are left out.
 */
export function layoutDiagram(
  diagram: Diagram,
  expanded: ReadonlySet<string> = new Set(),
): DiagramLayoutResult {
  // A multigraph: several transitions between the same two states are separate edges.
  const graph = new dagre.graphlib.Graph({ multigraph: true });
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
  const back = backEdgeIds(diagram);
  const forward = diagram.edges.filter((e) => e.kind === 'forward' && !back.has(e.id));
  const labelSizes = new Map(forward.map((e) => [e.id, labelSize(e, diagram.direction)]));
  forward.forEach((e) =>
    graph.setEdge(e.source, e.target, { ...labelSizes.get(e.id)!, labelpos: 'c' }, e.id),
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
  const positions = new Map(diagram.nodes.map((n) => [n.id, topLeft(n.id)]));
  const slotList = sources.map((n) => ({
    id: slotId(n.id),
    sourceId: n.id,
    position: topLeft(slotId(n.id)),
  }));
  const labels = forward.map((e) => {
    const size = labelSizes.get(e.id)!;
    const { x, y } = graph.edge(e.source, e.target, e.id);
    return { id: labelId(e.id), edgeId: e.id, position: corner({ x, y }, size), size };
  });
  const routes = routeTransitions(diagram, back, positions, labels, sizes, slotList);
  return { positions, slots: slotList, labels, routes };
}

/** Room a loop on one state leaves beside it, and how far a lane runs from the diagram. */
const LOOP_GAP = 36;
const LANE_GAP = 40;
const LANE_STEP = 16;
/** Straight run out of / into a state before a loop turns. */
const STUB = 36;

function routeTransitions(
  diagram: Diagram,
  back: ReadonlySet<string>,
  positions: ReadonlyMap<string, Point>,
  labels: readonly TransitionLabel[],
  sizes: ReadonlyMap<string, Size>,
  slots: readonly AddSlot[],
): Map<string, Point[]> {
  const lr = diagram.direction === 'left-right';
  const rect = (id: string) => ({ ...positions.get(id)!, ...sizes.get(id)! });
  const routes = new Map<string, Point[]>();

  // Parallel transitions (same two states): each line goes through its own label.
  const parallel = new Map<string, TransitionLabel[]>();
  for (const label of labels) {
    const e = diagram.edges.find((x) => x.id === label.edgeId)!;
    const key = `${e.source}>${e.target}`;
    parallel.set(key, [...(parallel.get(key) ?? []), label]);
  }
  for (const group of parallel.values()) {
    if (group.length < 2) continue;
    for (const { edgeId, position, size } of group) {
      // The label box ends in the overhang of the "+"; the card is the rest.
      routes.set(edgeId, [
        lr
          ? { x: position.x + (size.width - INSERT_OVERHANG) / 2, y: position.y + size.height / 2 }
          : { x: position.x + size.width / 2, y: position.y + (size.height - INSERT_OVERHANG) / 2 },
      ]);
    }
  }

  // Everything else outside the layout runs around the diagram, in lanes beyond its edge.
  const boxes = [
    ...diagram.nodes.map((n) => rect(n.id)),
    ...labels.map((l) => ({ ...l.position, ...l.size })),
    ...slots.map((s) => ({ ...s.position, ...SLOT_SIZE })),
  ];
  const edgeOfDiagram = lr
    ? Math.max(...boxes.map((b) => b.y + b.height))
    : Math.max(...boxes.map((b) => b.x + b.width));
  /** Room the line needs beside its state or the diagram: half its label, which rides on it. */
  const room = (e: DiagramEdge, least: number): number => {
    if (!e.event) return least;
    const size = labelSize(e, diagram.direction);
    return Math.max(least, (lr ? size.height : size.width) / 2 + 16);
  };
  let lane = 0;
  for (const e of diagram.edges) {
    const outside = e.kind === 'compensation' || back.has(e.id);
    if (!outside || !positions.has(e.source) || !positions.has(e.target)) continue;
    const from = rect(e.source);
    const to = rect(e.target);
    if (e.source === e.target) {
      const gap = room(e, LOOP_GAP);
      routes.set(
        e.id,
        lr
          ? [
              { x: from.x + from.width + STUB, y: from.y + from.height + gap },
              { x: from.x - STUB, y: from.y + from.height + gap },
            ]
          : [
              { x: from.x + from.width + gap, y: from.y + from.height + STUB },
              { x: from.x + from.width + gap, y: from.y - STUB },
            ],
      );
      continue;
    }
    const far = edgeOfDiagram + room(e, LANE_GAP) + lane++ * LANE_STEP;
    routes.set(
      e.id,
      lr
        ? [
            { x: from.x + from.width + STUB, y: far },
            { x: to.x - STUB, y: far },
          ]
        : [
            { x: far, y: from.y + from.height + STUB },
            { x: far, y: to.y - STUB },
          ],
    );
  }
  return routes;
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
  readonly routes = computed(() => this.result().routes);
  /** Ids of states that several transitions leave: shown as decisions. */
  readonly decisions = computed(() => {
    return decisionIds(this.store.diagram());
  });
}
