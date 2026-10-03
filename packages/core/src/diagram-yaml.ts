import { parse, stringify } from 'yaml';
import {
  Diagram,
  EventInfo,
  DiagramEdge,
  DiagramNode,
  Direction,
  EdgeKind,
  MESSAGE_KINDS,
  Activity,
  MessageKind,
  NODE_COLORS,
  NodeColor,
  isNodeColor,
  NodeType,
  hasActivities,
  hasIgnores,
  hasRequests,
  hasTimers,
  Request,
  SagaInfo,
  Timer,
} from './diagram';

/** Current version of the file format; see docs/specs/diagram-format.md. */
export const FORMAT_VERSION = 3;
/**
 * Versions the reader accepts:
 * - version 1: positions and ports are read and ignored, `step` and `decision` nodes become states;
 * - version 2: activities written on transitions move onto the state each one leads into
 *   (ADR 0005).
 */
const READABLE_VERSIONS: readonly number[] = [1, 2, 3];

const NODE_TYPES: readonly NodeType[] = ['start', 'end', 'state', 'any', 'join'];
/** Version 1 node types; both are plain states now (a decision is a state with branches). */
const V1_STATE_TYPES = ['step', 'decision'];
const EDGE_KINDS: readonly EdgeKind[] = ['forward', 'compensation'];
const DIRECTIONS: readonly Direction[] = ['top-bottom', 'left-right'];

/** Thrown when a file is not a valid Ariadne diagram; the message is shown to the user. */
export class DiagramFormatError extends Error {
  override readonly name = 'DiagramFormatError';
}

/**
 * Serializes a diagram to YAML. Output is deterministic: fixed key order, element order
 * as in the model, absent optional fields omitted. Layout is derived, so no positions.
 */
export function serializeDiagram(diagram: Diagram): string {
  const file = {
    version: FORMAT_VERSION,
    name: diagram.name,
    description: diagram.description,
    saga: serializeSaga(diagram.saga),
    events: diagram.events?.length
      ? diagram.events.map((e) => withoutUndefined({ ...e }))
      : undefined,
    direction: diagram.direction,
    nodes: diagram.nodes.map(serializeNode),
    edges: diagram.edges.map(({ id, source, target, kind, event, eventSource, guard }) =>
      withoutUndefined({ id, source, target, kind, event, eventSource, guard }),
    ),
  };
  return stringify(withoutUndefined(file), { lineWidth: 0 });
}

/** The saga block in the file: `class` for `className`, `instance` for `instanceType`; `source` is last. */
function serializeSaga(saga: SagaInfo | undefined): Record<string, unknown> | undefined {
  if (!saga) return undefined;
  const block = withoutUndefined({
    class: saga.className,
    namespace: saga.namespace,
    instance: saga.instanceType,
    stateProperty: saga.stateProperty,
    contractsNamespace: saga.contractsNamespace,
    source: saga.source,
  });
  return Object.keys(block).length ? block : undefined;
}

function serializeNode(node: DiagramNode): Record<string, unknown> {
  return withoutUndefined({
    id: node.id,
    type: node.type,
    name: node.name,
    description: node.description,
    color: node.color,
    // Compact one-key form: `- command: ChargePayment` / `- event: OrderShipped`.
    activities: node.activities?.length
      ? node.activities.map(({ kind, name }) => ({ [kind]: name }))
      : undefined,
    ignores: node.ignores?.length ? node.ignores : undefined,
    requests: node.requests?.length
      ? node.requests.map(({ name, timeout }) => withoutUndefined({ request: name, timeout }))
      : undefined,
    timers: node.timers?.length
      ? node.timers.map(({ action, name, delay }) => withoutUndefined({ [action]: name, delay }))
      : undefined,
    retry: node.retry,
    timeout: node.timeout,
    compensation: node.compensation && withoutUndefined({ ...node.compensation }),
  });
}

/** A parsed diagram plus what the reader changed to bring an older file up to date. */
export interface ParsedDiagram {
  diagram: Diagram;
  /** Human-readable notes about migrations; empty for files in the current version. */
  notes: string[];
}

/** Parses and validates a YAML diagram file. */
export function parseDiagram(text: string): Diagram {
  return parseDiagramWithNotes(text).diagram;
}

