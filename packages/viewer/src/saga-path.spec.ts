import { Diagram, ResolvedPath, serializeDiagram } from '@ariadne/core';
import { AriadneSagaElement, defineAriadneSaga } from './saga-element';

const diagram: Diagram = {
  direction: 'top-bottom',
  name: 'Order',
  nodes: [
    { id: 'start', type: 'start', name: 'Initial' },
    { id: 'reserving', type: 'state', name: 'Reserving stock' },
    { id: 'charging', type: 'state', name: 'Charging payment' },
    { id: 'completed', type: 'end', name: 'Completed' },
    { id: 'cancelled', type: 'end', name: 'Cancelled' },
  ],
  edges: [
    {
      id: 'e1',
      source: 'start',
      target: 'reserving',
      kind: 'forward',
      event: 'OrderSubmitted',
      eventSource: 'API',
    },
    {
      id: 'e2',
      source: 'reserving',
      target: 'charging',
      kind: 'forward',
      event: 'StockReserved',
      eventSource: 'API',
    },
    {
      id: 'e3',
      source: 'charging',
      target: 'completed',
      kind: 'forward',
      event: 'PaymentCharged',
      eventSource: 'API',
    },
    {
      id: 'e4',
      source: 'charging',
      target: 'reserving',
      kind: 'forward',
      event: 'PaymentFailed',
      guard: 'retry',
      eventSource: 'API',
    },
    {
      id: 'e5',
      source: 'charging',
      target: 'cancelled',
      kind: 'forward',
      event: 'PaymentFailed',
      guard: 'fraud',
      eventSource: 'API',
    },
  ],
};
const yaml = serializeDiagram(diagram);

defineAriadneSaga();

const next = <T>(element: Element, type: string) =>
  new Promise<CustomEvent<T>>((resolve) =>
    element.addEventListener(type, (e) => resolve(e as CustomEvent<T>), { once: true }),
  );
const open = async (attributes: Record<string, string> = {}) => {
  const element = document.createElement('ariadne-saga') as AriadneSagaElement;
  for (const [name, value] of Object.entries({ source: yaml, ...attributes }))
    element.setAttribute(name, value);
  const loaded = next(element, 'load');
  document.body.append(element);
  await loaded;
  return element;
};
const $ = (e: AriadneSagaElement, selector: string) =>
  e.shadowRoot!.querySelector<HTMLElement>(selector)!;
const $$ = (e: AriadneSagaElement, selector: string) => [
  ...e.shadowRoot!.querySelectorAll<HTMLElement>(selector),
];
const node = (e: AriadneSagaElement, id: string) => $(e, `[data-node-id="${id}"]`);
const label = (e: AriadneSagaElement, id: string) =>
  $(e, `[data-edge-id="${id}"][data-part="label"]`);
const marked = (e: AriadneSagaElement, value: string) =>
  $$(e, `[data-path="${value}"]`).map((g) => g.dataset['nodeId'] ?? g.dataset['edgeId']);
const badges = (g: HTMLElement) =>
  [...g.querySelectorAll('[data-path-badge] text')].map((t) => t.textContent);

const events = (...names: string[]) => names.map((event) => ({ event }));
const retry = [
  { event: 'OrderSubmitted', at: '10:00', note: 'from the shop' },
  { event: 'StockReserved' },
  { event: 'PaymentFailed', to: 'Reserving stock' },
  { event: 'StockReserved' },
  { event: 'PaymentCharged' },
];

afterEach(() => document.body.replaceChildren());

