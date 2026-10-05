import { describeTimeline, diagramAlternative, diagramTitle } from './describe';
import {
  ACTIVITY_VERBS,
  backEdgeIds,
  DECISION_INFO,
  decisionIds,
  Diagram,
  DiagramEdge,
  DiagramNode,
  eventKindOf,
  eventLabel,
  INSERT_OVERHANG,
  isBar,
  isCompact,
  joinEventsOf,
  LABEL_PADDING,
  LABEL_ROW,
  labelRows,
  layoutDiagram,
  NODE_INFO,
  NodeColor,
  nodeSize,
  Point,
  Size,
  TimelineEntry,
  TimelineState,
  Direction,
  isHorizontal,
  isReversed,
  labelCard,
} from '@ariadne/core';

/**
 * Light theme tokens from styles.scss, written out: an exported file has no CSS variables to
 * resolve, so it must carry plain colours to look the same in a browser, on GitHub or in Inkscape.
 */
export const COLORS = {
  surface: '#ffffff',
  border: '#e2e5eb',
  line: '#868ea3',
  text: '#1a1c23',
  textSubtle: '#676c81',
  start: '#1dab52',
  step: '#3b82f6',
  decision: '#8b5cf6',
  any: '#64748b',
  timeout: '#d97706',
  reply: '#059669',
  composite: '#4f46e5',
  join: '#4f46e5',
  fault: '#dc2626',
  // The outcomes of a routing slip (ADR 0023): done like a reply, faulted like a fault.
  slipCompleted: '#059669',
  slipFaulted: '#dc2626',
  end: '#f43f5e',
  compensation: '#ce8408',
  command: '#2563eb',
  event: '#9333ea',
  external: '#0d9488',
  palette: {
    red: '#ef4444',
    orange: '#f76906',
    amber: '#ba8e06',
    green: '#1dab52',
    teal: '#12a796',
    blue: '#3b82f6',
    purple: '#8b5cf6',
    pink: '#ec4899',
  },
} as const;

type Palette = typeof COLORS;

/** `surfaceDim` -> `--ariadne-surface-dim`. */
const cssName = (path: string) =>
  `--ariadne-${path.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`;

/** The colours as `var(--ariadne-*, <today's value>)`, so a host can theme the SVG. */
function themable(colors: Palette): Palette {
  const wrap = (value: unknown, path: string): unknown =>
    typeof value === 'string'
      ? `var(${cssName(path)}, ${value})`
      : Object.fromEntries(
          Object.entries(value as object).map(([k, v]) => [k, wrap(v, path ? `${path}-${k}` : k)]),
        );
  return wrap(colors, '') as Palette;
}
const THEMABLE = themable(COLORS);

/**
 * The colours of the render in progress: plain hex, or CSS custom properties with the hex as
 * fallback. Rendering is synchronous, so `renderDiagramSvg` sets it for the duration of one call.
 */
let paint: Palette = COLORS;

const FONT = "system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";
const MARGIN = 24;
/** Straight run out of / into a node before a transition turns, as on the canvas. */
const STUB = 24;
/** How far a parallel transition runs before and after the label it passes through. */
const PARALLEL_JOG = 12;
const CORNER = 8;
const LANE_GAP = 14;
/** Average glyph widths (em) for the font stack; used to truncate text, as the canvas does. */
const CHAR_EM = 0.56;
const CHAR_EM_BOLD = 0.6;

export interface SvgExport {
  svg: string;
  width: number;
  height: number;
}

export interface SvgOptions {
  /** Prefixed to every `id` in the SVG (arrow markers), so several SVGs inline on one page do not clash. */
  idPrefix?: string;
  /** Colours as `var(--ariadne-*, <hex>)`, so a host can theme the SVG; plain hex colours without. */
  cssVariables?: boolean;
  /**
   * Wraps each state and transition in a group with `data-node-id` / `data-edge-id` and `data-kind`;
   * a transition has two (`data-part` `line` and `label`).
   */
  addressable?: boolean;
}

/**
 * Renders the diagram as a standalone SVG from the layout data (not from the DOM): states,
 * transitions with arrowheads and labels, compensation transitions dashed. Editor-only elements
 * ("+" slots, selection) are left out. Output is deterministic, so it diffs and snapshots well.
 */
export function renderDiagramSvg(diagram: Diagram, options: SvgOptions = {}): SvgExport {
  paint = options.cssVariables ? THEMABLE : COLORS;
  try {
    return renderSvg(diagram, options);
  } finally {
    paint = COLORS;
  }
}

