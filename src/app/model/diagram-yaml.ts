import { parse, stringify } from 'yaml';
import {
  Diagram,
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
} from './diagram';

/** Current version of the file format; see docs/specs/diagram-format.md. */
export const FORMAT_VERSION = 2;
/**
 * Versions the reader accepts. Version 1 positions and ports are read and ignored, and its
 * `step` and `decision` nodes become states.
 */
const READABLE_VERSIONS: readonly number[] = [1, 2];

const NODE_TYPES: readonly NodeType[] = ['start', 'end', 'state'];
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
    direction: diagram.direction,
    nodes: diagram.nodes.map(serializeNode),
    edges: diagram.edges.map(({ id, source, target, kind, event, eventSource, activities }) =>
      withoutUndefined({
        id,
        source,
        target,
        kind,
        event,
        eventSource,
        // Compact one-key form: `- command: ChargePayment` / `- event: OrderShipped`.
        activities: activities?.length
          ? activities.map(({ kind, name }) => ({ [kind]: name }))
          : undefined,
      }),
    ),
  };
  return stringify(file, { lineWidth: 0 });
}

function serializeNode(node: DiagramNode): Record<string, unknown> {
  return withoutUndefined({
    id: node.id,
    type: node.type,
    name: node.name,
    description: node.description,
    color: node.color,
    retry: node.retry,
    timeout: node.timeout,
    compensation: node.compensation && withoutUndefined({ ...node.compensation }),
  });
}

/** Parses and validates a YAML diagram file. */
export function parseDiagram(text: string): Diagram {
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
  const ids = new Set<string>();
  for (const { id } of nodes) {
    if (ids.has(id)) throw new DiagramFormatError(`Duplicate node id "${id}"`);
    ids.add(id);
  }
  const edges = asArray(root['edges'] ?? [], 'edges').map((e, i) => parseEdge(e, i, ids));
  return { direction: direction as Direction, nodes, edges };
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
  if (color !== undefined &&   !isNodeColor(color)) {
      throw new DiagramFormatError(`${at}.color must be one of ${NODE_COLORS.join(', ')} or a #rrggbb value`);
  }
  const compensation =
    node['compensation'] === undefined
      ? undefined
      : asRecord(node['compensation'], `${at}.compensation`);
  return withoutUndefined({
    id: asString(node['id'], `${at}.id`),
    type: type as NodeType,
    name: asString(node['name'], `${at}.name`),
    description: optionalString(node['description'], `${at}.description`),
    color: color as NodeColor | undefined,
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

function parseActivity(value: unknown, at: string): Activity {
  const entries = Object.entries(asRecord(value, at));
  const [kind, name] = entries[0] ?? [];
  if (entries.length !== 1 || !MESSAGE_KINDS.includes(kind as MessageKind)) {
    throw new DiagramFormatError(`${at} must be "command: <Name>" or "event: <Name>"`);
  }
  return { kind: kind as MessageKind, name: asString(name, `${at}.${kind}`) };
}

function parseEdge(value: unknown, index: number, nodeIds: Set<string>): DiagramEdge {
  const at = `edges[${index}]`;
  const edge = asRecord(value, at);
  const kind = edge['kind'] ?? 'forward';
  if (!EDGE_KINDS.includes(kind as EdgeKind)) {
    throw new DiagramFormatError(`${at}.kind must be one of ${EDGE_KINDS.join(', ')}`);
  }
  const activities =
    edge['activities'] === undefined
      ? undefined
      : asArray(edge['activities'], `${at}.activities`).map((a, i) =>
          parseActivity(a, `${at}.activities[${i}]`),
        );
  const source = asString(edge['source'], `${at}.source`);
  const target = asString(edge['target'], `${at}.target`);
  for (const [field, id] of [
    ['source', source],
    ['target', target],
  ]) {
    if (!nodeIds.has(id)) throw new DiagramFormatError(`${at}.${field} "${id}" is not a node`);
  }
  return withoutUndefined({
    id: asString(edge['id'], `${at}.id`),
    source,
    target,
    kind: kind as EdgeKind,
    event: optionalString(edge['event'], `${at}.event`) || undefined,
    eventSource: optionalString(edge['eventSource'], `${at}.eventSource`) || undefined,
    activities: activities?.length ? activities : undefined,
  });
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