describe('path view', () => {
  it('shows nothing without a path', async () => {
    const element = await open();
    expect($$(element, '[data-path]')).toHaveLength(0);
    expect($(element, '.path-info').hidden).toBe(true);
    expect($(element, '.stage').hasAttribute('data-dim')).toBe(false);
    expect(element.resolvedPath).toBeNull();
  });

  it('emphasises the states visited and the transitions taken, and fades the rest', async () => {
    const element = await open();
    element.path = events('OrderSubmitted', 'StockReserved');
    expect(marked(element, 'visited').sort()).toEqual(['reserving', 'start']);
    expect(marked(element, 'taken')).toEqual(expect.arrayContaining(['e1', 'e2']));
    expect(marked(element, 'taken')).not.toContain('e3');
    expect(node(element, 'cancelled').hasAttribute('data-path')).toBe(false);
    expect($(element, '.stage').hasAttribute('data-dim')).toBe(true);
    expect(node(element, 'cancelled').hasAttribute('data-hl')).toBe(false);
    expect(node(element, 'reserving').hasAttribute('data-hl')).toBe(true);
  });

  it('keeps the rest visible with show-untaken', async () => {
    const element = await open({ 'show-untaken': '' });
    element.path = events('OrderSubmitted');
    expect($(element, '.stage').hasAttribute('data-dim')).toBe(false);
    expect(node(element, 'start').getAttribute('data-path')).toBe('visited');
    element.showUntaken = false;
    expect($(element, '.stage').hasAttribute('data-dim')).toBe(true);
  });

  it('marks the current state, and a path ending in a final state as finished', async () => {
    const element = await open();
    element.path = events('OrderSubmitted', 'StockReserved');
    expect(node(element, 'charging').getAttribute('data-path')).toBe('current');
    expect(node(element, 'charging').getAttribute('aria-current')).toBe('true');
    expect(node(element, 'start').getAttribute('aria-current')).toBe('false');
    expect($(element, '.path-info').textContent).toBe('Now in Charging payment after 2 steps.');
    element.path = [...events('OrderSubmitted', 'StockReserved', 'PaymentCharged')];
    expect(node(element, 'completed').getAttribute('data-path')).toBe('finished');
    expect(node(element, 'charging').getAttribute('data-path')).toBe('visited');
    expect($(element, '.path-info').textContent).toBe('Finished in Completed after 3 steps.');
  });

  it('numbers the steps on the transitions, a loop taken twice reads 2, 4', async () => {
    const element = await open();
    element.path = retry;
    expect(badges(label(element, 'e1'))).toEqual(['1']);
    expect(badges(label(element, 'e2'))).toEqual(['2, 4']);
    expect(badges(label(element, 'e4'))).toEqual(['3']);
    expect(badges(label(element, 'e3'))).toEqual(['5']);
    expect(badges(label(element, 'e5'))).toEqual([]);
  });

  it('shows how often each state was visited', async () => {
    const element = await open();
    element.path = retry;
    expect(badges(node(element, 'reserving'))).toEqual(['×2']);
    expect(badges(node(element, 'charging'))).toEqual(['×2']);
    expect(badges(node(element, 'start'))).toEqual(['×1']);
    expect(badges(node(element, 'cancelled'))).toEqual([]);
  });

  it('tells the time and note of each step in a tooltip', async () => {
    const element = await open();
    element.path = retry;
    const title = (g: HTMLElement) => g.querySelector('title')!.textContent;
    expect(title(label(element, 'e1'))).toBe('Step 1 · 10:00 · from the shop');
    expect(title(label(element, 'e2'))).toBe('Step 2\nStep 4');
    expect(title(node(element, 'reserving'))).toBe('Reserving stock: visited 2 times');
    expect(title(node(element, 'start'))).toBe('Initial: visited once');
  });

  it('lists steps it cannot resolve, marks the last good state and draws nothing after them', async () => {
    const element = await open();
    element.path = [
      ...events('OrderSubmitted', 'StockReserved', 'PaymentFailed'),
      ...events('StockReserved'),
    ];
    expect($(element, '.path-info li').textContent).toContain(
      'Step 3: 2 transitions of “Charging payment” match event “PaymentFailed”',
    );
    expect(node(element, 'charging').getAttribute('data-path-problem')).toBe('true');
    expect(badges(node(element, 'charging'))).toEqual(['!']);
    expect(marked(element, 'taken')).not.toContain('e4');
    expect(node(element, 'reserving').getAttribute('data-path')).toBe('visited');
    expect(element.resolvedPath!.problems).toHaveLength(1);
    expect($(element, '.path-info .summary').textContent).toBe(
      'Now in Charging payment after 2 steps.',
    );
  });

  it('reports an event no transition reacts to', async () => {
    const element = await open();
    element.path = events('Nonsense');
    expect($(element, '.path-info li').textContent).toContain('“Nonsense”');
    expect(node(element, 'start').getAttribute('data-path-problem')).toBe('true');
  });

  it('tells the host with pathresolved: the transitions and the problems', async () => {
    const element = await open();
    const resolved = next<ResolvedPath>(element, 'pathresolved');
    element.path = [...events('OrderSubmitted', 'Nope')];
    const { detail } = await resolved;
    expect(detail.transitions.map((t) => t.edgeId)).toEqual(['e1']);
    expect(detail.problems).toEqual([expect.objectContaining({ index: 1, kind: 'no-transition' })]);
    expect(detail.current).toBe('reserving');
  });

  it('follows when the app updates the path as the instance moves on', async () => {
    const element = await open();
    element.path = events('OrderSubmitted');
    expect(node(element, 'reserving').getAttribute('data-path')).toBe('current');
    element.path = events('OrderSubmitted', 'StockReserved');
    expect(node(element, 'reserving').getAttribute('data-path')).toBe('visited');
    expect(node(element, 'charging').getAttribute('data-path')).toBe('current');
    expect($$(element, '[data-path-badge]').length).toBe(5);
    element.path = null;
    expect($$(element, '[data-path], [data-path-badge], [data-path-title]')).toHaveLength(0);
    expect($(element, '.path-info').hidden).toBe(true);
    expect($(element, '.stage').hasAttribute('data-dim')).toBe(false);
  });

  it('draws a path that was set before the diagram loaded, and again for a new diagram', async () => {
    const element = document.createElement('ariadne-saga') as AriadneSagaElement;
    element.path = events('OrderSubmitted');
    element.setAttribute('source', yaml);
    const resolved = next(element, 'pathresolved');
    document.body.append(element);
    await resolved;
    expect(node(element, 'reserving').getAttribute('data-path')).toBe('current');
    const again = next(element, 'pathresolved');
    element.setAttribute('source', yaml.replace('Order', 'Order 2'));
    await again;
    expect(node(element, 'reserving').getAttribute('data-path')).toBe('current');
  });

  it('works together with the walkthrough, emphasis and selection', async () => {
    const element = await open({ features: 'walkthrough' });
    element.path = events('OrderSubmitted', 'StockReserved');
    element.emphasis = { nodes: ['Completed'] };
    element.selection = { kind: 'node', id: 'start' };
    $(element, '[data-feature="walkthrough"]').click();
    $(element, '[data-option]').click();
    const start = node(element, 'start');
    expect(start.getAttribute('data-path')).toBe('visited');
    expect(start.getAttribute('data-walk')).toBe('visited');
    expect(start.hasAttribute('data-selected')).toBe(true);
    expect(node(element, 'completed').hasAttribute('data-emphasis')).toBe(true);
    expect(node(element, 'completed').hasAttribute('data-path')).toBe(false);
  });

  it('is read-only: selecting does not change the path', async () => {
    const element = await open();
    element.path = events('OrderSubmitted');
    node(element, 'cancelled').dispatchEvent(
      new MouseEvent('click', { bubbles: true, composed: true }),
    );
    expect(element.path).toEqual(events('OrderSubmitted'));
    expect(element.resolvedPath!.current).toBe('reserving');
  });
});