function renderSvg(diagram: Diagram, options: SvgOptions): SvgExport {
  const prefix = options.idPrefix ?? '';
  /** A state's or transition's group, when the SVG is addressable. */
  const addressed = (attr: string, id: string, kind: string, inner: string, part = '') =>
    options.addressable
      ? `<g ${attr}="${esc(id)}" data-kind="${esc(kind)}"${part && ` data-part="${part}"`}>${inner}</g>`
      : inner;
  const { positions, labels, routes } = layoutDiagram(diagram);
  const lr = isHorizontal(diagram.direction);
  /** +1 when the flow runs down or right, -1 when it runs up or left (#113). */
  const sense = isReversed(diagram.direction) ? -1 : 1;
  const decisions = decisionIds(diagram);
  const back = backEdgeIds(diagram);
  const joins = joinEventsOf(diagram);
  const kindOf = eventKindOf(diagram);
  const nodes = new Map(diagram.nodes.map((n) => [n.id, n]));
  const rect = (id: string) => ({ ...positions.get(id)!, ...nodeSize(nodes.get(id)!) });
  /** A point from its position along the flow (`main`) and across it (`cross`). */
  const pt = (main: number, cross: number): Point =>
    lr ? { x: main, y: cross } : { x: cross, y: main };

  const labelOf = new Map(labels.map((l) => [l.edgeId, l]));
  const bounds = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  const grow = (x: number, y: number, w = 0, h = 0) => {
    bounds.minX = Math.min(bounds.minX, x);
    bounds.minY = Math.min(bounds.minY, y);
    bounds.maxX = Math.max(bounds.maxX, x + w);
    bounds.maxY = Math.max(bounds.maxY, y + h);
  };
  diagram.nodes.forEach((n) => {
    const r = rect(n.id);
    grow(r.x, r.y, r.width, r.height);
  });
  labels.forEach((l) => grow(l.position.x, l.position.y, l.size.width, l.size.height));

  // Compensation transitions run back along a lane beside the graph.
  const laneStart = lr ? bounds.maxY : bounds.maxX;
  let lanes = 0;
  const edgeSvg: string[] = [];
  const labelSvg: string[] = [];
  const anchors = (edge: DiagramEdge) => {
    const s = rect(edge.source);
    const t = rect(edge.target);
    // Out of the source on its downstream side, into the target on its upstream side.
    const down = sense > 0;
    return lr
      ? {
          out: { x: down ? s.x + s.width : s.x, y: s.y + s.height / 2 },
          in: { x: down ? t.x : t.x + t.width, y: t.y + t.height / 2 },
        }
      : {
          out: { x: s.x + s.width / 2, y: down ? s.y + s.height : s.y },
          in: { x: t.x + t.width / 2, y: down ? t.y : t.y + t.height },
        };
  };
  const mainOf = (p: Point) => (lr ? p.x : p.y);
  const crossOf = (p: Point) => (lr ? p.y : p.x);

  for (const edge of diagram.edges) {
    if (!nodes.has(edge.source) || !nodes.has(edge.target)) continue;
    const { out, in: inn } = anchors(edge);
    let points: Point[];
    let labelCentre: Point;
    if (edge.kind === 'forward' && !back.has(edge.id)) {
      const label = labelOf.get(edge.id);
      const mid = label
        ? mainOf(label.position) + (lr ? label.size.width : label.size.height) / 2
        : (mainOf(out) + mainOf(inn)) / 2;
      const through = routes.get(edge.id)?.[0];
      // Parallel transitions each go through their own label (the layout's one waypoint).
      points = through
        ? [
            out,
            pt(mainOf(through) - sense * PARALLEL_JOG, crossOf(out)),
            pt(mainOf(through) - sense * PARALLEL_JOG, crossOf(through)),
            pt(mainOf(through) + sense * PARALLEL_JOG, crossOf(through)),
            pt(mainOf(through) + sense * PARALLEL_JOG, crossOf(inn)),
            inn,
          ]
        : [out, pt(mid, crossOf(out)), pt(mid, crossOf(inn)), inn];
      labelCentre = label
        ? {
            x: label.position.x + label.size.width / 2,
            y: label.position.y + label.size.height / 2,
          }
        : pt(mid, (crossOf(out) + crossOf(inn)) / 2);
    } else {
      const lane = laneStart + MARGIN + lanes++ * LANE_GAP;
      const a = mainOf(out) + sense * STUB;
      const b = mainOf(inn) - sense * STUB;
      points = [out, pt(a, crossOf(out)), pt(a, lane), pt(b, lane), pt(b, crossOf(inn)), inn];
      labelCentre = pt((a + b) / 2, lane);
      const corner = pt(a, lane);
      grow(corner.x, corner.y);
    }
    // A timeout firing is dashed amber too, but dotted, so it differs from a compensation.
    const timeout = edge.kind === 'forward' && kindOf(edge) === 'timeout';
    const stroke =
      edge.kind === 'compensation' ? paint.compensation : timeout ? paint.timeout : paint.line;
    const dash =
      edge.kind === 'compensation'
        ? ' stroke-dasharray="6 4"'
        : timeout
          ? ' stroke-dasharray="2 5" stroke-linecap="round"'
          : '';
    edgeSvg.push(
      addressed(
        'data-edge-id',
        edge.id,
        edge.kind,
        `<path d="${roundedPath(points)}" fill="none" stroke="${stroke}" stroke-width="2"${dash} marker-end="url(#${prefix}arrow-${edge.kind})"/>`,
        'line',
      ),
    );
    if (labelRows(edge) > 0) {
      const label = transitionLabel(edge, labelCentre, diagram.direction, diagram);
      grow(label.x, label.y, label.width, label.height);
      labelSvg.push(addressed('data-edge-id', edge.id, edge.kind, label.svg, 'label'));
    }
  }

  const minX = bounds.minX - MARGIN;
  const minY = bounds.minY - MARGIN;
  const width = Math.ceil(bounds.maxX + MARGIN - minX);
  const height = Math.ceil(bounds.maxY + MARGIN - minY);

  const nodeSvg = diagram.nodes.map((n) => {
    const { x, y, width: w, height: h } = rect(n.id);
    return addressed(
      'data-node-id',
      n.id,
      n.type,
      stateSvg(n, x, y, { width: w, height: h }, decisions.has(n.id), joins.get(n.id) ?? []),
    );
  });

  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="${n(minX)} ${n(minY)} ${width} ${height}" font-family="${esc(FONT)}" role="img" aria-labelledby="${prefix}title ${prefix}desc">`,
    // The text alternative (WCAG 1.1.1): a title and a description, always, also for a screen reader.
    `<title id="${prefix}title">${esc(diagramTitle(diagram))}</title>`,
    `<desc id="${prefix}desc">${esc(diagramAlternative(diagram))}</desc>`,
    '<defs>',
    marker(prefix, 'forward', paint.line),
    marker(prefix, 'compensation', paint.compensation),
    '</defs>',
    ...edgeSvg,
    ...labelSvg,
    ...nodeSvg,
    '</svg>',
  ].join('\n');
  return { svg, width, height };
}

export interface TimelineSvgOptions extends SvgOptions {
  /** The title of the picture; "Path of the instance" without. */
  title?: string;
}

const TIMELINE_CARD = 52;

/**
 * The path of an instance as a standalone SVG, left to right (#376): the states it went through as
 * cards, the step that moved it on each arrow (number, event and its kind, guard, time, note), the
 * state it is in now emphasised, and where the path stopped. One row, as wide as the path is long: the
 * host scrolls. `entries` come from `pathTimeline` in `@ariadne/core`.
 */
export function renderTimelineSvg(
  diagram: Diagram,
  entries: readonly TimelineEntry[],
  options: TimelineSvgOptions = {},
): SvgExport {
  paint = options.cssVariables ? THEMABLE : COLORS;
  try {
    return timelineSvg(diagram, entries, options);
  } finally {
    paint = COLORS;
  }
}

function timelineSvg(
  diagram: Diagram,
  entries: readonly TimelineEntry[],
  options: TimelineSvgOptions,
): SvgExport {
  const prefix = options.idPrefix ?? '';
  const nodes = new Map(diagram.nodes.map((node) => [node.id, node]));
  const decisions = decisionIds(diagram);
  const addressed = (index: number, attrs: string, inner: string) =>
    options.addressable ? `<g data-timeline-index="${index}" ${attrs}>${inner}</g>` : inner;
  const cy = MARGIN + TIMELINE_CARD / 2;
  const parts: string[] = [];
  let x = MARGIN;
  let previousRight: number | undefined;

  entries.forEach((entry, index) => {
    if (entry.kind === 'state') {
      const node = nodes.get(entry.nodeId);
      const width = Math.min(220, Math.max(120, Math.ceil(68 + [...entry.name].length * 7.4)));
      if (previousRight !== undefined && x === previousRight) x += 40;
      parts.push(
        addressed(
          index,
          `data-node-id="${esc(entry.nodeId)}" data-kind="${esc(entry.type)}" data-status="${entry.status}"`,
          timelineState(entry, node, decisions.has(entry.nodeId), x, width),
        ),
      );
      x += width;
      previousRight = x;
    } else if (entry.kind === 'step') {
      const kind = entry.eventKind;
      const color = kind === 'internal' || !kind ? paint.event : paint[kind];
      const glyph =
        { timeout: '◷', reply: '↩', fault: '⚠', composite: '▬' }[kind as string] ?? '⚡';
      const event = entry.event ?? 'no event';
      const meta = [entry.at, entry.note].filter(Boolean).join(' · ');
      const longest = Math.max(
        [...`${entry.number}. ${event}`].length + 2,
        entry.guard ? [...entry.guard].length + 2 : 0,
        [...meta].length,
      );
      const width = Math.min(240, Math.max(96, Math.ceil(28 + longest * 6.4)));
      const textWidth = width - 20;
      const inner = [
        `<path d="M${n(x)} ${n(cy)}H${n(x + width - 2)}" fill="none" stroke="${paint.line}" stroke-width="1.5" marker-end="url(#${prefix}arrow-timeline)"/>`,
        text(`${entry.number}.`, x + 10, cy - 12, {
          size: 11,
          weight: 600,
          fill: paint.textSubtle,
        }),
        text(glyph, x + 10 + (String(entry.number).length + 1) * 7, cy - 12, {
          size: 11,
          fill: color,
        }),
        text(
          fit(event, textWidth - (String(entry.number).length + 3) * 7, 11),
          x + 10 + (String(entry.number).length + 3) * 7,
          cy - 12,
          { size: 11, fill: mix(color, paint.text, 0.75) },
        ),
      ];
      if (entry.guard) {
        inner.push(
          text(fit(`[${entry.guard}]`, textWidth, 10), x + 10, cy + 11, {
            size: 10,
            fill: paint.textSubtle,
          }),
        );
      }
      if (meta) {
        inner.push(
          text(fit(meta, textWidth, 10), x + 10, cy + (entry.guard ? 23 : 11), {
            size: 10,
            fill: paint.textSubtle,
          }),
        );
      }
      parts.push(
        addressed(
          index,
          `data-edge-id="${esc(entry.edgeId)}" data-kind="step" data-step="${entry.number}"`,
          `<g>${inner.join('')}</g>`,
        ),
      );
      x += width;
    } else {
      const width = Math.min(360, Math.max(140, Math.ceil(44 + [...entry.message].length * 6.4)));
      const lead = previousRight !== undefined ? 32 : 0;
      const box = x + lead;
      const inner = [
        `<title>${esc(entry.message)}</title>`,
        lead
          ? `<path d="M${n(x)} ${n(cy)}H${n(box)}" fill="none" stroke="${paint.fault}" stroke-width="1.5" stroke-dasharray="4 3"/>`
          : '',
        `<rect x="${n(box)}" y="${n(cy - 16)}" width="${width}" height="32" rx="8" fill="${mix(paint.fault, paint.surface, 0.08)}" stroke="${paint.fault}"/>`,
        text('⚠', box + 12, cy, { size: 12, fill: paint.fault }),
        text(fit(entry.message, width - 40, 11), box + 30, cy, {
          size: 11,
          fill: mix(paint.fault, paint.text, 0.6),
        }),
      ];
      parts.push(
        addressed(
          index,
          `data-kind="problem" data-step="${entry.number}"`,
          `<g>${inner.join('')}</g>`,
        ),
      );
      x = box + width;
    }
  });

  const width = Math.ceil(Math.max(x, MARGIN + 120) + MARGIN);
  const height = TIMELINE_CARD + 2 * MARGIN;
  const title = options.title ?? 'Path of the instance';
  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" font-family="${esc(FONT)}" role="img" aria-labelledby="${prefix}timeline-title ${prefix}timeline-desc">`,
    `<title id="${prefix}timeline-title">${esc(title)}</title>`,
    `<desc id="${prefix}timeline-desc">${esc(describeTimeline(entries))}</desc>`,
    '<defs>',
    marker(prefix, 'timeline', paint.line),
    '</defs>',
    ...(entries.length
      ? parts
      : [text('No path.', MARGIN, cy, { size: 12, fill: paint.textSubtle })]),
    '</svg>',
  ].join('\n');
  return { svg, width, height };
}

