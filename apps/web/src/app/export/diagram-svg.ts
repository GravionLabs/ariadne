import { DECISION, NODE_TYPES } from '../editor/node-types';
import {
  ACTIVITY_VERBS,
  backEdgeIds,
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
  NodeColor,
  nodeSize,
  Point,
  Size,
} from '@ariadne/core';

/**
 * Light theme tokens from styles.scss, written out: an exported file has no CSS variables to
 * resolve, so it must carry plain colours to look the same in a browser, on GitHub or in Inkscape.
 */
const COLORS = {
  surface: '#ffffff',
  border: '#e2e5eb',
  line: '#b0b5c3',
  text: '#1a1c23',
  textSubtle: '#6b7086',
  start: '#22c55e',
  step: '#3b82f6',
  decision: '#8b5cf6',
  any: '#64748b',
  timeout: '#d97706',
  reply: '#059669',
  composite: '#4f46e5',
  join: '#4f46e5',
  fault: '#dc2626',
  end: '#f43f5e',
  compensation: '#f59e0b',
  command: '#2563eb',
  event: '#9333ea',
  external: '#0d9488',
  palette: {
    red: '#ef4444',
    orange: '#f97316',
    amber: '#eab308',
    green: '#22c55e',
    teal: '#14b8a6',
    blue: '#3b82f6',
    purple: '#8b5cf6',
    pink: '#ec4899',
  },
} as const;

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

/**
 * Renders the diagram as a standalone SVG from the layout data (not from the DOM): states,
 * transitions with arrowheads and labels, compensation transitions dashed. Editor-only elements
 * ("+" slots, selection) are left out. Output is deterministic, so it diffs and snapshots well.
 */
