import { PathStep, resolvePath } from '../path';
import { buildCatalog } from '../catalog';
import { Diagram } from '../diagram';
import { parseDiagram, serializeDiagram } from '../diagram-yaml';
import { layoutDiagram } from '../layout';
import { validate } from '../validation';
import { expectWithinBudget, largeSaga, measure } from '../testing';

/** Budgets in milliseconds by number of states; see docs/specs/performance-budgets.md. */
const BUDGETS: Record<string, Record<number, number>> = {
  parseDiagram: { 50: 120, 150: 100, 300: 200 },
  serializeDiagram: { 50: 50, 150: 50, 300: 100 },
  validate: { 50: 50, 150: 50, 300: 50 },
  layoutDiagram: { 50: 150, 150: 350, 300: 2050 },
  buildCatalog: { 50: 50, 150: 50, 300: 50 },
  resolvePath: { 50: 50, 150: 50, 300: 50 },
};

/** A path of `length` steps along the saga: forward, taking each loop back a few times. */
function pathAlong(saga: Diagram, length: number): PathStep[] {
  const index = new Map(saga.nodes.map((n, i) => [n.id, i]));
  const names = new Map(saga.nodes.map((n) => [n.id, n.name]));
  const steps: PathStep[] = [];
  const visits = new Map<string, number>();
  let here = saga.nodes.find((n) => n.type === 'start')!.id;
  while (steps.length < length) {
    const out = saga.edges.filter((e) => e.source === here && e.kind === 'forward' && e.event);
    const loop = out.find((e) => (index.get(e.target) ?? 0) < (index.get(here) ?? 0));
    const on = out.filter((e) => e !== loop && e.target !== 'end-2');
    const seen = visits.get(here) ?? 0;
    visits.set(here, seen + 1);
    const edge = loop && seen < 10 ? loop : on[0];
    if (!edge) break;
    steps.push({ event: edge.event, to: names.get(edge.target) });
    here = edge.target;
  }
  return steps;
}

describe.each([50, 150, 300])('a saga of %i states', (states) => {
  const saga = largeSaga(states);
  const text = serializeDiagram(saga);
  const steps = pathAlong(saga, 200);

  const operations: [string, () => unknown][] = [
    ['parseDiagram', () => parseDiagram(text)],
    ['serializeDiagram', () => serializeDiagram(saga)],
    ['validate', () => validate(saga)],
    ['layoutDiagram', () => layoutDiagram(saga)],
    ['buildCatalog', () => buildCatalog(saga)],
    ['resolvePath', () => resolvePath(saga, steps)],
  ];

  it.each(operations)('%s is within its budget', (name, run) => {
    expectWithinBudget(`${name} (${states} states)`, measure(run), BUDGETS[name][states]);
  });

  it('has a path of 200 steps that resolves', () => {
    expect(steps).toHaveLength(200);
    const resolved = resolvePath(saga, steps);
    expect(resolved.problems).toEqual([]);
    expect(resolved.transitions).toHaveLength(200);
  });
});
