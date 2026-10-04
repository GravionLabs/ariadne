import { NgTemplateOutlet } from '@angular/common';
import {
  Component,
  ElementRef,
  computed,
  effect,
  inject,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import {
  FCanvasComponent,
  FCreateConnectionEvent,
  FDeleteSelectedEvent,
  FFlowComponent,
  FFlowModule,
  FSelectionChangeEvent,
  FZoomDirective,
  provideFFlow,
  withA11y,
} from '@foblex/flow';
import { EditorHost } from '../host/editor-host';
import { EmbeddedSync } from '../host/embedded-sync';
import { DiagramStore } from '../model/diagram-store';
import { DiagramDocument } from '../storage/diagram-document';
import { Theme } from '../theme';
import { AddStepButton } from './add-step-button';
import { DiagramDetails } from './diagram-details';
import { DiagramLayout } from './diagram-layout';
import { EditorStore } from './editor-store';
import { PathPanel } from './path-panel';
import { PathStore } from './path-store';
import { WalkthroughPanel } from './walkthrough-panel';
import { WalkthroughStore } from './walkthrough-store';
import { ExportMenu } from './export-menu';
import { Icon } from './icon';
import { Inspector } from './inspector';
import { SagaImport } from '../import/saga-import';
import { CatalogPanel } from './catalog-panel';
import { sampleDiagram } from '../samples';
import { GenerateDialog } from './generate-dialog';
import { ImportDialog } from './import-dialog';
import { NewDiagramDialog } from './new-diagram-dialog';
import { ProblemsMenu } from './problems-menu';
import { SourcePanel } from './source-panel';
import { NodeCard } from './node-card';
import { APPEND_TYPES, DECISION, NODE_TYPES } from './node-types';
import { TransitionLabel } from './transition-label';
import {
  backEdgeIds,
  DiagramEdge,
  DiagramNode,
  Direction,
  eventKindOf,
  eventLabel,
  Finding,
  inputId,
  joinEventsOf,
  labelId,
  nodeIdOfConnector,
  nodeSize,
  NodeType,
  outputId,
  Point,
  SLOT_SIZE,
} from '@ariadne/core';

const FIT_PADDING = { x: 80, y: 80 };

@Component({
  imports: [
    NgTemplateOutlet,
    AddStepButton,
    CatalogPanel,
    PathPanel,
    WalkthroughPanel,
    DiagramDetails,
    ExportMenu,
    FFlowModule,
    Icon,
    Inspector,
    GenerateDialog,
    ImportDialog,
    NewDiagramDialog,
    NodeCard,
    ProblemsMenu,
    SourcePanel,
    TransitionLabel,
  ],
  providers: [
    // FF1011 (a node rendered away from its fNodePosition) is switched off: nodes are only ever
    // placed through fNodePosition, and the check misfires while the canvas pans or zooms (a 150 ms
    // CSS transition on the canvas, so every node reads as displaced by the length of the move).
    provideFFlow({ diagnostics: { maxNodePositionDrift: 0 } }, withA11y()),
    DiagramLayout,
    EditorStore,
    PathStore,
    WalkthroughStore,
  ],
  host: {
    '(window:keydown)': 'onKeydown($event)',
    '(window:beforeunload)': 'onBeforeUnload($event)',
  },
  selector: 'app-editor',
  styleUrl: './editor.scss',
  templateUrl: './editor.html',
})
export class Editor {
  protected readonly store = inject(DiagramStore);
  protected readonly file = inject(DiagramDocument);
  protected readonly ui = inject(EditorStore);
  protected readonly walk = inject(WalkthroughStore);
  protected readonly path = inject(PathStore);
  /** Walking through the saga or looking at a path: the diagram is read-only. */
  protected readonly walking = computed(() => this.walk.active() || this.path.active());
  private readonly newDialog = viewChild.required(NewDiagramDialog);
  private readonly importDialog = viewChild.required(ImportDialog);
  private readonly generateDialog = viewChild.required(GenerateDialog);
  private readonly sagaImport = inject(SagaImport);
  protected readonly layout = inject(DiagramLayout);
  protected readonly theme = inject(Theme);
  /** Inside a host (VS Code): it owns files, saving and undo; those controls are not shown. */
  protected readonly embedded = inject(EditorHost).embedded;
  protected readonly sync = inject(EmbeddedSync);
  protected readonly appendTypes = APPEND_TYPES;
  protected readonly slotSize = SLOT_SIZE;
  protected readonly inputId = inputId;
  protected readonly outputId = outputId;
  protected readonly slotInputId = (slotId: string) => `${slotId}:in`;

  private readonly flow = viewChild(FFlowComponent);
  private readonly canvas = viewChild(FCanvasComponent);
  private readonly zoom = viewChild(FZoomDirective);
  /** The layout options seen by the last relayout; a change means the whole graph moved. */
  private lastLayoutKey: string | null = null;

  /**
   * Everything that re-arranges the whole diagram, as one comparable value. Editing nodes or
   * edges is deliberately not part of it, so adding a state never moves the user's viewport.
   * New layout options (spacing, ranker) belong here.
   */
  private readonly layoutKey = computed(() => this.store.direction());

  /** The source panel (the diagram as YAML) next to the canvas; open state and width are remembered. */
  protected readonly sourceOpen = signal(remembered('source-open') === '1');
  protected readonly sourceWidth = signal(
    clamp(Number(remembered('source-width')) || SOURCE_DEFAULT_WIDTH, SOURCE_MIN_WIDTH, 4000),
  );
  private readonly body = viewChild<ElementRef<HTMLElement>>('body');

  /** Events the saga publishes itself; every other event comes from outside. */
  /** The events each join waits for (those of its incoming transitions). */
  protected readonly joins = computed(() => joinEventsOf(this.store.diagram()));

  /** Transitions that close a loop: not laid out, their label rides on the line. */
  /**
   * View mode: the "+" buttons and the dotted lines to them are hidden, to read or to take a
   * screenshot. Everything else still edits (inspector, keyboard, dragging a connection). Remembered.
   */
  protected readonly insertHidden = signal(remembered('hide-insert') === '1');

  protected toggleInsertHidden(): void {
    this.insertHidden.update((hidden) => !hidden);
    remember('hide-insert', this.insertHidden() ? '1' : '0');
  }

  /** Whether the "+" buttons are shown: not while walking (read-only), nor in view mode. */
  protected readonly insertShown = computed(() => !this.walking() && !this.insertHidden());

  /** The "+" slots. */
  protected readonly slots = computed(() => (this.insertShown() ? this.layout.slots() : []));

  protected readonly loops = computed(() => backEdgeIds(this.store.diagram()));

  /** What kind of event each transition reacts to (from the saga, outside it, a timeout). */
  protected readonly kindOf = computed(() => eventKindOf(this.store.diagram()));

  /** Spoken names of the states (`Decision: Check stock`) and transitions, for screen readers. */
  protected nodeLabel(node: DiagramNode): string {
    const info = this.layout.decisions().has(node.id) ? DECISION : NODE_TYPES[node.type];
    return `${info.label}: ${node.name}`;
  }

  protected edgeLabel(edge: DiagramEdge): string {
    const nodes = this.nodesById();
    const name = (id: string) => nodes.get(id)?.name ?? id;
    const kind = edge.kind === 'compensation' ? 'Compensation' : 'Transition';
    return `${kind} from ${name(edge.source)} to ${name(edge.target)}${edge.event ? ` on ${eventLabel(edge)}` : ''}`;
  }

  protected readonly edgesById = computed(() => new Map(this.store.edges().map((e) => [e.id, e])));
  private readonly nodesById = computed(() => new Map(this.store.nodes().map((n) => [n.id, n])));

  // The template hands these to inputs of the canvas and the cards. A value made in the template
  // (`nodeSize(...)`, `[]`, `{ x: 0, y: 0 }`, `[...route]`) is a new object on every change
  // detection, so every card and connection was told "changed" for any change, a selection
  // included: 1.5 s for 300 states. They are made once per change of what they depend on.
  protected readonly nodeSizes = computed(() => {
    const expanded = this.layout.expanded();
    return new Map(this.store.nodes().map((n) => [n.id, nodeSize(n, expanded.has(n.id))]));
  });
  protected readonly waypoints = computed(
    () => new Map([...this.layout.routes()].map(([id, route]) => [id, [...route]])),
  );
  protected readonly noEvents: string[] = [];
  protected readonly origin: Point = { x: 0, y: 0 };

  constructor() {
    // Runs after every relayout: fit or select once the new geometry is on the canvas.
    effect((onCleanup) => {
      this.layout.positions();
      // Any layout option change (also via undo/redo) refits; plain edits do not.
      const key = this.layoutKey();
      if (this.lastLayoutKey !== null && key !== this.lastLayoutKey) this.ui.requestFit();
      this.lastLayoutKey = key;
      // Pending work is read untracked: only a relayout, not requesting it, may run this effect.
      if (!untracked(() => this.ui.fitPending() || this.ui.pendingSelect())) return;
      const timer = setTimeout(() => {
        const { fit, select } = this.ui.takePending();
        if (fit) this.fitToScreen();
        if (select) {
          this.flow()?.select([select], [], false);
          // Keep the node being worked on in view as the graph grows.
          if (!fit) this.canvas()?.centerGroupOrNode(select, !prefersReducedMotion());
        }
      });
      onCleanup(() => clearTimeout(timer));
    });

    // Walking: emphasise where the saga is and the transition it just took, and keep it in view.
    effect((onCleanup) => {
      const node = this.walk.current();
      if (!node) return;
      const last = this.walk.lastStep();
      untracked(() => this.ui.setHighlight([node.id], last ? [last] : []));
      const timer = setTimeout(() =>
        this.canvas()?.centerGroupOrNode(node.id, !prefersReducedMotion()),
      );
      onCleanup(() => clearTimeout(timer));
    });
    // Looking at a path: emphasise the states visited and the transitions taken, and bring the
    // state the instance is in into view.
    effect((onCleanup) => {
      if (!this.path.active()) return;
      const result = this.path.result();
      untracked(() =>
        result
          ? this.ui.setHighlight(this.path.nodeIds(), this.path.edgeIds())
          : this.ui.clearHighlight(),
      );
      const current = result?.current;
      if (!current) return;
      const timer = setTimeout(() =>
        this.canvas()?.centerGroupOrNode(current, !prefersReducedMotion()),
      );
      onCleanup(() => clearTimeout(timer));
    });
    // The host showed a document: start with the whole diagram in view.
    effect(() => {
      if (this.sync.opened() > 0) untracked(() => this.afterReplace());
    });
    // The text was edited while walking and the path no longer holds: the walk is over.
    effect(() => {
      if (!this.walk.valid()) untracked(() => this.closeLeftPanel());
    });
  }

  protected onFirstRender(): void {
    this.fitToScreen(false);
  }

  /** "+" after a state: the picked state follows it. */
  protected append(sourceId: string, type: NodeType): void {
    if (this.walking()) return;
    const id = this.store.appendNode(sourceId, type);
    if (id) this.ui.selectNode(id);
  }

  /** "+" on a transition: the picked state goes between its two ends. */
  protected insert(edgeId: string, type: NodeType): void {
    if (this.walking()) return;
    const id = this.store.insertOnEdge(edgeId, type);
    if (id) this.ui.selectNode(id);
  }

  protected addStart(): void {
    if (this.walking()) return;
    this.ui.selectNode(this.store.addNode('start'));
  }

  /** The "any" node, whose transitions apply in every state. There is only one. */
  protected addAny(): void {
    if (this.walking()) return;
    this.ui.selectNode(this.store.addNode('any'));
  }

  protected setDirection(direction: Direction): void {
    if (this.walking()) return;
    this.store.setDirection(direction);
  }

  /** Asks for the saga's name (and description) first, so a new diagram never starts unnamed. */
  protected async newDiagram(): Promise<void> {
    if (!this.confirmDiscard()) return;
    const details = await this.newDialog().open();
    if (!details) return;
    // A sample opens like an import: a copy that is not saved anywhere yet.
    if (details.sample) this.file.openImported(sampleDiagram(details.sample));
    else this.file.newDiagram(details);
    this.afterReplace();
  }

  protected async open(): Promise<void> {
    if (this.confirmDiscard() && (await this.file.open())) this.afterReplace();
  }

  /**
   * Builds a diagram from MassTransit saga state machines in C# files. Everything happens here in
   * the browser; the diagram opens as a new, unsaved one, after the user has seen what was found
   * and what could not be shown.
   */
  protected async importCsharp(): Promise<void> {
    const files = await this.sagaImport.pick();
    if (!files) return;
    this.file.setNotice('Reading the C# files…');
    try {
      const result = await this.sagaImport.read(files);
      this.file.setNotice(null);
      const saga = await this.importDialog().open(result, files.length);
      if (!saga || !this.confirmDiscard()) return;
      this.file.openImported(saga.diagram);
      this.afterReplace();
    } catch (e) {
      this.file.setNotice(null);
      this.file.setError(`The C# files could not be read: ${(e as Error).message}`);
    }
  }

  /** Shows the C# for the diagram: generated here, in the browser, and not written anywhere yet. */
  protected async generateCsharp(): Promise<void> {
    try {
      const { generateSaga } = await import('@ariadne/masstransit/generate');
      const folder = this.file.name().replace(/\.(saga\.)?ya?ml$/i, '') || 'saga';
      this.generateDialog().open(generateSaga(this.store.diagram()), folder);
    } catch (e) {
      this.file.setError(`C# could not be generated: ${(e as Error).message}`);
    }
  }

  private afterReplace(): void {
    if (this.walking()) this.closeLeftPanel();
    this.clearSelection();
    this.ui.requestFit();
  }

  private confirmDiscard(): boolean {
    return !this.file.dirty() || confirm(`Discard unsaved changes to ${this.file.name()}?`);
  }

  protected onBeforeUnload(event: BeforeUnloadEvent): void {
    if (!this.embedded && this.file.dirty()) event.preventDefault();
  }

  protected onSelection(event: FSelectionChangeEvent): void {
    this.ui.setSelection(event.nodeIds, event.connectionIds);
  }

  protected onKeydown(event: KeyboardEvent): void {
    // The host handles save, open and undo itself, on the document.
    if (this.embedded || !(event.ctrlKey || event.metaKey)) return;
    const key = event.key.toLowerCase();
    // Typing in a text field has its own undo history, and Ctrl+Z there must not undo the diagram.
    const typing = isTextEntry(event.target);
    if (key === 's' || key === 'o') {
      this.commitTyping(event.target);
      if (key === 'o') void this.open();
      else if (event.shiftKey) void this.file.saveAs();
      else void this.file.save();
    } else if (typing) {
      return;
    } else if (this.walking()) {
      return;
    } else if (key === 'z' && !event.shiftKey) this.store.undo();
    else if ((key === 'z' && event.shiftKey) || key === 'y') this.store.redo();
    else return;
    event.preventDefault();
  }

  /**
   * Saving or opening while a field has an edit that is not applied yet (the inspector commits on
   * blur, the source editor after a pause): leave the field first, then come back to it.
   */
  private commitTyping(target: EventTarget | null): void {
    if (!isTextEntry(target)) return;
    const field = target as HTMLElement;
    field.blur();
    queueMicrotask(() => field.focus());
  }

  /**
   * A connection was dragged out of a state: onto another state it adds a transition between the
   * two, onto empty canvas it adds a state after the source.
   */
  protected onCreateConnection(event: FCreateConnectionEvent): void {
    if (this.walking()) return;
    const source = nodeIdOfConnector(event.sourceId);
    if (event.targetId) {
      this.store.connect(source, nodeIdOfConnector(event.targetId));
      return;
    }
    this.append(source, 'state');
  }

  protected deleteSelection(): void {
    if (this.walking()) return;
    this.store.remove(this.ui.selection());
    this.clearSelection();
  }

  /** The panel on the left of the canvas: the message catalog, the walkthrough or a path. */
  protected readonly leftPanel = signal<'messages' | 'walkthrough' | 'path' | null>(null);

  /** The panels that open on the left; in a host they are buttons of the toolbox. */
  protected readonly panels = [
    {
      id: 'walkthrough',
      label: 'Walkthrough',
      icon: 'play',
      title: 'Walkthrough: step through the saga event by event',
      toggle: () => this.toggleWalkthrough(),
    },
    {
      id: 'path',
      label: 'Path',
      icon: 'path',
      title: 'Path: show the path a saga instance took',
      toggle: () => this.togglePath(),
    },
    {
      id: 'messages',
      label: 'Messages',
      icon: 'event',
      title: 'Messages: the commands and events of the saga and where they are used',
      toggle: () => this.toggleMessages(),
    },
  ] as const;

  protected toggleMessages(): void {
    const opening = this.leftPanel() !== 'messages';
    this.closeLeftPanel();
    if (opening) this.leftPanel.set('messages');
  }

  protected toggleWalkthrough(): void {
    const opening = this.leftPanel() !== 'walkthrough';
    this.closeLeftPanel();
    if (!opening) return;
    this.walk.start();
    this.leftPanel.set('walkthrough');
  }

  protected togglePath(): void {
    const opening = this.leftPanel() !== 'path';
    this.closeLeftPanel();
    if (!opening) return;
    this.path.start();
    this.leftPanel.set('path');
  }

  /** Closes whichever panel is open; leaving a walkthrough or a path ends it and lets the diagram go. */
  protected closeLeftPanel(): void {
    if (this.walk.active() || this.path.active()) {
      this.walk.stop();
      this.path.stop();
      this.ui.clearHighlight();
    }
    this.leftPanel.set(null);
  }

  protected toggleSource(): void {
    this.sourceOpen.update((open) => !open);
    remember('source-open', this.sourceOpen() ? '1' : '0');
  }

  protected closeSource(): void {
    this.sourceOpen.set(false);
    remember('source-open', '0');
  }

  /** Dragging the divider between canvas and source panel. */
  protected startResize(event: PointerEvent): void {
    const handle = event.currentTarget as HTMLElement;
    handle.setPointerCapture(event.pointerId);
    const move = (e: PointerEvent) => this.resizeSource(e.clientX);
    const stop = () => {
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', stop);
      handle.removeEventListener('pointercancel', stop);
      remember('source-width', String(this.sourceWidth()));
    };
    handle.addEventListener('pointermove', move);
    handle.addEventListener('pointerup', stop);
    handle.addEventListener('pointercancel', stop);
    event.preventDefault();
  }

  /** The divider also works from the keyboard: arrows move it, Home/End jump. */
  protected resizeKey(event: KeyboardEvent): void {
    const step = event.shiftKey ? 80 : 24;
    const max = this.maxSourceWidth();
    const width = this.sourceWidth();
    const next =
      event.key === 'ArrowLeft'
        ? width + step
        : event.key === 'ArrowRight'
          ? width - step
          : event.key === 'Home'
            ? max
            : event.key === 'End'
              ? SOURCE_MIN_WIDTH
              : null;
    if (next === null) return;
    this.sourceWidth.set(clamp(next, SOURCE_MIN_WIDTH, max));
    remember('source-width', String(this.sourceWidth()));
    event.preventDefault();
  }

  private resizeSource(clientX: number): void {
    const body = this.body()?.nativeElement.getBoundingClientRect();
    if (!body) return;
    this.sourceWidth.set(clamp(body.right - clientX, SOURCE_MIN_WIDTH, this.maxSourceWidth()));
  }

  /** The canvas keeps at least a third of the space. */
  protected maxSourceWidth(): number {
    const total = this.body()?.nativeElement.getBoundingClientRect().width || window.innerWidth;
    return Math.max(SOURCE_MIN_WIDTH, Math.floor((total * 2) / 3));
  }

  protected clearSelection(): void {
    this.ui.clearSelection();
    this.flow()?.clearSelection();
  }

  protected zoomIn(): void {
    this.zoom()?.zoomIn();
  }

  protected zoomOut(): void {
    this.zoom()?.zoomOut();
  }

  protected fitToScreen(animated = true): void {
    // Never zoom in past 100%: a fresh diagram (one start node) would fill the screen.
    this.canvas()?.fitToScreen(FIT_PADDING, animated && !prefersReducedMotion(), true, 1);
  }

  protected resetZoom(): void {
    this.canvas()?.resetScaleAndCenter();
  }

  /** A problem was picked: select the node or transition it is about and bring it into view. */
  protected focusFinding(finding: Finding): void {
    const id = finding.elementId;
    if (!id) return;
    const edge = this.edgesById().get(id);
    if (edge) {
      this.selectEdge(id);
      // A laid-out transition has a label node to centre on; otherwise its source state.
      const laidOut = this.layout.labels().some((l) => l.edgeId === id);
      this.canvas()?.centerGroupOrNode(
        laidOut ? labelId(id) : edge.source,
        !prefersReducedMotion(),
      );
      return;
    }
    this.ui.setSelection([id], []);
    this.flow()?.select([id], [], false);
    this.canvas()?.centerGroupOrNode(id, !prefersReducedMotion());
  }

  /** A transition label was clicked: select its transition, as clicking the line would. */
  protected selectEdge(id: string): void {
    this.ui.selectEdge(id);
    this.flow()?.select([], [id], false);
  }

  /** The inspector's "Add transition": a new state follows the selected one. */
  protected appendToSelected(type: NodeType): void {
    const node = this.ui.selectedNode();
    if (node) this.append(node.id, type);
  }

  protected onDelete(event: FDeleteSelectedEvent): void {
    if (this.walking()) return;
    this.store.remove({ nodeIds: event.nodeIds, edgeIds: event.connectionIds });
    this.clearSelection();
  }
}

const SOURCE_MIN_WIDTH = 280;
const SOURCE_DEFAULT_WIDTH = 440;

/** `prefers-reduced-motion`: the canvas jumps instead of gliding. */
const prefersReducedMotion = (): boolean =>
  globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

const clamp = (value: number, min: number, max: number): number =>
  Math.min(Math.max(value, min), max);

/** Per-user conveniences in `localStorage`; the app works without it (private windows, blocked). */
function remembered(key: string): string | null {
  try {
    return localStorage.getItem(`ariadne.${key}`);
  } catch {
    return null;
  }
}

function remember(key: string, value: string): void {
  try {
    localStorage.setItem(`ariadne.${key}`, value);
  } catch {
    // Not remembered: fine.
  }
}

function isTextEntry(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
  );
}