/** A state of the timeline: a smaller card than on the diagram, with how often and whether it is now. */
function timelineState(
  entry: TimelineState,
  node: DiagramNode | undefined,
  decision: boolean,
  x: number,
  width: number,
): string {
  const y = MARGIN;
  const color = node ? accent(node, decision) : paint.step;
  const emphasis =
    entry.status === 'current'
      ? `stroke="${color}" stroke-width="2"`
      : entry.status === 'finished'
        ? `stroke="${paint.end}" stroke-width="2"`
        : `stroke="${paint.border}"`;
  const fill = entry.status === 'current' ? mix(color, paint.surface, 0.08) : paint.surface;
  const note = [
    entry.status === 'current' ? 'now' : entry.status === 'finished' ? 'finished' : '',
    entry.visit > 1 ? `${ordinal(entry.visit)} time` : '',
  ]
    .filter(Boolean)
    .join(' · ');
  const textX = x + 42;
  const textWidth = width - 54;
  return [
    '<g>',
    `<rect x="${n(x)}" y="${n(y)}" width="${width}" height="${TIMELINE_CARD}" rx="10" fill="${fill}" ${emphasis}/>`,
    `<circle cx="${n(x + 22)}" cy="${n(y + TIMELINE_CARD / 2)}" r="13" fill="${mix(color, paint.surface, 0.12)}"/>`,
    node
      ? badgeGlyph(node, decision, x + 22, y + TIMELINE_CARD / 2, color)
      : `<circle cx="${n(x + 22)}" cy="${n(y + TIMELINE_CARD / 2)}" r="5" fill="${color}"/>`,
    text(fit(entry.name, textWidth, 13, true), textX, y + (note ? 19 : TIMELINE_CARD / 2), {
      size: 13,
      weight: 600,
      fill: paint.text,
    }),
    note
      ? text(fit(note, textWidth, 10), textX, y + 36, {
          size: 10,
          fill: entry.status === 'visited' ? paint.textSubtle : color,
        })
      : '',
    '</g>',
  ].join('');
}