/** Like {@link parseDiagram}, and reports migrations of older files so they can be shown. */
export function parseDiagramWithNotes(text: string): ParsedDiagram {
  let file: unknown;
  try {
    file = parse(text);
  } catch (e) {
    throw new DiagramFormatError(`Not valid YAML: ${(e as Error).message}`);
  }
  const root = asRecord(file, 'file');
  if (!READABLE_VERSIONS.includes(root['version'] as number)) {
    throw new DiagramFormatError(
      `Unsupported format version ${JSON.stringify(root['version'])} (expected ${FORMAT_VERSION})`,
    );
  }
  const direction = root['direction'] ?? 'top-bottom';
  if (!DIRECTIONS.includes(direction as Direction)) {
    throw new DiagramFormatError(`direction must be one of ${DIRECTIONS.join(', ')}`);
  }
  const version = root['version'] as number;
  const nodes = asArray(root['nodes'] ?? [], 'nodes').map((n, i) => parseNode(n, i, version));
  if (nodes.filter((n) => n.type === 'any').length > 1) {
    throw new DiagramFormatError('There can be only one node of type "any"');
  }
  const ids = new Set<string>();
  for (const { id } of nodes) {
    if (ids.has(id)) throw new DiagramFormatError(`Duplicate node id "${id}"`);
    ids.add(id);
  }
  const parsedEdges = asArray(root['edges'] ?? [], 'edges').map((e, i) =>
    parseEdge(e, i, ids, version),
  );
  const edges = parsedEdges.map((p) => p.edge);
  const notes = version < 3 ? moveActivitiesToStates(nodes, parsedEdges) : [];
  const name = optionalString(root['name'], 'name')?.trim() || undefined;
  const description = optionalString(root['description'], 'description')?.trim() || undefined;
  const saga = parseSaga(root['saga']);
  const events = parseEvents(root['events']);
  return {
    diagram: withoutUndefined({
      name,
      description,
      saga,
      events,
      direction: direction as Direction,
      nodes,
      edges,
    }),
    notes,
  };
}

/**
 * Version 2 wrote activities on transitions. They now belong to the state the transition leads
 * into: moved in edge order, without duplicates (ADR 0005). A final state cannot have any, so
 * what a transition into one did is dropped, and the notes say so.
 */
function moveActivitiesToStates(nodes: DiagramNode[], parsed: ParsedEdge[]): string[] {
  const moved = new Map<string, Activity[]>();
  for (const { edge, activities } of parsed) {
    if (activities.length === 0) continue;
    const list = moved.get(edge.target) ?? [];
    for (const a of activities) {
      if (!list.some((b) => b.kind === a.kind && b.name === a.name)) list.push(a);
    }
    moved.set(edge.target, list);
  }
  const received: string[] = [];
  const dropped: string[] = [];
  for (const node of nodes) {
    const list = moved.get(node.id);
    if (!list) continue;
    if (hasActivities(node.type)) {
      node.activities = [...(node.activities ?? []), ...list];
      received.push(`"${node.name}"`);
    } else {
      const what = list.map((a) => `${a.kind === 'command' ? 'send' : 'publish'} ${a.name}`);
      dropped.push(`"${node.name}" (${what.join(', ')})`);
    }
  }
  const notes: string[] = [];
  if (received.length) {
    notes.push(
      `Activities (send command / publish event) moved from transitions onto the state they lead into: ${received.join(', ')}.`,
    );
  }
  if (dropped.length) {
    notes.push(
      `Final and initial states cannot have activities, so these were dropped: ${dropped.join('; ')}. Add them to a state if they are still needed.`,
    );
  }
  return notes;
}

function parseSaga(value: unknown): SagaInfo | undefined {
  if (value === undefined) return undefined;
  const block = asRecord(value, 'saga');
  const text = (key: string) => optionalString(block[key], `saga.${key}`)?.trim() || undefined;
  const saga = withoutUndefined<SagaInfo>({
    className: text('class'),
    namespace: text('namespace'),
    instanceType: text('instance'),
    stateProperty: text('stateProperty'),
    contractsNamespace: text('contractsNamespace'),
    source: text('source'),
  });
  return Object.keys(saga).length ? saga : undefined;
}

