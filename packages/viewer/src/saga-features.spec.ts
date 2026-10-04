import { Diagram, serializeDiagram } from '@ariadne/core';
import { AriadneSagaElement, defineAriadneSaga } from './saga-element';

/** A saga with a choice, a command, a published event, an orphan state (problem) and a dead end. */
const diagram: Diagram = {
  direction: 'top-bottom',
  name: 'Order',
  nodes: [
    { id: 'start-1', type: 'start', name: 'Initial' },
    {
      id: 'state-1',
      type: 'state',
      name: 'Reserving stock',
      activities: [
        { kind: 'command', name: 'ReserveStock' },
        { kind: 'event', name: 'StockRequested' },
      ],
    },
    { id: 'state-2', type: 'state', name: 'Shipping' },
    { id: 'end-1', type: 'end', name: 'Completed' },
    { id: 'orphan', type: 'state', name: 'Orphan' },
  ],
  edges: [
    {
      id: 'e1',
      source: 'start-1',
      target: 'state-1',
      kind: 'forward',
      event: 'OrderSubmitted',
      eventSource: 'Shop API',
    },
    { id: 'e2', source: 'state-1', target: 'state-2', kind: 'forward', event: 'StockReserved' },
    { id: 'e3', source: 'state-1', target: 'end-1', kind: 'forward', event: 'StockUnavailable' },
    { id: 'e4', source: 'state-2', target: 'end-1', kind: 'forward', event: 'Shipped' },
  ],
};
const yaml = serializeDiagram(diagram);

defineAriadneSaga();

const next = <T>(element: Element, type: string) =>
  new Promise<CustomEvent<T>>((resolve) =>
    element.addEventListener(type, (e) => resolve(e as CustomEvent<T>), { once: true }),
  );

const open = async (features = '') => {
  const element = document.createElement('ariadne-saga') as AriadneSagaElement;
  if (features) element.setAttribute('features', features);
  element.setAttribute('source', yaml);
  const loaded = next(element, 'load');
  document.body.append(element);
  await loaded;
  return element;
};
const $ = (element: AriadneSagaElement, selector: string) =>
  element.shadowRoot!.querySelector<HTMLElement>(selector)!;
const $$ = (element: AriadneSagaElement, selector: string) => [
  ...element.shadowRoot!.querySelectorAll<HTMLElement>(selector),
];
const tab = (element: AriadneSagaElement, feature: string) =>
  $(element, `[data-feature="${feature}"]`);
const group = (element: AriadneSagaElement, id: string) =>
  $(element, `[data-node-id="${id}"], [data-edge-id="${id}"][data-part="line"]`);

afterEach(() => document.body.replaceChildren());

describe('features', () => {
  it('shows nothing extra by default', async () => {
    const element = await open();
    expect($(element, '.tabs').hidden).toBe(true);
    expect($$(element, '.panel')).toHaveLength(0);
  });

  it('adds a tab for each feature that is on, and follows the attribute', async () => {
    const element = await open('problems walkthrough');
    expect($$(element, '[data-feature]').map((t) => t.dataset['feature'])).toEqual([
      'walkthrough',
      'problems',
    ]);
    expect(tab(element, 'problems').textContent).toBe('Problems (6)');
    element.features = ['messages'];
    expect($$(element, '[data-feature]').map((t) => t.dataset['feature'])).toEqual(['messages']);
    element.features = null;
    expect($(element, '.tabs').hidden).toBe(true);
  });

  it('opens one panel at a time and closes it again', async () => {
    const element = await open('walkthrough messages problems');
    tab(element, 'messages').click();
    expect($(element, '.panel').getAttribute('aria-label')).toBe('Message catalog');
    expect(tab(element, 'messages').getAttribute('aria-pressed')).toBe('true');
    tab(element, 'problems').click();
    expect($$(element, '.panel')).toHaveLength(1);
    expect($(element, '.panel').getAttribute('aria-label')).toBe('Problems');
    expect(tab(element, 'messages').getAttribute('aria-pressed')).toBe('false');
    tab(element, 'problems').click();
    expect($$(element, '.panel')).toHaveLength(0);
  });

  it('closes the panel of a feature that is switched off', async () => {
    const element = await open('messages');
    tab(element, 'messages').click();
    element.features = ['problems'];
    expect($$(element, '.panel')).toHaveLength(0);
  });
});

