import { Diagram, DiagramEdge, DiagramNode } from '../diagram';

/** A small seeded random number generator (mulberry32): the same seed gives the same numbers. */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * A large, realistic saga for benchmarks, budgets and stress tests, the same on every run.
 *
 * `states` is the number of plain states (nodes of type `state`); around them there is one initial
 * state, two final states, the Any node and some joins. The states form a path, with:
 *
 * - every 5th state a decision (a second way on, by a different event, or by the same event with
 *   guards that tell the two apart);
 * - every 10th state a loop back to an earlier state;
 * - every 25th state reached through a join (two transitions into it, one composite event out);
 * - every 7th state a compensation (an undo action and a compensation transition back);
 * - one or two activities (commands and events) in each state, some requests and timers;
 * - events that come from outside with their `eventSource`;
 * - the Any node with a `Cancel` transition to a final state.
 *
 * Every state is reachable and can finish, so `validate` finds no errors and no dead ends. Names
 * are readable and unique (`State 17`, `Event17Happened`, `Command17`) so a failing benchmark is
 * easy to read. Not part of `@ariadne/core`: import it from `@ariadne/core/testing`.
 */
export function largeSaga(states: number, seed = 1): Diagram {
  const count = Math.max(1, Math.floor(states));
  const random = seededRandom(seed);
  const pick = (n: number) => Math.floor(random() * n);

  const nodes: DiagramNode[] = [{ id: 'start-1', type: 'start', name: 'Initial' }];
  const edges: DiagramEdge[] = [];
  const addEdge = (edge: Omit<DiagramEdge, 'id'>): void => {
    edges.push({ id: `edge-${edges.length + 1}`, ...edge });
  };
  const stateId = (i: number) => `state-${i}`;
  const event = (i: number, what = 'Happened') => `Event${i}${what}`;

  // The states, with what they do on entry.
  for (let i = 1; i <= count; i++) {
    const node: DiagramNode = { id: stateId(i), type: 'state', name: `State ${i}` };
    node.activities = [{ kind: 'command', name: `Command${i}` }];
    if (random() < 0.6) node.activities.push({ kind: 'event', name: event(i, 'Published') });
    if (i % 11 === 0) node.requests = [{ name: `Validate${i}`, timeout: '30s' }];
    if (i % 13 === 0) node.timers = [{ action: 'schedule', name: `Timeout${i}`, delay: '1m' }];
    if (i % 7 === 0) node.compensation = { name: `Undo${i}`, description: `Undoes state ${i}` };
    if (i % 17 === 0) node.description = `A state in a long saga, number ${i}.`;
    nodes.push(node);
  }
  const first = nodes[0].id;
  const end = (n: 1 | 2): DiagramNode => ({
    id: `end-${n}`,
    type: 'end',
    name: n === 1 ? 'Completed' : 'Failed',
  });
  nodes.push(end(1), end(2));
  nodes.push({ id: 'any-1', type: 'any', name: 'Any state' });

  const external = (name: string) => ({ event: name, eventSource: 'Shop API' });

  addEdge({ source: first, target: stateId(1), kind: 'forward', ...external(event(0)) });

  // The path, through a join before every 25th state.
  for (let i = 1; i <= count; i++) {
    const next = i === count ? 'end-1' : stateId(i + 1);
    const joinsBefore = i < count && (i + 1) % 25 === 0 && i >= 2;
    if (joinsBefore) {
      const join: DiagramNode = { id: `join-${(i + 1) / 25}`, type: 'join', name: `Both ${i + 1}` };
      nodes.push(join);
      addEdge({ source: stateId(i), target: join.id, kind: 'forward', ...external(event(i)) });
      addEdge({
        source: stateId(i - 1),
        target: join.id,
        kind: 'forward',
        ...external(event(i - 1, 'Confirmed')),
      });
      addEdge({ source: join.id, target: next, kind: 'forward', event: join.name });
    } else {
      addEdge({ source: stateId(i), target: next, kind: 'forward', ...external(event(i)) });
    }
  }

  // Decisions: a second way on, 2 or 3 steps ahead or out to the failed end.
  for (let i = 5; i <= count; i += 5) {
    const target = i + 2 <= count && random() < 0.8 ? stateId(i + 2) : 'end-2';
    if (random() < 0.5) {
      // Same event, told apart by guards: the way on gets one too.
      const main = edges.find((e) => e.source === stateId(i) && e.event === event(i));
      if (main) main.guard = `amount <= ${100 + pick(900)}`;
      addEdge({
        source: stateId(i),
        target,
        kind: 'forward',
        ...external(event(i)),
        guard: `amount > ${1000 + pick(9000)}`,
      });
    } else {
      addEdge({ source: stateId(i), target, kind: 'forward', ...external(event(i, 'Skipped')) });
    }
  }

  // Loops back to an earlier state.
  for (let i = 10; i <= count; i += 10) {
    addEdge({
      source: stateId(i),
      target: stateId(Math.max(1, i - 3 - pick(3))),
      kind: 'forward',
      ...external(event(i, 'Retried')),
    });
  }

  // Compensations: the way back that undoes what the state did.
  for (let i = 7; i <= count; i += 7) {
    addEdge({
      source: stateId(i),
      target: stateId(i - 2),
      kind: 'compensation',
      event: event(i, 'Failed'),
    });
  }

  addEdge({ source: 'any-1', target: 'end-2', kind: 'forward', ...external('Cancel') });
  return { name: `Large saga (${count} states)`, direction: 'top-bottom', nodes, edges };
}