function parseEvents(value: unknown): EventInfo[] | undefined {
  if (value === undefined) return undefined;
  const seen = new Set<string>();
  const events = asArray(value, 'events').map((item, i): EventInfo => {
    const at = `events[${i}]`;
    const entry = asRecord(item, at);
    const name = asString(entry['name'], `${at}.name`);
    if (seen.has(name))
      throw new DiagramFormatError(`${at}: the event "${name}" is described twice`);
    seen.add(name);
    return withoutUndefined({
      name,
      messageType: optionalString(entry['messageType'], `${at}.messageType`)?.trim() || undefined,
      correlation: optionalString(entry['correlation'], `${at}.correlation`)?.trim() || undefined,
    });
  });
  return events.length ? events : undefined;
}

function parseNode(value: unknown, index: number, version: number): DiagramNode {
  const at = `nodes[${index}]`;
  const node = asRecord(value, at);
  const type =
    version === 1 && V1_STATE_TYPES.includes(node['type'] as string) ? 'state' : node['type'];
  if (!NODE_TYPES.includes(type as NodeType)) {
    throw new DiagramFormatError(`${at}.type must be one of ${NODE_TYPES.join(', ')}`);
  }
  const color = node['color'];
  if (color !== undefined && !isNodeColor(color)) {
    throw new DiagramFormatError(
      `${at}.color must be one of ${NODE_COLORS.join(', ')} or a #rrggbb value`,
    );
  }
  const compensation =
    node['compensation'] === undefined
      ? undefined
      : asRecord(node['compensation'], `${at}.compensation`);
  if (node['activities'] !== undefined && !hasActivities(type as NodeType)) {
    throw new DiagramFormatError(
      `${at}.activities is only allowed on states, not on the ${{ end: 'final state', start: 'initial state', any: '"any" node', join: 'join' }[type as string]}`,
    );
  }
  if (node['ignores'] !== undefined && !hasIgnores(type as NodeType)) {
    throw new DiagramFormatError(`${at}.ignores is only allowed on states`);
  }
  const ignores =
    node['ignores'] === undefined
      ? undefined
      : asArray(node['ignores'], `${at}.ignores`).map((e, i) => asString(e, `${at}.ignores[${i}]`));
  if (node['requests'] !== undefined && !hasRequests(type as NodeType)) {
    throw new DiagramFormatError(`${at}.requests is only allowed on states`);
  }
  const requests =
    node['requests'] === undefined
      ? undefined
      : asArray(node['requests'], `${at}.requests`).map((r, i) =>
          parseRequest(r, `${at}.requests[${i}]`),
        );
  if (node['timers'] !== undefined && !hasTimers(type as NodeType)) {
    throw new DiagramFormatError(`${at}.timers is only allowed on states`);
  }
  const timers =
    node['timers'] === undefined
      ? undefined
      : asArray(node['timers'], `${at}.timers`).map((t, i) => parseTimer(t, `${at}.timers[${i}]`));
  const activities =
    node['activities'] === undefined
      ? undefined
      : asArray(node['activities'], `${at}.activities`).map((a, i) =>
          parseActivity(a, `${at}.activities[${i}]`),
        );
  return withoutUndefined({
    id: asString(node['id'], `${at}.id`),
    type: type as NodeType,
    name: asString(node['name'], `${at}.name`),
    description: optionalString(node['description'], `${at}.description`),
    color: color as NodeColor | undefined,
    activities: activities?.length ? activities : undefined,
    ignores: ignores?.length ? ignores : undefined,
    requests: requests?.length ? requests : undefined,
    timers: timers?.length ? timers : undefined,
    retry: optionalString(node['retry'], `${at}.retry`),
    timeout: optionalString(node['timeout'], `${at}.timeout`),
    compensation:
      compensation &&
      withoutUndefined({
        name: asString(compensation['name'], `${at}.compensation.name`),
        description: optionalString(compensation['description'], `${at}.compensation.description`),
      }),
  }) as DiagramNode;
}