const ordinal = (k: number): string => {
  const tens = k % 100;
  const suffix = tens >= 11 && tens <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' }[k % 10] ?? 'th');
  return `${k}${suffix}`;
};

function marker(prefix: string, kind: string, color: string): string {
  return `<marker id="${prefix}arrow-${kind}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="10" markerHeight="10" markerUnits="userSpaceOnUse" orient="auto"><path d="M1 1 L9 5 L1 9 z" fill="${color}"/></marker>`;
}

/** A polyline with rounded corners; the last segment stays straight so the arrowhead is true. */
function roundedPath(points: Point[]): string {
  const clean = points.filter(
    (p, i) => i === 0 || p.x !== points[i - 1].x || p.y !== points[i - 1].y,
  );
  let d = `M${n(clean[0].x)} ${n(clean[0].y)}`;
  for (let i = 1; i < clean.length - 1; i++) {
    const prev = clean[i - 1];
    const cur = clean[i];
    const next = clean[i + 1];
    const r = Math.min(CORNER, dist(prev, cur) / 2, dist(cur, next) / 2);
    const from = toward(cur, prev, r);
    const to = toward(cur, next, r);
    d += ` L${n(from.x)} ${n(from.y)} Q${n(cur.x)} ${n(cur.y)} ${n(to.x)} ${n(to.y)}`;
  }
  const last = clean[clean.length - 1];
  return `${d} L${n(last.x)} ${n(last.y)}`;
}

