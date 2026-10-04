import { Diagram, serializeDiagram } from '@ariadne/core';
import { AriadneSagaElement, defineAriadneSaga } from './saga-element';

const diagram: Diagram = {
  direction: 'top-bottom',
  name: 'Order',
  description: 'Takes an order from submit to shipped.',
  nodes: [
    { id: 'start-1', type: 'start', name: 'Initial' },
    { id: 'state-1', type: 'state', name: 'Reserving stock' },
    { id: 'end-1', type: 'end', name: 'Completed' },
  ],
  edges: [
    {
      id: 'edge-1',
      source: 'start-1',
      target: 'state-1',
      kind: 'forward',
      event: 'OrderSubmitted',
    },
    { id: 'edge-2', source: 'state-1', target: 'end-1', kind: 'forward', event: 'StockReserved' },
    { id: 'edge-3', source: 'state-1', target: 'start-1', kind: 'compensation', event: 'Undo' },
  ],
};
const yaml = serializeDiagram(diagram);

defineAriadneSaga();

const create = (attributes: Record<string, string> = {}) => {
  const element = document.createElement('ariadne-saga') as AriadneSagaElement;
  for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, value);
  document.body.append(element);
  return element;
};
const root = (element: AriadneSagaElement) => element.shadowRoot!;
const settle = () => new Promise((resolve) => setTimeout(resolve));
const next = <T>(element: Element, type: string) =>
  new Promise<CustomEvent<T>>((resolve) =>
    element.addEventListener(type, (e) => resolve(e as CustomEvent<T>), { once: true }),
  );
const transform = (element: AriadneSagaElement) =>
  root(element).querySelector<HTMLElement>('.stage')!.style.transform;