export function renderDiagramSvg(diagram: Diagram): SvgExport {
  const { positions, labels, routes } = layoutDiagram(diagram);
  const lr = diagram.direction === 'left-right';
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
    return lr
      ? { out: { x: s.x + s.width, y: s.y + s.height / 2 }, in: { x: t.x, y: t.y + t.height / 2 } }
      : { out: { x: s.x + s.width / 2, y: s.y + s.height }, in: { x: t.x + t.width / 2, y: t.y } };
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
            pt(mainOf(through) - PARALLEL_JOG, crossOf(out)),
            pt(mainOf(through) - PARALLEL_JOG, crossOf(through)),
            pt(mainOf(through) + PARALLEL_JOG, crossOf(through)),
            pt(mainOf(through) + PARALLEL_JOG, crossOf(inn)),
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
      const a = mainOf(out) + STUB;
      const b = mainOf(inn) - STUB;
      points = [out, pt(a, crossOf(out)), pt(a, lane), pt(b, lane), pt(b, crossOf(inn)), inn];
      labelCentre = pt((a + b) / 2, lane);
      const corner = pt(a, lane);
      grow(corner.x, corner.y);
    }
    // A timeout firing is dashed amber too, but dotted, so it differs from a compensation.
    const timeout = edge.kind === 'forward' && kindOf(edge) === 'timeout';
    const stroke =
      edge.kind === 'compensation' ? COLORS.compensation : timeout ? COLORS.timeout : COLORS.line;
    const dash =
      edge.kind === 'compensation'
        ? ' stroke-dasharray="6 4"'
        : timeout
          ? ' stroke-dasharray="2 5" stroke-linecap="round"'
          : '';
    edgeSvg.push(
      `<path d="${roundedPath(points)}" fill="none" stroke="${stroke}" stroke-width="2"${dash} marker-end="url(#arrow-${edge.kind})"/>`,
    );
    if (labelRows(edge) > 0) {
      const label = transitionLabel(edge, labelCentre, lr, diagram);
      grow(label.x, label.y, label.width, label.height);
      labelSvg.push(label.svg);
    }
  }

  const minX = bounds.minX - MARGIN;
  const minY = bounds.minY - MARGIN;
  const width = Math.ceil(bounds.maxX + MARGIN - minX);
  const height = Math.ceil(bounds.maxY + MARGIN - minY);

  const nodeSvg = diagram.nodes.map((n) => {
    const { x, y, width: w, height: h } = rect(n.id);
    return stateSvg(n, x, y, { width: w, height: h }, decisions.has(n.id), joins.get(n.id) ?? []);
  });

  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="${n(minX)} ${n(minY)} ${width} ${height}" font-family="${esc(FONT)}">`,
    ...(diagram.name?.trim() ? [`<title>${esc(diagram.name.trim())}</title>`] : []),
    ...(diagram.description?.trim() ? [`<desc>${esc(diagram.description.trim())}</desc>`] : []),
    '<defs>',
    marker('forward', COLORS.line),
    marker('compensation', COLORS.compensation),
    '</defs>',
    ...edgeSvg,
    ...labelSvg,
    ...nodeSvg,
    '</svg>',
  ].join('\n');
  return { svg, width, height };
}

function marker(kind: string, color: string): string {
  return `<marker id="arrow-${kind}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="10" markerHeight="10" markerUnits="userSpaceOnUse" orient="auto"><path d="M1 1 L9 5 L1 9 z" fill="${color}"/></marker>`;
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
  lr: boolean,
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
  const x = centre.x - (lr ? (card.width + INSERT_OVERHANG) / 2 : card.width / 2);
  const y = centre.y - (lr ? card.height / 2 : (card.height + INSERT_OVERHANG) / 2);
  const parts = [
    `<rect x="${n(x)}" y="${n(y)}" width="${card.width}" height="${card.height}" rx="8" fill="${COLORS.surface}" stroke="${COLORS.border}"/>`,
  ];
  const textWidth = card.width - 2 * 10 - 19;
  let rowY = y + LABEL_PADDING + LABEL_ROW / 2;
  if (edge.event) {
    const color = kind === 'internal' || !kind ? COLORS.event : COLORS[kind];
    const glyph = { timeout: '⏱', reply: '↩', fault: '⚠', composite: '▬' }[kind as string] ?? '⚡';
    parts.push(
      text(glyph, x + 10, rowY, { size: 11, fill: color }),
      text(fit(eventLabel(edge), textWidth, 11), x + 29, rowY, {
        size: 11,
        fill: mix(color, COLORS.text, 0.75),
      }),
    );
    rowY += LABEL_ROW;
    if (edge.eventSource) {
      parts.push(
        text('↗', x + 10, rowY, { size: 11, fill: COLORS.external }),
        text(fit(`from ${edge.eventSource}`, textWidth, 11), x + 29, rowY, {
          size: 11,
          fill: COLORS.textSubtle,
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
      `<rect x="${n(x)}" y="${n(y)}" width="${size.width}" height="${size.height}" rx="${r}" fill="${COLORS.surface}" stroke="${end ? color : node.type === 'any' ? COLORS.any : COLORS.border}" stroke-width="${end ? 2 : 1}"${dash}/>`,
    );
    if (end) {
      parts.push(
        `<rect x="${n(x + 4)}" y="${n(y + 4)}" width="${size.width - 8}" height="${size.height - 8}" rx="${r - 4}" fill="none" stroke="${mix(color, COLORS.surface, 0.55)}"/>`,
      );
    }
  } else {
    parts.push(
      `<rect x="${n(x)}" y="${n(y)}" width="${size.width}" height="${size.height}" rx="8" fill="${COLORS.surface}" stroke="${COLORS.border}"/>`,
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
    } fill="${mix(color, COLORS.surface, 0.12)}"/>`,
    badgeGlyph(node, decision, badgeX + 15, badgeY + 15, color),
  );
  const textX = badgeX + 40;
  const textWidth = x + size.width - textX - 12;
  const label = (decision ? DECISION : NODE_TYPES[node.type]).label.toUpperCase();
  if (compact) {
    parts.push(
      text(fit(node.name, textWidth, 13, true), textX, y + size.height / 2, {
        size: 13,
        weight: 600,
        fill: COLORS.text,
      }),
    );
  } else {
    parts.push(
      text(label, textX, badgeY + 6, { size: 10, weight: 700, fill: color, spacing: 0.4 }),
      text(fit(node.name, textWidth, 13, true), textX, badgeY + 22, {
        size: 13,
        weight: 600,
        fill: COLORS.text,
      }),
    );
  }
  let chipY = y + 50;
  const chip = (fill: string, body: string) => {
    parts.push(
      `<rect x="${n(x + 12)}" y="${n(chipY)}" width="${size.width - 24}" height="20" rx="5" fill="${mix(fill, COLORS.surface, 0.09)}"/>`,
      body,
    );
    chipY += 24;
  };
  const chipWidth = size.width - 24 - 16 - 19;
  for (const a of node.activities ?? []) {
    const color = a.kind === 'command' ? COLORS.command : COLORS.event;
    const verb = ACTIVITY_VERBS[a.kind];
    const name = fit(a.name, chipWidth - (verb.length + 1) * 11 * CHAR_EM, 11);
    chip(
      color,
      text(a.kind === 'command' ? '✉' : '⚑', x + 20, chipY + 10, { size: 11, fill: color }) +
        `<text x="${n(x + 39)}" y="${n(chipY + 10)}" font-size="11" font-weight="500" dominant-baseline="central" fill="${mix(color, COLORS.text, 0.8)}"><tspan fill="${COLORS.textSubtle}">${verb}</tspan> ${esc(name)}</text>`,
    );
  }
  for (const r of node.requests ?? []) {
    const label = fit(
      `${r.name}${r.timeout ? ` · ${r.timeout}` : ''}`,
      chipWidth - 8 * 11 * CHAR_EM,
      11,
    );
    chip(
      COLORS.command,
      text('✉', x + 20, chipY + 10, { size: 11, fill: COLORS.command }) +
        `<text x="${n(x + 39)}" y="${n(chipY + 10)}" font-size="11" font-weight="500" dominant-baseline="central" fill="${mix(COLORS.command, COLORS.text, 0.8)}"><tspan fill="${COLORS.textSubtle}">Request</tspan> ${esc(label)}</text>`,
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
      COLORS.timeout,
      text('⏱', x + 20, chipY + 10, { size: 11, fill: COLORS.timeout }) +
        `<text x="${n(x + 39)}" y="${n(chipY + 10)}" font-size="11" font-weight="500" dominant-baseline="central" fill="${mix(COLORS.timeout, COLORS.text, 0.8)}"><tspan fill="${COLORS.textSubtle}">${verb}</tspan> ${esc(label)}</text>`,
    );
  }
  for (const event of node.ignores ?? []) {
    chip(
      COLORS.textSubtle,
      text('⊘', x + 20, chipY + 10, { size: 11, fill: COLORS.textSubtle }) +
        `<text x="${n(x + 39)}" y="${n(chipY + 10)}" font-size="11" font-weight="500" dominant-baseline="central" text-decoration="line-through" fill="${COLORS.textSubtle}">${esc(fit(event, chipWidth, 11))}</text>`,
    );
  }
  if (node.compensation) {
    chip(
      COLORS.compensation,
      text('↺', x + 20, chipY + 10, { size: 11, fill: COLORS.compensation }) +
        text(fit(node.compensation.name, chipWidth, 11), x + 39, chipY + 10, {
          size: 11,
          weight: 500,
          fill: mix(COLORS.compensation, COLORS.text, 0.8),
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
    { size: 13, weight: 600, fill: COLORS.text, anchor: 'middle' },
  )}${text(fit(combines, width, 11), cx, y + 40, { size: 11, fill: COLORS.textSubtle, anchor: 'middle' })}</g>`;
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
    return custom.startsWith('#') ? custom : COLORS.palette[custom as keyof typeof COLORS.palette];
  if (decision) return COLORS.decision;
  return {
    start: COLORS.start,
    end: COLORS.end,
    state: COLORS.step,
    any: COLORS.any,
    join: COLORS.join,
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