const dist = (a: Point, b: Point) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
function toward(from: Point, to: Point, by: number): Point {
  const len = dist(from, to) || 1;
  return { x: from.x + ((to.x - from.x) * by) / len, y: from.y + ((to.y - from.y) * by) / len };
}

function transitionLabel(
  edge: DiagramEdge,
  centre: Point,
  direction: Direction,
  diagram: Diagram,
): { svg: string } & Point & Size {
  const kind = eventKindOf(diagram)(edge);
  const rows = labelRows(edge);
  const height = rows * LABEL_ROW + 2 * LABEL_PADDING;
  const texts = [eventLabel(edge), edge.eventSource ? `from ${edge.eventSource}` : ''];
  const boxWidth = Math.min(
    240,
    Math.max(110, Math.ceil(44 + Math.max(...texts.map((t) => t.length)) * 6.6)),
  );
  // The layout box includes the "+" overhang, which is not drawn: the card is centred on its own.
  const card = { width: boxWidth, height };
  // The label's box is the card and the "+" overhanging it downstream; the card sits upstream in it.
  const lr = isHorizontal(direction);
  const box = lr
    ? { width: card.width + INSERT_OVERHANG, height: card.height }
    : { width: card.width, height: card.height + INSERT_OVERHANG };
  const { x, y } = labelCard(
    { x: centre.x - box.width / 2, y: centre.y - box.height / 2, ...box },
    direction,
  );
  const parts = [
    `<rect x="${n(x)}" y="${n(y)}" width="${card.width}" height="${card.height}" rx="8" fill="${paint.surface}" stroke="${paint.border}"/>`,
  ];
  const textWidth = card.width - 2 * 10 - 19;
  let rowY = y + LABEL_PADDING + LABEL_ROW / 2;
  if (edge.event) {
    const color = kind === 'internal' || !kind ? paint.event : paint[kind];
    const glyph = { timeout: '◷', reply: '↩', fault: '⚠', composite: '▬' }[kind as string] ?? '⚡';
    parts.push(
      text(glyph, x + 10, rowY, { size: 11, fill: color }),
      text(fit(eventLabel(edge), textWidth, 11), x + 29, rowY, {
        size: 11,
        fill: mix(color, paint.text, 0.75),
      }),
    );
    rowY += LABEL_ROW;
    if (edge.eventSource) {
      parts.push(
        text('↗', x + 10, rowY, { size: 11, fill: paint.external }),
        text(fit(`from ${edge.eventSource}`, textWidth, 11), x + 29, rowY, {
          size: 11,
          fill: paint.textSubtle,
        }),
      );
    }
  }
  return { svg: `<g>${parts.join('')}</g>`, x, y, ...card };
}