describe('walkthrough', () => {
  const choose = (element: AriadneSagaElement, id: string) =>
    $(element, `[data-option="${id}"]`).click();

  it('starts at the initial state and offers its transitions', async () => {
    const element = await open('walkthrough');
    tab(element, 'walkthrough').click();
    expect($(element, '.current strong').textContent).toBe('Initial');
    expect($$(element, '[data-option]').map((b) => b.textContent)).toEqual([
      'OrderSubmitted → Reserving stock',
    ]);
    expect($(element, '[data-action="back"]').hasAttribute('disabled')).toBe(true);
  });

  it('walks, tells the path to the host, marks it on the diagram and goes back', async () => {
    const element = await open('walkthrough');
    tab(element, 'walkthrough').click();
    const first = next<{ steps: string[]; path: string[] }>(element, 'walkthrough');
    choose(element, 'e1');
    expect((await first).detail).toEqual({ steps: ['e1'], path: ['start-1', 'state-1'] });
    expect($(element, '.current').textContent).toContain('Send ReserveStock');
    expect($(element, '.current').textContent).toContain('Publish StockRequested');
    expect($$(element, '[data-option]')).toHaveLength(2);

    const second = next<{ steps: string[]; path: string[] }>(element, 'walkthrough');
    choose(element, 'e2');
    expect((await second).detail.path).toEqual(['start-1', 'state-1', 'state-2']);
    expect(group(element, 'state-2').getAttribute('data-walk')).toBe('current');
    expect(group(element, 'state-1').getAttribute('data-walk')).toBe('visited');
    expect(group(element, 'e2').getAttribute('data-walk')).toBe('visited');
    expect(group(element, 'orphan').hasAttribute('data-walk')).toBe(false);
    expect($(element, '.stage').hasAttribute('data-dim')).toBe(true);
    expect($$(element, '.steps li').map((li) => li.textContent)).toEqual([
      'OrderSubmitted → Reserving stock',
      'StockReserved → Shipping',
    ]);

    const back = next<{ steps: string[] }>(element, 'walkthrough');
    $(element, '[data-action="back"]').click();
    expect((await back).detail.steps).toEqual(['e1']);
    expect(group(element, 'state-2').hasAttribute('data-walk')).toBe(false);
  });

  it('says when the saga is finished, and restarts', async () => {
    const element = await open('walkthrough');
    tab(element, 'walkthrough').click();
    choose(element, 'e1');
    choose(element, 'e3');
    expect($(element, '.panel').textContent).toContain('The saga is finished here.');
    expect($$(element, '[data-option]')).toHaveLength(0);
    const restart = next<{ steps: string[] }>(element, 'walkthrough');
    $(element, '[data-action="restart"]').click();
    expect((await restart).detail.steps).toEqual([]);
    expect($(element, '.current strong').textContent).toBe('Initial');
    expect($(element, '.stage').hasAttribute('data-dim')).toBe(false);
  });

  it('clears its marks and tells the host when the panel closes mid-walk', async () => {
    const element = await open('walkthrough');
    tab(element, 'walkthrough').click();
    choose(element, 'e1');
    const closed = next<{ steps: string[] }>(element, 'walkthrough');
    tab(element, 'walkthrough').click();
    expect((await closed).detail).toEqual({ steps: [], path: [] });
    expect(group(element, 'state-1').hasAttribute('data-walk')).toBe(false);
  });
});

