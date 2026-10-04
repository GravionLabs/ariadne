import { Diagram, DiagramEdge, DiagramNode, eventLabel } from '@ariadne/core';
import { renderDiagramSvg, SvgExport } from '@ariadne/export';
import { fetchSaga, Loaded, readSaga, ViewerError } from './read-saga';
import { STYLES } from './styles';
import { fitView, PAN_STEP, panBy, revealBox, View, ZOOM_STEP, zoomAt } from './view-transform';

export type ViewerTheme = 'light' | 'dark' | 'auto';
export type ViewerDirection = 'top-bottom' | 'left-right';

/** The `load` event: the saga was read and drawn. */
export type SagaLoadDetail = { diagram: Diagram };
/** The `error` event: why nothing is shown. */
export type SagaErrorDetail = ViewerError;

/** Without a DOM (server-side rendering) the module still loads; the element just cannot exist. */
const Base: typeof HTMLElement =
  typeof HTMLElement === 'undefined' ? (class {} as unknown as typeof HTMLElement) : HTMLElement;

let instances = 0;

/**
 * `<ariadne-saga>`: shows one saga read-only, drawn with the SVG renderer of `@ariadne/export`.
 *
 * - `src`: URL of a `.saga.yaml`, fetched; `source`: the YAML text (wins over `src`);
 * - `direction`: `top-bottom` or `left-right`, overriding the file's;
 * - `theme`: `light`, `dark` or `auto` (the default; follows `prefers-color-scheme`).
 *
 * Events `load` and `error` (see {@link SagaLoadDetail}, {@link SagaErrorDetail}); both bubble.
 */
export class AriadneSagaElement extends Base {
  static readonly observedAttributes = ['src', 'source', 'direction', 'theme'];

  readonly #id = `ariadne-${++instances}-`;
  readonly #name: HTMLElement;
  readonly #description: HTMLElement;
  readonly #header: HTMLElement;
  readonly #viewport: HTMLElement;
  readonly #stage: HTMLElement;
  readonly #status: HTMLElement;

  #diagram?: Diagram;
  #svg?: SvgExport;
  #view: View = { scale: 1, x: 0, y: 0 };
  /** Once the user zoomed or panned, a resize no longer re-fits the diagram. */
  #moved = false;
  #scheduled = false;
  #request = 0;
  #abort?: AbortController;
  #resize?: ResizeObserver;

  constructor() {
    super();
    const root = this.attachShadow({ mode: 'open' });
    root.innerHTML = `<style>${STYLES}</style>
<div class="frame" part="frame">
  <div class="header" part="header" hidden><h2 class="name"></h2><p class="description"></p></div>
  <div class="viewport" part="viewport" tabindex="0" role="group" aria-label="Saga diagram">
    <div class="stage" part="diagram"></div>
    <div class="toolbar" part="toolbar" role="toolbar" aria-label="Zoom">
      <button type="button" part="button" data-action="zoom-in" aria-label="Zoom in" title="Zoom in">+</button>
      <button type="button" part="button" data-action="zoom-out" aria-label="Zoom out" title="Zoom out">−</button>
      <button type="button" part="button" data-action="fit" aria-label="Fit to view" title="Fit to view">⤢</button>
    </div>
  </div>
  <div class="status" part="status" role="status" aria-live="polite"></div>
</div>`;
    const find = (selector: string) => root.querySelector<HTMLElement>(selector)!;
    this.#header = find('.header');
    this.#name = find('.name');
    this.#description = find('.description');
    this.#viewport = find('.viewport');
    this.#stage = find('.stage');
    this.#status = find('.status');
    this.#listen(root);
  }

  get src(): string | null {
    return this.getAttribute('src');
  }
  set src(value: string | null) {
    this.#reflect('src', value);
  }

  get source(): string | null {
    return this.getAttribute('source');
  }
  set source(value: string | null) {
    this.#reflect('source', value);
  }

  get direction(): ViewerDirection | null {
    const value = this.getAttribute('direction');
    return value === 'top-bottom' || value === 'left-right' ? value : null;
  }
  set direction(value: ViewerDirection | null) {
    this.#reflect('direction', value);
  }

  get theme(): ViewerTheme {
    const value = this.getAttribute('theme');
    return value === 'light' || value === 'dark' ? value : 'auto';
  }
  set theme(value: ViewerTheme | null) {
    this.#reflect('theme', value);
  }

  /** The diagram that is shown, once loaded. */
  get diagram(): Diagram | undefined {
    return this.#diagram;
  }