function stateSvg(
  node: DiagramNode,
  x: number,
  y: number,
  size: Size,
  decision: boolean,
  joinEvents: readonly string[],
): string {
  const color = accent(node, decision);
  if (isBar(node)) return barSvg(node, joinEvents, x, y, size, color);
  const compact = isCompact(node);
  const parts: string[] = [];
  const r = compact ? size.height / 2 : 8;
  if (compact) {
    const end = node.type === 'end';
    // The "any" node is drawn dashed: it is not a state the saga is in.
    const dash = node.type === 'any' ? ' stroke-dasharray="5 4"' : '';
    parts.push(
      `<rect x="${n(x)}" y="${n(y)}" width="${size.width}" height="${size.height}" rx="${r}" fill="${paint.surface}" stroke="${end ? color : node.type === 'any' ? paint.any : paint.border}" stroke-width="${end ? 2 : 1}"${dash}/>`,
    );
    if (end) {
      parts.push(
        `<rect x="${n(x + 4)}" y="${n(y + 4)}" width="${size.width - 8}" height="${size.height - 8}" rx="${r - 4}" fill="none" stroke="${mix(color, paint.surface, 0.55)}"/>`,
      );
    }
  } else {
    parts.push(
      `<rect x="${n(x)}" y="${n(y)}" width="${size.width}" height="${size.height}" rx="8" fill="${paint.surface}" stroke="${paint.border}"/>`,
      // Accent bar along the top edge, clipped to the card's rounded corners.
      `<path d="M${n(x)} ${n(y + 8)}Q${n(x)} ${n(y)} ${n(x + 8)} ${n(y)}H${n(x + size.width - 8)}Q${n(x + size.width)} ${n(y)} ${n(x + size.width)} ${n(y + 8)}V${n(y + 3)}H${n(x)}z" fill="${color}"/>`,
    );
  }
  const badgeX = x + (compact ? 8 : 12);
  const badgeY = compact ? y + (size.height - 30) / 2 : y + 10;
  parts.push(
    `<${compact ? 'circle' : 'rect'} ${
      compact
        ? `cx="${n(badgeX + 15)}" cy="${n(badgeY + 15)}" r="15"`
        : `x="${n(badgeX)}" y="${n(badgeY)}" width="30" height="30" rx="7"`
    } fill="${mix(color, paint.surface, 0.12)}"/>`,
    badgeGlyph(node, decision, badgeX + 15, badgeY + 15, color),
  );
  const textX = badgeX + 40;
  const textWidth = x + size.width - textX - 12;
  const label = (decision ? DECISION_INFO : NODE_INFO[node.type]).label.toUpperCase();
  if (compact) {
    parts.push(
      text(fit(node.name, textWidth, 13, true), textX, y + size.height / 2, {
        size: 13,
        weight: 600,
        fill: paint.text,
      }),
    );
  } else {
    parts.push(
      text(label, textX, badgeY + 6, { size: 10, weight: 700, fill: color, spacing: 0.4 }),
      text(fit(node.name, textWidth, 13, true), textX, badgeY + 22, {
        size: 13,
        weight: 600,
        fill: paint.text,
      }),
    );
  }
  let chipY = y + 50;
  const chip = (fill: string, body: string) => {
    parts.push(
      `<rect x="${n(x + 12)}" y="${n(chipY)}" width="${size.width - 24}" height="20" rx="5" fill="${mix(fill, paint.surface, 0.09)}"/>`,
      body,
    );
    chipY += 24;
  };
  const chipWidth = size.width - 24 - 16 - 19;
  for (const a of node.activities ?? []) {
    const color = a.kind === 'command' ? paint.command : paint.event;
    const verb = ACTIVITY_VERBS[a.kind];
    const name = fit(a.name, chipWidth - (verb.length + 1) * 11 * CHAR_EM, 11);
    chip(
      color,
      text(a.kind === 'command' ? '✉' : '⚑', x + 20, chipY + 10, { size: 11, fill: color }) +
        `<text x="${n(x + 39)}" y="${n(chipY + 10)}" font-size="11" font-weight="500" dominant-baseline="central" fill="${mix(color, paint.text, 0.8)}"><tspan fill="${paint.textSubtle}">${verb}</tspan> ${esc(name)}</text>`,
    );
  }
  for (const r of node.requests ?? []) {
    const label = fit(
      `${r.name}${r.timeout ? ` · ${r.timeout}` : ''}`,
      chipWidth - 8 * 11 * CHAR_EM,
      11,
    );
    chip(
      paint.command,
      text('✉', x + 20, chipY + 10, { size: 11, fill: paint.command }) +
        `<text x="${n(x + 39)}" y="${n(chipY + 10)}" font-size="11" font-weight="500" dominant-baseline="central" fill="${mix(paint.command, paint.text, 0.8)}"><tspan fill="${paint.textSubtle}">Request</tspan> ${esc(label)}</text>`,
    );
  }
  for (const t of node.timers ?? []) {
    const verb = t.action === 'schedule' ? 'Schedule' : 'Unschedule';
    const label = fit(
      `${t.name}${t.delay ? ` in ${t.delay}` : ''}`,
      chipWidth - (verb.length + 1) * 11 * CHAR_EM,
      11,
    );
    chip(
      paint.timeout,
      text('◷', x + 20, chipY + 10, { size: 11, fill: paint.timeout }) +
        `<text x="${n(x + 39)}" y="${n(chipY + 10)}" font-size="11" font-weight="500" dominant-baseline="central" fill="${mix(paint.timeout, paint.text, 0.8)}"><tspan fill="${paint.textSubtle}">${verb}</tspan> ${esc(label)}</text>`,
    );
  }
  for (const event of node.ignores ?? []) {
    chip(
      paint.textSubtle,
      text('⊘', x + 20, chipY + 10, { size: 11, fill: paint.textSubtle }) +
        `<text x="${n(x + 39)}" y="${n(chipY + 10)}" font-size="11" font-weight="500" dominant-baseline="central" text-decoration="line-through" fill="${paint.textSubtle}">${esc(fit(event, chipWidth, 11))}</text>`,
    );
  }
  if (node.compensation) {
    chip(
      paint.compensation,
      text('↺', x + 20, chipY + 10, { size: 11, fill: paint.compensation }) +
        text(fit(node.compensation.name, chipWidth, 11), x + 39, chipY + 10, {
          size: 11,
          weight: 500,
          fill: mix(paint.compensation, paint.text, 0.8),
        }),
    );
  }
  return `<g>${parts.join('')}</g>`;
}

