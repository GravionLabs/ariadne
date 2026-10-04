import {
  Diagram,
  DiagramEdge,
  DiagramNode,
  eventLabel,
  Finding,
  MessageEntry,
  validate,
} from '@ariadne/core';
import { renderDiagramSvg, SvgExport } from '@ariadne/export';
import { FEATURES, parseFeatures, ViewerFeature } from './features';
import { Marks, applyMarks, SagaEmphasis, SagaSelection } from './marks';
import { messagesPanel, Panel, problemsPanel, SagaWalk, walkthroughPanel } from './panels';
import { fetchSaga, Loaded, readSaga, ViewerError } from './read-saga';
import { STYLES } from './styles';
import { fitView, PAN_STEP, panBy, revealBox, View, ZOOM_STEP, zoomAt } from './view-transform';

export type ViewerTheme = 'light' | 'dark' | 'auto';
export type ViewerDirection = 'top-bottom' | 'left-right';

/** The `load` event: the saga was read and drawn. */
export type SagaLoadDetail = { diagram: Diagram };
/** The `error` event: why nothing is shown. */
export type SagaErrorDetail = ViewerError;
/** The `select` event: the state or transition the user picked, or `null` when they cleared it. */
export type SagaSelectDetail = {
  selection: (SagaSelection & { node?: DiagramNode; edge?: DiagramEdge }) | null;
};
/** The `walkthrough` event: the path of the walkthrough after each step. */
export type SagaWalkDetail = SagaWalk;

/** Without a DOM (server-side rendering) the module still loads; the element just cannot exist. */
const Base: typeof HTMLElement =
  typeof HTMLElement === 'undefined' ? (class {} as unknown as typeof HTMLElement) : HTMLElement;

let instances = 0;

/** Controls drawn over the diagram: they take their own pointer and key events. */
const OVERLAY = '.toolbar, .tabs, .panels';

/**
 * `<ariadne-saga>`: shows one saga read-only, drawn with the SVG renderer of `@ariadne/export`.
 *
 * - `src`: URL of a `.saga.yaml`, fetched; `source`: the YAML text (wins over `src`);
 * - `direction`: `top-bottom` or `left-right`, overriding the file's;
 * - `theme`: `light`, `dark` or `auto` (the default; follows `prefers-color-scheme`);
 * - `features`: any of `walkthrough`, `messages`, `problems`, each with its panel (read-only);
 * - `emphasis` (property): states (id or name) and transitions (id) to pick out, e.g. where a running
 *   saga instance is; `selection` (property): the picked state or transition.
 *
 * Events `load`, `error`, `select` and `walkthrough`; they bubble.
 */
export class AriadneSagaElement extends Base {
  static readonly observedAttributes = ['src', 'source', 'direction', 'theme', 'features'];

  readonly #id = `ariadne-${++instances}-`;
  readonly #name: HTMLElement;
  readonly #description: HTMLElement;
  readonly #header: HTMLElement;
  readonly #viewport: HTMLElement;
  readonly #stage: HTMLElement;
  readonly #status: HTMLElement;
  readonly #tabs: HTMLElement;
  readonly #panels: HTMLElement;

  #diagram?: Diagram;
  #svg?: SvgExport;
  #view: View = { scale: 1, x: 0, y: 0 };
  /** Once the user zoomed or panned, a resize no longer re-fits the diagram. */
  #moved = false;
  #scheduled = false;
  #request = 0;
  #abort?: AbortController;
  #emphasis: SagaEmphasis | null = null;
  #selection: SagaSelection | null = null;
  #walk: SagaWalk | null = null;
  #message: MessageEntry | null = null;
  #findings: Finding[] = [];
  #open: ViewerFeature | null = null;
  #panel?: Panel;
  #resize?: ResizeObserver;