  connectedCallback(): void {
    if (typeof ResizeObserver !== 'undefined') {
      this.#resize = new ResizeObserver(() => {
        if (this.#svg && !this.#moved) this.fit();
      });
      this.#resize.observe(this.#viewport);
    }
    this.#schedule();
  }

  disconnectedCallback(): void {
    this.#resize?.disconnect();
    this.#abort?.abort();
  }

  attributeChangedCallback(name: string, before: string | null, after: string | null): void {
    if (before === after || !this.isConnected) return;
    this.#schedule();
  }

  zoomIn(): void {
    this.#zoom(ZOOM_STEP);
  }

  zoomOut(): void {
    this.#zoom(1 / ZOOM_STEP);
  }

  /** Shows the whole diagram, centred. */
  fit(): void {
    this.#moved = false;
    this.#setView(fitView(this.#content(), this.#extent()));
  }

  #reflect(name: string, value: string | null): void {
    if (value === null || value === undefined) this.removeAttribute(name);
    else this.setAttribute(name, value);
  }

  /** Attributes usually arrive together; load once after they all did. */
  #schedule(): void {
    if (this.#scheduled) return;
    this.#scheduled = true;
    queueMicrotask(() => {
      this.#scheduled = false;
      if (this.isConnected) void this.#load();
    });
  }

  async #load(): Promise<void> {
    const request = ++this.#request;
    this.#abort?.abort();
    const source = this.source;
    const src = this.src;
    if (!source && !src) {
      this.#clear();
      return;
    }
    this.#showStatus('Loading…', 'loading');
    let result: Loaded;
    if (source) {
      result = readSaga(source);
    } else {
      this.#abort = new AbortController();
      try {
        result = await fetchSaga(src!, this.#abort.signal);
      } catch {
        return; // aborted: a newer request took over
      }
    }
    if (request !== this.#request) return;
    if ('error' in result) {
      this.#clear();
      this.#showStatus(result.error.message, 'error');
      this.#emit('error', result.error);
      return;
    }
    this.#show({ ...result.diagram, direction: this.direction ?? result.diagram.direction });
    this.#emit('load', { diagram: this.#diagram! });
  }

  #show(diagram: Diagram): void {
    this.#diagram = diagram;
    this.#svg = renderDiagramSvg(diagram, {
      idPrefix: this.#id,
      cssVariables: true,
      addressable: true,
    });
    this.#stage.innerHTML = this.#svg.svg;
    this.#annotate(diagram);
    const name = diagram.name?.trim() ?? '';
    const description = diagram.description?.trim() ?? '';
    this.#name.textContent = name;
    this.#description.textContent = description;
    this.#name.hidden = !name;
    this.#description.hidden = !description;
    this.#header.hidden = !name && !description;
    this.#viewport.setAttribute('aria-label', name ? `Saga diagram: ${name}` : 'Saga diagram');
    this.#showStatus('', '');
    this.fit();
  }

  #clear(): void {
    this.#diagram = undefined;
    this.#svg = undefined;
    this.#stage.replaceChildren();
    this.#header.hidden = true;
    this.#showStatus('', '');
  }

  #showStatus(message: string, state: string): void {
    this.#status.textContent = message;
    this.#status.dataset['state'] = state;
    this.#status.setAttribute('role', state === 'error' ? 'alert' : 'status');
    this.toggleAttribute('aria-busy', state === 'loading');
  }

  #emit<T>(type: 'load' | 'error', detail: T): void {
    this.dispatchEvent(new CustomEvent<T>(type, { detail, bubbles: true, composed: true }));
  }

  /** States and transitions are reachable with Tab and announced; a transition's label is not a second stop. */
  #annotate(diagram: Diagram): void {
    const nodes = new Map(diagram.nodes.map((n) => [n.id, n]));
    this.#stage.querySelectorAll<SVGGElement>('[data-node-id]').forEach((g) => {
      const node = nodes.get(g.dataset['nodeId']!);
      if (node) focusable(g, describeNode(node));
    });
    this.#stage.querySelectorAll<SVGGElement>('[data-edge-id]').forEach((g) => {
      const edge = diagram.edges.find((e) => e.id === g.dataset['edgeId']);
      if (!edge) return;
      if (g.dataset['part'] === 'label') g.setAttribute('aria-hidden', 'true');
      else focusable(g, describeEdge(edge, nodes));
    });
  }

  #content() {
    return { width: this.#svg?.width ?? 0, height: this.#svg?.height ?? 0 };
  }

  #extent() {
    return { width: this.#viewport.clientWidth, height: this.#viewport.clientHeight };
  }

  #setView(view: View): void {
    this.#view = view;
    this.#stage.style.transform = `translate(${view.x}px, ${view.y}px) scale(${view.scale})`;
  }

  #zoom(factor: number, anchor?: { x: number; y: number }): void {
    if (!this.#svg) return;
    const extent = this.#extent();
    this.#moved = true;
    this.#setView(
      zoomAt(this.#view, factor, anchor ?? { x: extent.width / 2, y: extent.height / 2 }),
    );
  }

  #pan(dx: number, dy: number): void {
    if (!this.#svg) return;
    this.#moved = true;
    this.#setView(panBy(this.#view, dx, dy));
  }

  #listen(root: ShadowRoot): void {
    root.querySelector('.toolbar')!.addEventListener('click', (event) => {
      const action = (event.target as HTMLElement).closest<HTMLElement>('[data-action]')?.dataset[
        'action'
      ];
      if (action === 'zoom-in') this.zoomIn();
      else if (action === 'zoom-out') this.zoomOut();
      else if (action === 'fit') this.fit();
    });

    const viewport = this.#viewport;
    viewport.addEventListener(
      'wheel',
      (event) => {
        if (!this.#svg) return;
        event.preventDefault();
        const box = viewport.getBoundingClientRect();
        this.#zoom(Math.exp(-event.deltaY * 0.0015), {
          x: event.clientX - box.left,
          y: event.clientY - box.top,
        });
      },
      { passive: false },
    );

    let drag: { x: number; y: number } | undefined;
    viewport.addEventListener('pointerdown', (event) => {
      if (event.button !== 0 || (event.target as HTMLElement).closest('.toolbar')) return;
      drag = { x: event.clientX, y: event.clientY };
      viewport.classList.add('dragging');
      viewport.setPointerCapture?.(event.pointerId);
    });
    viewport.addEventListener('pointermove', (event) => {
      if (!drag) return;
      this.#pan(event.clientX - drag.x, event.clientY - drag.y);
      drag = { x: event.clientX, y: event.clientY };
    });
    const endDrag = () => {
      drag = undefined;
      viewport.classList.remove('dragging');
    };
    viewport.addEventListener('pointerup', endDrag);
    viewport.addEventListener('pointercancel', endDrag);

    viewport.addEventListener('keydown', (event) => {
      const step = event.shiftKey ? PAN_STEP * 3 : PAN_STEP;
      const handled = (
        {
          ArrowLeft: () => this.#pan(step, 0),
          ArrowRight: () => this.#pan(-step, 0),
          ArrowUp: () => this.#pan(0, step),
          ArrowDown: () => this.#pan(0, -step),
          '+': () => this.zoomIn(),
          '=': () => this.zoomIn(),
          '-': () => this.zoomOut(),
          _: () => this.zoomOut(),
          '0': () => this.fit(),
        } as Record<string, () => void>
      )[event.key];
      if (!handled || event.ctrlKey || event.metaKey || event.altKey) return;
      event.preventDefault();
      handled();
    });

    // A state reached with Tab scrolls into view.
    viewport.addEventListener('focusin', (event) => {
      const target = event.target as Element;
      if (target === viewport || !this.#svg) return;
      const box = target.getBoundingClientRect();
      const frame = viewport.getBoundingClientRect();
      if (!box.width && !box.height) return;
      const moved = revealBox(
        this.#view,
        { x: box.left - frame.left, y: box.top - frame.top, width: box.width, height: box.height },
        this.#extent(),
      );
      if (moved.x !== this.#view.x || moved.y !== this.#view.y) {
        this.#moved = true;
        this.#setView({ ...this.#view, x: moved.x, y: moved.y });
      }
    });
  }
}

function focusable(g: Element, label: string): void {
  g.setAttribute('tabindex', '0');
  g.setAttribute('role', 'img');
  g.setAttribute('aria-label', label);
}

const NODE_LABEL: Record<DiagramNode['type'], string> = {
  start: 'Start',
  end: 'Final state',
  state: 'State',
  any: 'Any state',
  join: 'Join',
};

function describeNode(node: DiagramNode): string {
  return `${NODE_LABEL[node.type]}: ${node.name}`;
}

function describeEdge(edge: DiagramEdge, nodes: Map<string, DiagramNode>): string {
  const name = (id: string) => nodes.get(id)?.name ?? id;
  const kind = edge.kind === 'compensation' ? 'Compensation' : 'Transition';
  const event = eventLabel(edge);
  return `${kind}${event ? ` on ${event}` : ''} from ${name(edge.source)} to ${name(edge.target)}`;
}

/** Registers `<ariadne-saga>` (or another tag name) once; safe to call again and without a DOM. */
export function defineAriadneSaga(tag = 'ariadne-saga'): void {
  if (typeof customElements === 'undefined' || customElements.get(tag)) return;
  customElements.define(tag, AriadneSagaElement);
}