/** A join: a thick bar, with its name and the events it waits for under it. */
function barSvg(
  node: DiagramNode,
  events: readonly string[],
  x: number,
  y: number,
  size: Size,
  color: string,
): string {
  const cx = x + size.width / 2;
  const width = size.width - 8;
  const combines = events.join(' + ') || 'no events yet';
  return `<g><rect x="${n(x)}" y="${n(y)}" width="${size.width}" height="10" rx="5" fill="${color}"/>${text(
    fit(node.name, width, 13, true),
    cx,
    y + 24,
    { size: 13, weight: 600, fill: paint.text, anchor: 'middle' },
  )}${text(fit(combines, width, 11), cx, y + 40, { size: 11, fill: paint.textSubtle, anchor: 'middle' })}</g>`;
}

/** A small shape standing in for the node type's icon. */
function badgeGlyph(
  node: DiagramNode,
  decision: boolean,
  cx: number,
  cy: number,
  color: string,
): string {
  if (decision)
    return `<path d="M${n(cx)} ${n(cy - 8)}L${n(cx + 8)} ${n(cy)}L${n(cx)} ${n(cy + 8)}L${n(cx - 8)} ${n(cy)}z" fill="${color}"/>`;
  if (node.type === 'start') return `<circle cx="${n(cx)}" cy="${n(cy)}" r="7" fill="${color}"/>`;
  if (node.type === 'any')
    return `<circle cx="${n(cx)}" cy="${n(cy)}" r="7" fill="none" stroke="${color}" stroke-width="2" stroke-dasharray="3 2"/>`;
  if (node.type === 'end') {
    return `<circle cx="${n(cx)}" cy="${n(cy)}" r="7" fill="none" stroke="${color}" stroke-width="2"/><circle cx="${n(cx)}" cy="${n(cy)}" r="3.5" fill="${color}"/>`;
  }
  return `<rect x="${n(cx - 7)}" y="${n(cy - 7)}" width="14" height="14" rx="3.5" fill="none" stroke="${color}" stroke-width="2"/>`;
}