describe('path-view', () => {
  const timeline = (e: AriadneSagaElement) => $(e, '.timeline');
  const steps = (e: AriadneSagaElement) =>
    [...timeline(e).querySelectorAll<SVGElement>('[data-timeline-index]')].map(
      (g) => g.dataset['nodeId'] ?? `step ${g.dataset['step']}`,
    );
  const stageMarks = (e: AriadneSagaElement) =>
    $(e, '.stage').querySelectorAll('[data-path]').length;

  it('is the diagram by default: no timeline', async () => {
    const element = await open();
    element.path = retry;
    expect(element.pathView).toBe('diagram');
    expect(timeline(element).hidden).toBe(true);
    expect(stageMarks(element)).toBeGreaterThan(0);
  });

  it('draws the states and steps left to right with path-view="timeline", and leaves the diagram unmarked', async () => {
    const element = await open({ 'path-view': 'timeline' });
    element.path = retry;
    expect(timeline(element).hidden).toBe(false);
    expect(timeline(element).tabIndex).toBe(0);
    expect(steps(element)).toEqual([
      'start',
      'step 1',
      'reserving',
      'step 2',
      'charging',
      'step 3',
      'reserving',
      'step 4',
      'charging',
      'step 5',
      'completed',
    ]);
    expect(
      timeline(element).querySelector('[data-status="finished"]')?.getAttribute('data-node-id'),
    ).toBe('completed');
    expect(stageMarks(element)).toBe(0);
    expect($(element, '.stage').hasAttribute('data-dim')).toBe(false);
    // Its text alternative names the steps.
    expect(timeline(element).querySelector('desc')?.textContent).toContain(
      '1. OrderSubmitted: Initial → Reserving stock.',
    );
  });

  it('shows both with path-view="both", and follows when it changes, without telling the host again', async () => {
    const element = await open();
    element.path = events('OrderSubmitted');
    let told = 0;
    element.addEventListener('pathresolved', () => told++);
    element.pathView = 'both';
    expect(element.getAttribute('path-view')).toBe('both');
    expect(timeline(element).hidden).toBe(false);
    expect(stageMarks(element)).toBeGreaterThan(0);
    element.pathView = 'diagram';
    expect(element.hasAttribute('path-view')).toBe(false);
    expect(timeline(element).hidden).toBe(true);
    expect(told).toBe(0);
  });

  it('reads an unknown value as the default, and has no timeline without a path', async () => {
    const element = await open({ 'path-view': 'sideways' });
    expect(element.pathView).toBe('diagram');
    element.setAttribute('path-view', 'timeline');
    expect(timeline(element).hidden).toBe(true);
    element.path = events('OrderSubmitted');
    expect(timeline(element).hidden).toBe(false);
    element.path = null;
    expect(timeline(element).hidden).toBe(true);
  });

  it('shows where the path stopped on the timeline', async () => {
    const element = await open({ 'path-view': 'timeline' });
    element.path = events('OrderSubmitted', 'Nonsense');
    expect(timeline(element).querySelector('[data-kind="problem"] title')?.textContent).toContain(
      'Step 2',
    );
  });
});