describe('messages', () => {
  it('lists commands and events with where they are used', async () => {
    const element = await open('messages');
    tab(element, 'messages').click();
    const names = $$(element, '.message-name').map((n) => n.textContent);
    expect(names).toEqual([
      'ReserveStock',
      'OrderSubmitted',
      'Shipped',
      'StockRequested',
      'StockReserved',
      'StockUnavailable',
    ]);
    expect($(element, '[data-message="command:ReserveStock"]').textContent).toContain(
      'sent by Reserving stock',
    );
    expect($(element, '[data-message="event:OrderSubmitted"]').textContent).toContain(
      'from Shop API',
    );
  });

  it('marks where a picked message is used, and unmarks it', async () => {
    const element = await open('messages');
    tab(element, 'messages').click();
    const pick = $(element, '[data-message="event:StockReserved"]');
    pick.click();
    expect(pick.getAttribute('aria-pressed')).toBe('true');
    expect(group(element, 'e2').hasAttribute('data-message')).toBe(true);
    expect(group(element, 'state-2').hasAttribute('data-message')).toBe(true);
    expect(group(element, 'e4').hasAttribute('data-message')).toBe(false);
    expect($(element, '.stage').hasAttribute('data-dim')).toBe(true);
    pick.click();
    expect(group(element, 'e2').hasAttribute('data-message')).toBe(false);
    expect($(element, '.stage').hasAttribute('data-dim')).toBe(false);
  });
});

describe('problems', () => {
  it('lists the findings and marks their states', async () => {
    const element = await open('problems');
    tab(element, 'problems').click();
    const texts = $$(element, '.problems li').map((li) => li.textContent);
    expect(texts.some((t) => t!.includes('cannot be reached') && t!.includes('Orphan'))).toBe(true);
    expect(
      $$(element, '.problems button')
        .map((b) => b.dataset['severity'])
        .join(),
    ).toBe('error,warning,info,info,info,info');
    expect(group(element, 'orphan').getAttribute('data-problem')).toBe('error');
    expect(group(element, 'state-1').hasAttribute('data-problem')).toBe(false);
  });

  it('marks problems without opening the panel, and not when the feature is off', async () => {
    const on = await open('problems');
    expect(group(on, 'orphan').getAttribute('data-problem')).toBe('error');
    const off = await open('walkthrough');
    expect(group(off, 'orphan').hasAttribute('data-problem')).toBe(false);
  });

  it('selects the element of a finding that is picked', async () => {
    const element = await open('problems');
    tab(element, 'problems').click();
    const selected = next<{ selection: { kind: string; id: string } }>(element, 'select');
    $(element, '.problems button[data-severity="error"]').click();
    expect((await selected).detail.selection).toMatchObject({ kind: 'node', id: 'orphan' });
    expect(group(element, 'orphan').hasAttribute('data-selected')).toBe(true);
  });

  it('says so when there is nothing to fix', async () => {
    const element = document.createElement('ariadne-saga') as AriadneSagaElement;
    element.setAttribute('features', 'problems');
    element.setAttribute(
      'source',
      serializeDiagram({
        direction: 'top-bottom',
        nodes: [
          { id: 's', type: 'start', name: 'Initial' },
          { id: 'e', type: 'end', name: 'Done' },
        ],
        edges: [
          {
            id: 'x',
            source: 's',
            target: 'e',
            kind: 'forward',
            event: 'Finished',
            eventSource: 'API',
          },
        ],
      }),
    );
    document.body.append(element);
    await next(element, 'load');
    tab(element, 'problems').click();
    expect($(element, '.panel').textContent).toContain('No problems found.');
    expect(tab(element, 'problems').textContent).toBe('Problems');
  });
});

