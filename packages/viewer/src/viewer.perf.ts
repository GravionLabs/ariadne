import { PathStep, serializeDiagram } from '@ariadne/core';
import { expectWithinBudget, largeSaga, measureAsync } from '@ariadne/core/testing';
import { AriadneSagaElement, defineAriadneSaga } from './saga-element';

/** Budgets in milliseconds by number of states; see docs/specs/performance-budgets.md. */
const BUDGETS: Record<string, Record<number, number>> = {
  'source to load': { 50: 500, 150: 1300, 300: 4000 },
  'path set': { 50: 150, 150: 450, 300: 800 },
};

defineAriadneSaga();

const next = (element: Element, type: string) =>
  new Promise<void>((resolve) => element.addEventListener(type, () => resolve(), { once: true }));

describe.each([50, 150, 300])('a saga of %i states in <ariadne-saga>', (states) => {
  const saga = largeSaga(states);
  const yaml = serializeDiagram(saga);
  // The first 60 steps of the path along the saga: each is the event of the next state.
  const path: PathStep[] = Array.from({ length: Math.min(60, states) }, (_, i) => ({
    event: `Event${i}Happened`,
  }));

  afterEach(() => document.body.replaceChildren());

  it('loads within its budget, from setting source to the load event', async () => {
    const element = document.createElement('ariadne-saga') as AriadneSagaElement;
    document.body.append(element);
    let n = 0;
    const median = await measureAsync(async () => {
      const loaded = next(element, 'load');
      // A different text each time, so that the element has to draw again.
      element.source = `${yaml}# ${n++}\n`;
      await loaded;
    });
    expect(element.shadowRoot!.querySelectorAll('[data-node-id]')).toHaveLength(saga.nodes.length);
    expectWithinBudget(
      `viewer source to load (${states} states)`,
      median,
      BUDGETS['source to load'][states],
    );
  });

  it('shows a path within its budget, once the saga is loaded', async () => {
    const element = document.createElement('ariadne-saga') as AriadneSagaElement;
    document.body.append(element);
    const loaded = next(element, 'load');
    element.source = yaml;
    await loaded;
    let toggle = false;
    const median = await measureAsync(async () => {
      const resolved = next(element, 'pathresolved');
      // A different path each time, so that the element has to resolve and draw it again.
      toggle = !toggle;
      element.path = toggle ? path : path.slice(0, -1);
      await resolved;
    });
    expectWithinBudget(`viewer path set (${states} states)`, median, BUDGETS['path set'][states]);
  });
});
