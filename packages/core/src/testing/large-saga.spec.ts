import { parseDiagram, serializeDiagram } from '../diagram-yaml';
import { layoutDiagram } from '../layout';
import { validate } from '../validation';
import { largeSaga, seededRandom } from './large-saga';

const SIZES = [50, 150, 300];

describe('seededRandom', () => {
  it('gives the same numbers for the same seed, and others for another', () => {
    const take = (seed: number) => {
      const random = seededRandom(seed);
      return Array.from({ length: 5 }, random);
    };
    expect(take(1)).toEqual(take(1));
    expect(take(1)).not.toEqual(take(2));
    for (const n of take(3)) {
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThan(1);
    }
  });
});

describe('largeSaga', () => {
  it.each(SIZES)('has exactly %i states, and the nodes around them', (states) => {
    const saga = largeSaga(states);
    const count = (type: string) => saga.nodes.filter((n) => n.type === type).length;
    expect(count('state')).toBe(states);
    expect(count('start')).toBe(1);
    expect(count('end')).toBe(2);
    expect(count('any')).toBe(1);
    expect(count('join')).toBe(Math.floor(states / 25));
  });

  it('is the same for the same seed and different for another', () => {
    expect(largeSaga(150, 7)).toEqual(largeSaga(150, 7));
    expect(largeSaga(150, 1)).toEqual(largeSaga(150));
    expect(largeSaga(150, 1)).not.toEqual(largeSaga(150, 2));
  });

  it('names things so that a failure can be read', () => {
    const saga = largeSaga(50);
    expect(saga.nodes.find((n) => n.id === 'state-17')).toMatchObject({
      name: 'State 17',
      activities: expect.arrayContaining([{ kind: 'command', name: 'Command17' }]),
    });
    expect(saga.edges.some((e) => e.event === 'Event17Happened')).toBe(true);
    const names = saga.nodes.map((n) => n.name);
    expect(new Set(names).size).toBe(names.length);
    const ids = [...saga.nodes, ...saga.edges].map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it.each(SIZES)('has the loops, decisions, joins and compensations of %i states', (states) => {
    const saga = largeSaga(states);
    const index = (id: string) => saga.nodes.findIndex((n) => n.id === id);
    const loops = saga.edges.filter(
      (e) => e.kind === 'forward' && index(e.target) !== -1 && index(e.target) < index(e.source),
    );
    expect(loops.length).toBeGreaterThanOrEqual(Math.floor(states / 10));
    expect(saga.edges.filter((e) => e.kind === 'compensation')).toHaveLength(
      Math.floor(states / 7),
    );
    expect(saga.nodes.filter((n) => n.compensation)).toHaveLength(Math.floor(states / 7));
    // A decision: a state with two ways on.
    const out = new Map<string, number>();
    for (const e of saga.edges.filter((e) => e.kind === 'forward')) {
      out.set(e.source, (out.get(e.source) ?? 0) + 1);
    }
    expect([...out.values()].filter((n) => n >= 2).length).toBeGreaterThanOrEqual(
      Math.floor(states / 5),
    );
    // Some states carry requests and timers, and the Any node can cancel.
    expect(saga.nodes.some((n) => n.requests)).toBe(true);
    expect(saga.nodes.some((n) => n.timers)).toBe(true);
    expect(saga.edges.find((e) => e.event === 'Cancel')).toMatchObject({
      source: 'any-1',
      eventSource: 'Shop API',
    });
  });

  it.each(SIZES)('is a valid saga of %i states: no errors, no dead ends', (states) => {
    const saga = largeSaga(states);
    const ids = new Set(saga.nodes.map((n) => n.id));
    for (const e of saga.edges) {
      expect(ids.has(e.source), `${e.id} from ${e.source}`).toBe(true);
      expect(ids.has(e.target), `${e.id} to ${e.target}`).toBe(true);
    }
    const findings = validate(saga);
    expect(findings.filter((f) => f.severity === 'error')).toEqual([]);
    expect(findings.filter((f) => f.code === 'dead-end')).toEqual([]);
    expect(findings.filter((f) => f.code === 'ambiguous-event')).toEqual([]);
  });

  it.each(SIZES)('is written and read back unchanged at %i states', (states) => {
    const saga = largeSaga(states);
    expect(parseDiagram(serializeDiagram(saga))).toEqual(saga);
  });

  it.each(SIZES)('is laid out with every node placed at %i states', (states) => {
    const saga = largeSaga(states);
    const { positions } = layoutDiagram(saga);
    for (const node of saga.nodes) expect(positions.has(node.id), node.id).toBe(true);
  });

  it.each([1, 2, 3, 24, 25, 26, 51])('copes with %i states', (states) => {
    const saga = largeSaga(states);
    expect(saga.nodes.filter((n) => n.type === 'state')).toHaveLength(states);
    expect(validate(saga).filter((f) => f.severity === 'error')).toEqual([]);
    expect(parseDiagram(serializeDiagram(saga))).toEqual(saga);
  });
});