function parseRequest(value: unknown, at: string): Request {
  const entry = asRecord(value, at);
  if (entry['request'] === undefined)
    throw new DiagramFormatError(`${at} must be "request: <Name>"`);
  const timeout = optionalString(entry['timeout'], `${at}.timeout`)?.trim();
  return withoutUndefined({
    name: asString(entry['request'], `${at}.request`),
    timeout: timeout || undefined,
  });
}

const TIMER_ACTIONS = ['schedule', 'unschedule'] as const;

function parseTimer(value: unknown, at: string): Timer {
  const entry = asRecord(value, at);
  const actions = TIMER_ACTIONS.filter((a) => entry[a] !== undefined);
  if (actions.length !== 1) {
    throw new DiagramFormatError(`${at} must be "schedule: <Name>" or "unschedule: <Name>"`);
  }
  const [action] = actions;
  const delay = optionalString(entry['delay'], `${at}.delay`)?.trim();
  if (delay && action === 'unschedule') {
    throw new DiagramFormatError(`${at}.delay is only allowed with schedule`);
  }
  return withoutUndefined({
    action,
    name: asString(entry[action], `${at}.${action}`),
    delay: delay || undefined,
  });
}

function parseActivity(value: unknown, at: string): Activity {
  const entries = Object.entries(asRecord(value, at));
  const [kind, name] = entries[0] ?? [];
  if (entries.length !== 1 || !MESSAGE_KINDS.includes(kind as MessageKind)) {
    throw new DiagramFormatError(`${at} must be "command: <Name>" or "event: <Name>"`);
  }
  return { kind: kind as MessageKind, name: asString(name, `${at}.${kind}`) };
}

/** An edge, plus the activities a version 2 file wrote on it (moved to the target state). */
interface ParsedEdge {
  edge: DiagramEdge;
  activities: Activity[];
}

function parseEdge(
  value: unknown,
  index: number,
  nodeIds: Set<string>,
  version: number,
): ParsedEdge {
  const at = `edges[${index}]`;
  const edge = asRecord(value, at);
  const kind = edge['kind'] ?? 'forward';
  if (!EDGE_KINDS.includes(kind as EdgeKind)) {
    throw new DiagramFormatError(`${at}.kind must be one of ${EDGE_KINDS.join(', ')}`);
  }
  if (version >= 3 && edge['activities'] !== undefined) {
    throw new DiagramFormatError(
      `${at}.activities is not allowed: activities belong to states (nodes[].activities)`,
    );
  }
  const legacy =
    version < 3 && edge['activities'] !== undefined
      ? asArray(edge['activities'], `${at}.activities`).map((a, i) =>
          parseActivity(a, `${at}.activities[${i}]`),
        )
      : [];
  const guard = optionalString(edge['guard'], `${at}.guard`)?.trim();
  if (guard && !edge['event']) {
    throw new DiagramFormatError(`${at}.guard needs an event: a guard is a condition on an event`);
  }
  const source = asString(edge['source'], `${at}.source`);
  const target = asString(edge['target'], `${at}.target`);
  for (const [field, id] of [
    ['source', source],
    ['target', target],
  ]) {
    if (!nodeIds.has(id)) throw new DiagramFormatError(`${at}.${field} "${id}" is not a node`);
  }
  return {
    edge: withoutUndefined({
      id: asString(edge['id'], `${at}.id`),
      source,
      target,
      kind: kind as EdgeKind,
      event: optionalString(edge['event'], `${at}.event`) || undefined,
      eventSource: optionalString(edge['eventSource'], `${at}.eventSource`) || undefined,
      guard: guard || undefined,
    }),
    activities: legacy,
  };
}

function asRecord(value: unknown, at: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new DiagramFormatError(`${at} must be a mapping`);
  }
  return value as Record<string, unknown>;
}

function asArray(value: unknown, at: string): unknown[] {
  if (!Array.isArray(value)) throw new DiagramFormatError(`${at} must be a list`);
  return value;
}

function asString(value: unknown, at: string): string {
  if (typeof value !== 'string' || value === '') {
    throw new DiagramFormatError(`${at} must be a non-empty string`);
  }
  return value;
}

function optionalString(value: unknown, at: string): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string') throw new DiagramFormatError(`${at} must be a string`);
  return value;
}

function withoutUndefined<T extends object>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as T;
}
