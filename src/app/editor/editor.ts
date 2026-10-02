import { Component, computed, effect, inject, signal, viewChild } from '@angular/core';
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
import {
  Direction,
  NodeType,
  inputId,
  nodeIdOfConnector,
  outputId,
  publishedEvents,
} from '../model/diagram';
import { DiagramStore } from '../model/diagram-store';
import { DiagramDocument } from '../storage/diagram-document';
import { AddStepButton } from './add-step-button';
import { DiagramLayout, SLOT_SIZE, nodeSize } from './diagram-layout';
import { Icon } from './icon';
import { Inspector } from './inspector';
import { NodeCard } from './node-card';
import { APPEND_TYPES } from './node-types';
import { TransitionLabel } from './transition-label';

const FIT_PADDING = { x: 80, y: 80 };

@Component({
  imports: [AddStepButton, FFlowModule, Icon, Inspector, NodeCard, TransitionLabel],
  providers: [provideFFlow(withA11y()), DiagramLayout],
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
  protected readonly layout = inject(DiagramLayout);
  protected readonly appendTypes = APPEND_TYPES;
  protected readonly slotSize = SLOT_SIZE;
  protected readonly nodeSize = nodeSize;
  protected readonly inputId = inputId;
  protected readonly outputId = outputId;
  protected readonly slotInputId = (slotId: string) => `${slotId}:in`;

  private readonly selection = signal<{ nodeIds: string[]; edgeIds: string[] }>({
    nodeIds: [],
    edgeIds: [],
  });
  private readonly flow = viewChild(FFlowComponent);
  private readonly canvas = viewChild(FCanvasComponent);
  private readonly zoom = viewChild(FZoomDirective);
  /** Set when the next layout should be fitted into view (new file, layout option change). */
  private fitPending = false;
  /** The layout options seen by the last relayout; a change means the whole graph moved. */
  private lastLayoutKey: string | null = null;

  /**
   * Everything that re-arranges the whole diagram, as one comparable value. Editing nodes or
   * edges is deliberately not part of it, so adding a state never moves the user's viewport.
   * New layout options (spacing, ranker) belong here.
   */
  private readonly layoutKey = computed(() => this.store.direction());
  /** Node to select in f-flow once the layout has placed it. */
  private pendingSelect: string | null = null;

  protected readonly hasSelection = computed(() => {
    const { nodeIds, edgeIds } = this.selection();
    return nodeIds.length + edgeIds.length > 0;
  });

  /** The selected node if exactly one node (and nothing else) is selected. */
  protected readonly selectedNode = computed(() => {
    const { nodeIds, edgeIds } = this.selection();
    if (nodeIds.length !== 1 || edgeIds.length > 0) return undefined;
    return this.store.nodes().find((n) => n.id === nodeIds[0]);
  });

  /** Events the saga publishes itself; every other event comes from outside. */
  protected readonly published = computed(() => publishedEvents(this.store.diagram()));

  protected readonly edgesById = computed(() => new Map(this.store.edges().map((e) => [e.id, e])));

  /** The selected edge if exactly one edge (and nothing else) is selected. */
  protected readonly selectedEdge = computed(() => {
    const { nodeIds, edgeIds } = this.selection();
    if (edgeIds.length !== 1 || nodeIds.length > 0) return undefined;
    return this.store.edges().find((e) => e.id === edgeIds[0]);
  });

  constructor() {
    // Runs after every relayout: fit or select once the new geometry is on the canvas.
    effect((onCleanup) => {
      this.layout.positions();
      // Any layout option change (also via undo/redo) refits; plain edits do not.
      const key = this.layoutKey();
      if (this.lastLayoutKey !== null && key !== this.lastLayoutKey) this.fitPending = true;
      this.lastLayoutKey = key;
      if (!this.fitPending && !this.pendingSelect) return;
      const timer = setTimeout(() => {
        if (this.fitPending) this.fitToScreen();
        if (this.pendingSelect) {
          this.flow()?.select([this.pendingSelect], [], false);
          // Keep the node being worked on in view as the graph grows.
          if (!this.fitPending) this.canvas()?.centerGroupOrNode(this.pendingSelect, true);
        }
        this.fitPending = false;
        this.pendingSelect = null;
      });
      onCleanup(() => clearTimeout(timer));
    });
  }

  protected onFirstRender(): void {
    this.fitToScreen(false);
  }

  /** "+" after a state: the picked state follows it. */
  protected append(sourceId: string, type: NodeType): void {
    const id = this.store.appendNode(sourceId, type);
    if (id) this.selectNode(id);
  }

  /** "+" on a transition: the picked state goes between its two ends. */
  protected insert(edgeId: string, type: NodeType): void {
    const id = this.store.insertOnEdge(edgeId, type);
    if (id) this.selectNode(id);
  }

  protected addStart(): void {
    this.selectNode(this.store.addNode('start'));
  }

  protected setDirection(direction: Direction): void {
    this.store.setDirection(direction);
  }

  protected newDiagram(): void {
    if (!this.confirmDiscard()) return;
    this.file.newDiagram();
    this.afterReplace();
  }

  protected async open(): Promise<void> {
    if (this.confirmDiscard() && (await this.file.open())) this.afterReplace();
  }

  private afterReplace(): void {
    this.clearSelection();
    this.fitPending = true;
  }

  private confirmDiscard(): boolean {
    return !this.file.dirty() || confirm(`Discard unsaved changes to ${this.file.name()}?`);
  }

  protected onBeforeUnload(event: BeforeUnloadEvent): void {
    if (this.file.dirty()) event.preventDefault();
  }

  protected onSelection(event: FSelectionChangeEvent): void {
    this.selection.set({ nodeIds: event.nodeIds, edgeIds: event.connectionIds });
  }

  protected onKeydown(event: KeyboardEvent): void {
    if (!(event.ctrlKey || event.metaKey) || isTextEntry(event.target)) return;
    const key = event.key.toLowerCase();
    if (key === 's' && event.shiftKey) void this.file.saveAs();
    else if (key === 's') void this.file.save();
    else if (key === 'o') void this.open();
    else if (key === 'z' && !event.shiftKey) this.store.undo();
    else if ((key === 'z' && event.shiftKey) || key === 'y') this.store.redo();
    else return;
    event.preventDefault();
  }

  /**
   * A connection was dragged out of a state: onto another state it adds a transition between the
   * two, onto empty canvas it adds a state after the source.
   */
  protected onCreateConnection(event: FCreateConnectionEvent): void {
    const source = nodeIdOfConnector(event.sourceId);
    if (event.targetId) {
      this.store.connect(source, nodeIdOfConnector(event.targetId));
      return;
    }
    this.append(source, 'state');
  }

  protected deleteSelection(): void {
    this.store.remove(this.selection());
    this.clearSelection();
  }

  protected clearSelection(): void {
    this.selection.set({ nodeIds: [], edgeIds: [] });
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
    this.canvas()?.fitToScreen(FIT_PADDING, animated, true, 1);
  }

  protected resetZoom(): void {
    this.canvas()?.resetScaleAndCenter();
  }

  /** A transition label was clicked: select its transition, as clicking the line would. */
  protected selectEdge(id: string): void {
    this.selection.set({ nodeIds: [], edgeIds: [id] });
    this.flow()?.select([], [id], false);
  }

  private selectNode(id: string): void {
    this.selection.set({ nodeIds: [id], edgeIds: [] });
    // f-flow can only select the node once the layout has placed and rendered it.
    this.pendingSelect = id;
  }

  protected onDelete(event: FDeleteSelectedEvent): void {
    this.store.remove({ nodeIds: event.nodeIds, edgeIds: event.connectionIds });
    this.clearSelection();
  }
}

function isTextEntry(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
  );
}
