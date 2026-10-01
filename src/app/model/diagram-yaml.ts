import { parse, stringify } from 'yaml';
import { Diagram, DiagramEdge, DiagramNode, EdgeKind, NodeType, PORTS, Port } from './diagram';

/** Current version of the file format; see docs/specs/diagram-format.md. */
export const FORMAT_VERSION = 1;

const NODE_TYPES: readonly NodeType[] = ['start', 'end', 'step', 'decision'];
const EDGE_KINDS: readonly EdgeKind[] = ['forward', 'compensation'];

/** Thrown when a file is not a valid Ariadne diagram; the message is shown to the user. */
export class DiagramFormatError extends Error {
  override readonly name = 'DiagramFormatError';
}

/**
 * Serializes a diagram to YAML. Output is deterministic: fixed key order, element order
 * as in the model, positions rounded to whole pixels, absent optional fields omitted.
 */
export function serializeDiagram(diagram: Diagram): string {
  const file = {
    version: FORMAT_VERSION,
    nodes: diagram.nodes.map(serializeNode),
    edges: diagram.edges.map(({ id, source, target, kind, sourcePort, targetPort }) =>
      withoutUndefined({ id, source, target, kind, sourcePort, targetPort }),
    ),
  };
  return stringify(file, { lineWidth: 0 });
}

function serializeNode(node: DiagramNode): Record<string, unknown> {
  return withoutUndefined({
    id: node.id,
    type: node.type,
    name: node.name,
    position: { x: Math.round(node.position.x), y: Math.round(node.position.y) },
    description: node.description,
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
  if (root['version'] !== FORMAT_VERSION) {
    throw new DiagramFormatError(
      `Unsupported format version ${JSON.stringify(root['version'])} (expected ${FORMAT_VERSION})`,
    );
  }
  const nodes = asArray(root['nodes'] ?? [], 'nodes').map(parseNode);
  const ids = new Set<string>();
  for (const { id } of nodes) {
    if (ids.has(id)) throw new DiagramFormatError(`Duplicate node id "${id}"`);
    ids.add(id);
  }
  const edges = asArray(root['edges'] ?? [], 'edges').map((e, i) => parseEdge(e, i, ids));
  return { nodes, edges };
}

function parseNode(value: unknown, index: number): DiagramNode {
  const at = `nodes[${index}]`;
  const node = asRecord(value, at);
  const type = node['type'];
  if (!NODE_TYPES.includes(type as NodeType)) {
    throw new DiagramFormatError(`${at}.type must be one of ${NODE_TYPES.join(', ')}`);
  }
  const position = asRecord(node['position'], `${at}.position`);
  const compensation =
    node['compensation'] === undefined
      ? undefined
      : asRecord(node['compensation'], `${at}.compensation`);
  return withoutUndefined({
    id: asString(node['id'], `${at}.id`),
    type: type as NodeType,
    name: asString(node['name'], `${at}.name`),
    position: {
      x: asNumber(position['x'], `${at}.position.x`),
      y: asNumber(position['y'], `${at}.position.y`),
    },
    description: optionalString(node['description'], `${at}.description`),
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

function parseEdge(value: unknown, index: number, nodeIds: Set<string>): DiagramEdge {
  const at = `edges[${index}]`;
  const edge = asRecord(value, at);
  const kind = edge['kind'] ?? 'forward';
  if (!EDGE_KINDS.includes(kind as EdgeKind)) {
    throw new DiagramFormatError(`${at}.kind must be one of ${EDGE_KINDS.join(', ')}`);
  }
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
    sourcePort: optionalPort(edge['sourcePort'], `${at}.sourcePort`),
    targetPort: optionalPort(edge['targetPort'], `${at}.targetPort`),
  });
}

function optionalPort(value: unknown, at: string): Port | undefined {
  if (value === undefined) return undefined;
  if (!PORTS.includes(value as Port)) {
    throw new DiagramFormatError(`${at} must be one of ${PORTS.join(', ')}`);
  }
  return value as Port;
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

function asNumber(value: unknown, at: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new DiagramFormatError(`${at} must be a number`);
  }
  return value;
}

function withoutUndefined<T extends object>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as T;
}