afterEach(() => {
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

describe('<ariadne-saga>', () => {
  it('is registered once, also when asked twice', () => {
    expect(() => defineAriadneSaga()).not.toThrow();
    expect(customElements.get('ariadne-saga')).toBe(AriadneSagaElement);
  });

  it('draws the saga from source and fires load', async () => {
    const element = create();
    const loaded = next<{ diagram: Diagram }>(element, 'load');
    element.source = yaml;
    const event = await loaded;
    expect(event.detail.diagram.name).toBe('Order');
    expect(event.bubbles && event.composed).toBe(true);
    expect(root(element).querySelectorAll('svg')).toHaveLength(1);
    expect(root(element).querySelectorAll('[data-node-id]')).toHaveLength(3);
    expect(root(element).querySelector('.name')!.textContent).toBe('Order');
    expect(root(element).querySelector('.description')!.textContent).toContain('submit to shipped');
    expect(root(element).querySelector('.status')!.textContent).toBe('');
  });

  it('loads src with fetch, and shows a loading state meanwhile', async () => {
    let answer!: (r: Response) => void;
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise<Response>((resolve) => (answer = resolve))),
    );
    const element = create({ src: '/api/sagas/order.saga.yaml' });
    await settle();
    expect(root(element).querySelector('.status')!.textContent).toBe('Loading…');
    expect(element.hasAttribute('aria-busy')).toBe(true);
    const loaded = next(element, 'load');
    answer(new Response(yaml));
    await loaded;
    expect(fetch).toHaveBeenCalledWith('/api/sagas/order.saga.yaml', expect.anything());
    expect(element.hasAttribute('aria-busy')).toBe(false);
    expect(root(element).querySelectorAll('[data-node-id]')).toHaveLength(3);
  });

  it('prefers source over src', async () => {
    vi.stubGlobal('fetch', vi.fn());
    const element = create({ src: '/x', source: yaml });
    await next(element, 'load');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('renders again when src or source change', async () => {
    const element = create({ source: yaml });
    await next(element, 'load');
    const other = serializeDiagram({ ...diagram, name: 'Booking' });
    const loaded = next(element, 'load');
    element.source = other;
    await loaded;
    expect(root(element).querySelector('.name')!.textContent).toBe('Booking');

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(yaml)),
    );
    const again = next(element, 'load');
    element.source = null;
    element.src = '/order.saga.yaml';
    await again;
    expect(root(element).querySelector('.name')!.textContent).toBe('Order');
  });

  it('ignores a slow response that a newer src overtook', async () => {
    const answers: ((r: Response) => void)[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise<Response>((resolve) => answers.push(resolve))),
    );
    const element = create({ src: '/old' });
    await settle();
    element.src = '/new';
    await settle();
    const loaded = next<{ diagram: Diagram }>(element, 'load');
    answers[1](new Response(serializeDiagram({ ...diagram, name: 'New' })));
    await loaded;
    answers[0](new Response(serializeDiagram({ ...diagram, name: 'Old' })));
    await settle();
    expect(root(element).querySelector('.name')!.textContent).toBe('New');
  });

  it.each([
    [
      'a failed request',
      () => vi.fn(async () => Promise.reject(new TypeError('offline'))),
      'network',
    ],
    ['a missing file', () => vi.fn(async () => new Response('', { status: 404 })), 'network'],
    ['an invalid file', () => vi.fn(async () => new Response('version: 3\nnodes: {}')), 'invalid'],
    ['a newer format', () => vi.fn(async () => new Response('version: 5')), 'version'],
  ])('shows %s as an error and fires error', async (_name, fetcher, kind) => {
    vi.stubGlobal('fetch', fetcher());
    const element = create();
    const failed = next<{ kind: string; message: string; version?: number }>(element, 'error');
    element.src = '/bad.saga.yaml';
    const event = await failed;
    expect(event.detail.kind).toBe(kind);
    const status = root(element).querySelector('.status')!;
    expect(status.textContent).toBe(event.detail.message);
    expect(status.getAttribute('role')).toBe('alert');
    expect(root(element).querySelector('svg')).toBeNull();
    if (kind === 'version') {
      expect(event.detail.version).toBe(5);
      expect(status.textContent).toContain('version 5');
    }
    if (kind === 'invalid') expect(status.textContent).toBe('nodes must be a list');
  });

  it('removes an old diagram when the next one fails, and when src is cleared', async () => {
    const element = create({ source: yaml });
    await next(element, 'load');
    const failed = next(element, 'error');
    element.source = 'nope: [';
    await failed;
    expect(root(element).querySelector('svg')).toBeNull();
    element.source = null;
    await settle();
    expect(root(element).querySelector('.status')!.textContent).toBe('');
  });

  it('overrides the direction of the file', async () => {
    const plain = create({ source: yaml });
    await next(plain, 'load');
    const wide = create({ source: yaml, direction: 'left-right' });
    const loaded = await next<{ diagram: Diagram }>(wide, 'load');
    expect(loaded.detail.diagram.direction).toBe('left-right');
    const width = (e: AriadneSagaElement) =>
      Number(root(e).querySelector('svg')!.getAttribute('width'));
    expect(width(wide)).toBeGreaterThan(width(plain));
    expect(plain.diagram!.direction).toBe('top-bottom');
  });

  it('reflects theme, defaulting to auto', () => {
    const element = create();
    expect(element.theme).toBe('auto');
    element.theme = 'dark';
    expect(element.getAttribute('theme')).toBe('dark');
    element.setAttribute('theme', 'nonsense');
    expect(element.theme).toBe('auto');
    expect(root(element).querySelector('style')!.textContent).toContain(":host([theme='dark'])");
  });

  it('shares no state between elements, and keeps their SVG ids apart', async () => {
    const a = create({ source: yaml });
    const b = create({ source: serializeDiagram({ ...diagram, name: 'Other' }) });
    await Promise.all([next(a, 'load'), next(b, 'load')]);
    expect(root(a).querySelector('.name')!.textContent).toBe('Order');
    expect(root(b).querySelector('.name')!.textContent).toBe('Other');
    const ids = (e: AriadneSagaElement) => [...root(e).querySelectorAll('marker')].map((m) => m.id);
    expect(ids(a).length).toBeGreaterThan(0);
    expect(ids(a).filter((id) => ids(b).includes(id))).toEqual([]);
    a.zoomIn();
    expect(transform(a)).not.toBe(transform(b));
  });

  it('draws colours as CSS custom properties, so the theme can reach them', async () => {
    const element = create({ source: yaml });
    await next(element, 'load');
    expect(root(element).querySelector('svg')!.outerHTML).toContain(
      'var(--ariadne-surface, #ffffff)',
    );
  });

  describe('a host that fetches the file itself', () => {
    it('shows loading until the text arrives, then the saga', async () => {
      const element = create();
      element.showLoading();
      await settle();
      expect(root(element).querySelector('.status')!.textContent).toBe('Loading…');
      expect(element.hasAttribute('aria-busy')).toBe(true);
      const loaded = next(element, 'load');
      element.source = yaml;
      await loaded;
      expect(root(element).querySelector('.status')!.textContent).toBe('');
      expect(root(element).querySelectorAll('[data-node-id]')).toHaveLength(3);
    });

    it('shows an error and fires error, and a retry with the same text works', async () => {
      const element = create({ source: yaml });
      await next(element, 'load');
      const failed = next<{ kind: string }>(element, 'error');
      element.showError({ kind: 'network', message: '/x could not be loaded (500).' });
      expect((await failed).detail.kind).toBe('network');
      await settle();
      const status = root(element).querySelector('.status')!;
      expect(status.textContent).toBe('/x could not be loaded (500).');
      expect(status.getAttribute('role')).toBe('alert');
      expect(root(element).querySelector('svg')).toBeNull();
      const loaded = next(element, 'load');
      element.source = yaml; // the same text as before the error
      await loaded;
      expect(root(element).querySelector('svg')).not.toBeNull();
      expect(status.textContent).toBe('');
    });

    it('lets an unfinished request of its own go', async () => {
      let answer!: (r: Response) => void;
      vi.stubGlobal(
        'fetch',
        vi.fn(() => new Promise<Response>((resolve) => (answer = resolve))),
      );
      const element = create({ src: '/slow' });
      await settle();
      element.showError({ kind: 'network', message: 'host error' });
      answer(new Response(yaml));
      await settle();
      expect(root(element).querySelector('.status')!.textContent).toBe('host error');
      expect(root(element).querySelector('svg')).toBeNull();
    });
  });

  describe('zoom and pan', () => {
    const open = async () => {
      const element = create({ source: yaml });
      await next(element, 'load');
      return element;
    };
    const scale = (e: AriadneSagaElement) => Number(/scale\(([\d.]+)\)/.exec(transform(e))![1]);
    const press = (e: AriadneSagaElement, key: string, init: KeyboardEventInit = {}) => {
      const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init });
      root(e).querySelector('.viewport')!.dispatchEvent(event);
      return event;
    };

    it('zooms with the buttons and fits again', async () => {
      const element = await open();
      const fitted = transform(element);
      const click = (action: string) =>
        root(element).querySelector<HTMLElement>(`[data-action="${action}"]`)!.click();
      click('zoom-in');
      expect(scale(element)).toBeCloseTo(1.25);
      click('zoom-out');
      click('zoom-out');
      expect(scale(element)).toBeCloseTo(0.8);
      click('fit');
      expect(transform(element)).toBe(fitted);
    });

    it('zooms with the wheel and prevents the page from scrolling', async () => {
      const element = await open();
      const wheel = new WheelEvent('wheel', { deltaY: -200, bubbles: true, cancelable: true });
      root(element).querySelector('.viewport')!.dispatchEvent(wheel);
      expect(wheel.defaultPrevented).toBe(true);
      expect(scale(element)).toBeGreaterThan(1);
    });

    it('pans by dragging', async () => {
      const element = await open();
      const viewport = root(element).querySelector('.viewport')!;
      const pointer = (type: string, x: number, y: number) =>
        viewport.dispatchEvent(
          new MouseEvent(type, { clientX: x, clientY: y, button: 0, bubbles: true }),
        );
      const before = transform(element);
      pointer('pointerdown', 10, 10);
      pointer('pointermove', 40, 25);
      pointer('pointerup', 40, 25);
      pointer('pointermove', 400, 400); // not dragging any more
      expect(transform(element)).toBe(
        before.replace(
          /translate\(([-\d.]+)px, ([-\d.]+)px\)/,
          (_m, x, y) => `translate(${+x + 30}px, ${+y + 15}px)`,
        ),
      );
    });

    it('pans and zooms with the keyboard', async () => {
      const element = await open();
      const before = transform(element);
      expect(press(element, 'ArrowLeft').defaultPrevented).toBe(true);
      expect(transform(element)).not.toBe(before);
      press(element, '+');
      press(element, '0');
      expect(transform(element)).toBe(before);
      press(element, '-');
      expect(scale(element)).toBeLessThan(1);
      expect(press(element, 'a').defaultPrevented).toBe(false);
      expect(press(element, 'ArrowUp', { ctrlKey: true }).defaultPrevented).toBe(false);
    });
  });

  describe('accessibility', () => {
    it("labels the diagram with the saga's name", async () => {
      const element = create({ source: yaml });
      await next(element, 'load');
      expect(root(element).querySelector('.viewport')!.getAttribute('aria-label')).toBe(
        'Saga diagram: Order',
      );
    });

    it('makes states and transitions reachable and announced, a label not twice', async () => {
      const element = create({ source: yaml });
      await next(element, 'load');
      const label = (selector: string) =>
        root(element).querySelector(selector)!.getAttribute('aria-label');
      expect(label('[data-node-id="state-1"]')).toBe('State: Reserving stock');
      expect(label('[data-node-id="start-1"]')).toBe('Start: Initial');
      expect(label('[data-node-id="end-1"]')).toBe('Final state: Completed');
      expect(label('[data-edge-id="edge-2"][data-part="line"]')).toBe(
        'Transition on StockReserved from Reserving stock to Completed',
      );
      expect(label('[data-edge-id="edge-3"][data-part="line"]')).toBe(
        'Compensation on Undo from Reserving stock to Initial',
      );
      const stops = root(element).querySelectorAll('[tabindex="0"]');
      // the viewport, 3 states, 3 transitions (their labels are hidden from the tab order)
      expect(stops).toHaveLength(7);
      expect(
        root(element)
          .querySelector('[data-edge-id="edge-2"][data-part="label"]')!
          .getAttribute('aria-hidden'),
      ).toBe('true');
    });

    it('has buttons with names, and no editing controls', async () => {
      const element = create({ source: yaml });
      await next(element, 'load');
      const buttons = [...root(element).querySelectorAll('button')];
      expect(buttons.map((b) => b.getAttribute('aria-label'))).toEqual([
        'Zoom in',
        'Zoom out',
        'Fit to view',
      ]);
      expect(root(element).querySelector('input, textarea, [contenteditable]')).toBeNull();
    });
  });
});