function accent(node: DiagramNode, decision: boolean): string {
  const custom = node.color as NodeColor | undefined;
  if (custom)
    return custom.startsWith('#') ? custom : paint.palette[custom as keyof typeof paint.palette];
  if (decision) return paint.decision;
  return {
    start: paint.start,
    end: paint.end,
    state: paint.step,
    any: paint.any,
    join: paint.join,
  }[node.type];
}

interface TextStyle {
  size: number;
  fill: string;
  weight?: number;
  spacing?: number;
  anchor?: 'middle';
}

const text = (body: string, x: number, y: number, s: TextStyle): string =>
  `<text x="${n(x)}" y="${n(y)}" font-size="${s.size}"${s.weight ? ` font-weight="${s.weight}"` : ''}${
    s.spacing ? ` letter-spacing="${s.spacing}"` : ''
  }${s.anchor ? ` text-anchor="${s.anchor}"` : ''} dominant-baseline="central" fill="${s.fill}">${esc(body)}</text>`;

/** Truncates with an ellipsis so the text fits `width` px, like `text-overflow: ellipsis`. */
export function fit(value: string, width: number, size: number, bold = false): string {
  const max = Math.max(1, Math.floor(width / (size * (bold ? CHAR_EM_BOLD : CHAR_EM))));
  const chars = [...value];
  return chars.length <= max
    ? value
    : `${chars
        .slice(0, Math.max(0, max - 1))
        .join('')
        .trimEnd()}…`;
}

/** `a` over `b` at `amount`, as an opaque hex colour (SVG viewers differ on `color-mix`). */
function mix(a: string, b: string, amount: number): string {
  // Custom properties are only known to the browser, so it mixes them: `color-mix`.
  if (!a.startsWith('#') || !b.startsWith('#'))
    return `color-mix(in srgb, ${a} ${Math.round(amount * 100)}%, ${b})`;
  const [ra, ga, ba] = rgb(a);
  const [rb, gb, bb] = rgb(b);
  const channel = (p: number, q: number) =>
    Math.round(p * amount + q * (1 - amount))
      .toString(16)
      .padStart(2, '0');
  return `#${channel(ra, rb)}${channel(ga, gb)}${channel(ba, bb)}`;
}
const rgb = (hex: string): [number, number, number] =>
  [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];

/** Rounded to a tenth, so output is stable and compact. */
const n = (v: number): string => String(Math.round(v * 10) / 10);

const esc = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