  constructor() {
    super();
    const root = this.attachShadow({ mode: 'open' });
    root.innerHTML = `<style>${STYLES}</style>
<div class="frame" part="frame">
  <div class="header" part="header" hidden><h2 class="name"></h2><p class="description"></p></div>
  <div class="viewport" part="viewport" tabindex="0" role="group" aria-label="Saga diagram">
    <div class="stage" part="diagram"></div>
    <div class="tabs" part="tabs" role="toolbar" aria-label="Views" hidden></div>
    <div class="panels" part="panels"></div>
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
    this.#tabs = find('.tabs');
    this.#panels = find('.panels');
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

  /** Which extras are on: `walkthrough`, `messages`, `problems`. */
  get features(): ViewerFeature[] {
    return parseFeatures(this.getAttribute('features'));
  }
  set features(value: readonly ViewerFeature[] | string | null) {
    this.#reflect(
      'features',
      value === null ? null : typeof value === 'string' ? value : value.join(' '),
    );
  }

  /** States and transitions picked out from outside; `null` for none. */
  get emphasis(): SagaEmphasis | null {
    return this.#emphasis;
  }
  set emphasis(value: SagaEmphasis | null) {
    this.#emphasis = value;
    this.#mark();
  }

  /** The picked state or transition. Setting it does not fire `select`. */
  get selection(): SagaSelection | null {
    return this.#selection;
  }
  set selection(value: SagaSelection | null) {
    this.#selection = value;
    this.#mark();
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
    if (name === 'features') {
      this.#setupFeatures();
      return;
    }
    if (name === 'theme') return;
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
    this.#selection = null;
    this.#walk = null;
    this.#message = null;
    this.#findings = validate(diagram);
    this.#setupFeatures();
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
    this.#closePanel();
    this.#tabs.hidden = true;
    this.#tabs.replaceChildren();
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

  #emit<T>(type: 'load' | 'error' | 'select' | 'walkthrough', detail: T): void {
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

  /** Tab buttons for the features that are on, and the open panel for the current diagram. */
  #setupFeatures(): void {
    const features = this.#diagram ? this.features : [];
    this.#tabs.replaceChildren();
    this.#tabs.hidden = !features.length;
    if (this.#open && !features.includes(this.#open)) this.#closePanel();
    for (const feature of FEATURES.filter((f) => features.includes(f))) {
      const count = feature === 'problems' ? this.#findings.length : 0;
      const tab = document.createElement('button');
      tab.type = 'button';
      tab.setAttribute('part', 'button');
      tab.dataset['feature'] = feature;
      tab.setAttribute('aria-pressed', String(this.#open === feature));
      tab.textContent = feature[0].toUpperCase() + feature.slice(1) + (count ? ` (${count})` : '');
      tab.addEventListener('click', () => this.#togglePanel(feature));
      this.#tabs.append(tab);
    }
    if (this.#open) this.#openPanel(this.#open);
    this.#mark();
  }

  #togglePanel(feature: ViewerFeature): void {
    if (this.#open === feature) this.#closePanel();
    else this.#openPanel(feature);
    this.#tabs
      .querySelectorAll<HTMLElement>('[data-feature]')
      .forEach((t) => t.setAttribute('aria-pressed', String(t.dataset['feature'] === this.#open)));
  }

  #openPanel(feature: ViewerFeature): void {
    const diagram = this.#diagram;
    if (!diagram) return;
    this.#panels.replaceChildren();
    this.#message = null;
    this.#walk = null;
    this.#open = feature;
    this.#panel =
      feature === 'walkthrough'
        ? walkthroughPanel(diagram, (walk) => {
            this.#walk = walk.steps.length ? walk : null;
            this.#mark();
            this.#emit('walkthrough', walk);
          })
        : feature === 'messages'
          ? messagesPanel(diagram, (entry) => {
              this.#message = entry;
              this.#mark();
            })
          : problemsPanel(diagram, this.#findings, (finding) => this.#pick(finding.elementId));
    this.#panels.append(this.#panel.element);
    this.#mark();
  }

  #closePanel(): void {
    const wasWalking = this.#walk !== null;
    this.#open = null;
    this.#panel = undefined;
    this.#walk = null;
    this.#message = null;
    this.#panels.replaceChildren();
    this.#mark();
    if (wasWalking) this.#emit('walkthrough', { steps: [], path: [] });
  }

  /** Selects a state or transition by id, as if clicked, and brings it into view. */
  #pick(id?: string): void {
    const diagram = this.#diagram;
    if (!id || !diagram) return;
    const selection: SagaSelection | null = diagram.nodes.some((n) => n.id === id)
      ? { kind: 'node', id }
      : diagram.edges.some((e) => e.id === id)
        ? { kind: 'edge', id }
        : null;
    if (!selection) return;
    this.#select(selection);
    const group = this.#stage.querySelector<SVGGElement>(
      `[data-${selection.kind}-id="${CSS.escape(id)}"]`,
    );
    if (group) this.#reveal(group);
  }

  #select(selection: SagaSelection | null): void {
    this.#selection = selection;
    this.#mark();
    const diagram = this.#diagram;
    const detail: SagaSelectDetail = {
      selection: selection
        ? selection.kind === 'node'
          ? { ...selection, node: diagram?.nodes.find((n) => n.id === selection.id) }
          : { ...selection, edge: diagram?.edges.find((e) => e.id === selection.id) }
        : null,
    };
    this.#emit('select', detail);
  }

  /** Writes selection, emphasis, walkthrough, message and problem marks onto the SVG. */
  #mark(): void {
    if (!this.#diagram) return;
    const marks: Marks = {
      emphasis: this.#emphasis,
      selection: this.#selection,
      walk: this.#walk && {
        nodes: this.#walk.path,
        edges: this.#walk.steps,
        current: this.#walk.path[this.#walk.path.length - 1],
      },
      message: this.#message,
      findings: this.features.includes('problems') ? this.#findings : [],
    };
    applyMarks(this.#stage, this.#diagram, marks);
  }

  /** Pans just enough to bring an element of the SVG into the viewport. */
  #reveal(target: Element): void {
    if (!this.#svg) return;
    const box = target.getBoundingClientRect();
    const frame = this.#viewport.getBoundingClientRect();
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

  #selectAt(target: Element): void {
    const group = target.closest<SVGGElement>('[data-node-id], [data-edge-id]');
    const selection: SagaSelection | null = group
      ? group.dataset['nodeId'] !== undefined
        ? { kind: 'node', id: group.dataset['nodeId'] }
        : { kind: 'edge', id: group.dataset['edgeId']! }
      : null;
    const same = selection?.kind === this.#selection?.kind && selection?.id === this.#selection?.id;
    // Picking the same one again clears it.
    const next = same ? null : selection;
    if (next || this.#selection) this.#select(next);
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
        if (!this.#svg || (event.target as Element).closest(OVERLAY)) return;
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
      if (event.button !== 0 || (event.target as HTMLElement).closest(OVERLAY)) return;
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
      if ((event.target as Element).closest(OVERLAY)) return;
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
      if (event.target !== viewport) this.#reveal(event.target as Element);
    });

    // A click (or Enter, Space on a focused item) picks a state or transition; a drag does not.
    let dragged = false;
    viewport.addEventListener('pointerdown', () => (dragged = false));
    viewport.addEventListener('pointermove', (event) => {
      if (event.buttons) dragged = true;
    });
    viewport.addEventListener('click', (event) => {
      if (dragged || !this.#svg || (event.target as Element).closest(OVERLAY)) return;
      this.#selectAt(event.target as Element);
    });
    viewport.addEventListener('keydown', (event) => {
      const target = event.target as Element;
      if (
        (event.key === 'Enter' || event.key === ' ') &&
        target !== viewport &&
        !target.closest(OVERLAY)
      ) {
        event.preventDefault();
        this.#selectAt(event.target as Element);
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