describe('selection', () => {
  it('selects a state with a click and tells the host', async () => {
    const element = await open();
    const selected = next<{ selection: { kind: string; id: string; node: { name: string } } }>(
      element,
      'select',
    );
    group(element, 'state-1').dispatchEvent(
      new MouseEvent('click', { bubbles: true, composed: true }),
    );
    const { selection } = (await selected).detail;
    expect(selection).toMatchObject({
      kind: 'node',
      id: 'state-1',
      node: { name: 'Reserving stock' },
    });
    expect(group(element, 'state-1').hasAttribute('data-selected')).toBe(true);
    expect(element.selection).toEqual({ kind: 'node', id: 'state-1' });
  });

  it('selects a transition, also by its label, and clears on a second click or on the background', async () => {
    const element = await open();
    const events: unknown[] = [];
    element.addEventListener('select', (e) =>
      events.push((e as CustomEvent).detail.selection?.id ?? null),
    );
    const click = (target: Element) =>
      target.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true }));
    click($(element, '[data-edge-id="e2"][data-part="label"] rect'));
    expect(events).toEqual(['e2']);
    expect($$(element, '[data-edge-id="e2"][data-selected]')).toHaveLength(2);
    click($(element, '[data-edge-id="e2"][data-part="line"]'));
    expect(events).toEqual(['e2', null]);
    click(group(element, 'state-1'));
    click($(element, '.stage svg'));
    expect(events).toEqual(['e2', null, 'state-1', null]);
    click($(element, '.stage svg')); // nothing to clear: no event
    expect(events).toHaveLength(4);
  });

  it('does not select after a drag, nor from the controls', async () => {
    const element = await open('walkthrough');
    const events: unknown[] = [];
    element.addEventListener('select', (e) => events.push(e));
    const viewport = $(element, '.viewport');
    viewport.dispatchEvent(new MouseEvent('pointerdown', { button: 0, bubbles: true }));
    viewport.dispatchEvent(
      new MouseEvent('pointermove', { buttons: 1, clientX: 30, bubbles: true }),
    );
    group(element, 'state-1').dispatchEvent(
      new MouseEvent('click', { bubbles: true, composed: true }),
    );
    tab(element, 'walkthrough').click();
    $(element, '[data-action="zoom-in"]').click();
    expect(events).toHaveLength(0);
  });

  it('selects the focused item with Enter and Space', async () => {
    const element = await open();
    const picked: string[] = [];
    element.addEventListener('select', (e) => picked.push((e as CustomEvent).detail.selection?.id));
    for (const key of ['Enter', ' ']) {
      group(element, 'end-1').dispatchEvent(
        new KeyboardEvent('keydown', { key, bubbles: true, composed: true, cancelable: true }),
      );
    }
    expect(picked).toEqual(['end-1', undefined]);
  });

  it('can be set from outside without an event, and is reset by a new diagram', async () => {
    const element = await open();
    const events: unknown[] = [];
    element.addEventListener('select', (e) => events.push(e));
    element.selection = { kind: 'node', id: 'state-2' };
    expect(group(element, 'state-2').hasAttribute('data-selected')).toBe(true);
    expect(events).toHaveLength(0);
    const loaded = next(element, 'load');
    element.setAttribute('source', yaml.replace('Order', 'Order 2'));
    await loaded;
    expect(element.selection).toBeNull();
  });
});

describe('emphasis', () => {
  it('picks out states by id or name and transitions by id, and fades the rest', async () => {
    const element = await open();
    element.emphasis = { nodes: ['Shipping', 'state-1'], edges: ['e2'] };
    expect(
      $$(element, '[data-emphasis]').map((g) => g.dataset['nodeId'] ?? g.dataset['edgeId']),
    ).toEqual(expect.arrayContaining(['state-2', 'state-1', 'e2']));
    expect(group(element, 'orphan').hasAttribute('data-emphasis')).toBe(false);
    expect($(element, '.stage').hasAttribute('data-dim')).toBe(true);
  });

  it('follows when the host changes or clears it', async () => {
    const element = await open();
    element.emphasis = { nodes: ['state-1'] };
    element.emphasis = { nodes: ['state-2'] };
    expect(group(element, 'state-1').hasAttribute('data-emphasis')).toBe(false);
    expect(group(element, 'state-2').hasAttribute('data-emphasis')).toBe(true);
    element.emphasis = null;
    expect($$(element, '[data-emphasis]')).toHaveLength(0);
    expect($(element, '.stage').hasAttribute('data-dim')).toBe(false);
  });

  it('applies to a diagram that loads later, and ignores what does not exist', async () => {
    const element = document.createElement('ariadne-saga') as AriadneSagaElement;
    element.emphasis = { nodes: ['state-2', 'nope'], edges: ['nope'] };
    element.setAttribute('source', yaml);
    document.body.append(element);
    await next(element, 'load');
    expect(group(element, 'state-2').hasAttribute('data-emphasis')).toBe(true);
    expect($$(element, '[data-emphasis]')).toHaveLength(1);
  });
});
