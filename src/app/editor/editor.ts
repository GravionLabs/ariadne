import { Component, computed, inject, signal, viewChild } from '@angular/core';
import {
  EFConnectableSide,
  FCanvasComponent,
  FCreateConnectionEvent,
  FCreateNodeEvent,
  FDeleteSelectedEvent,
  FFlowComponent,
  FFlowModule,
  FMoveNodesEvent,
  FSelectionChangeEvent,
  FZoomDirective,
  provideFFlow,
  withA11y,
} from '@foblex/flow';
import {
  DEFAULT_SOURCE_PORT,
  DEFAULT_TARGET_PORT,
  DiagramEdge,
  NodeType,
  PORTS,
  Point,
  Port,
  connectorId,
  hasInput,
  hasOutput,
  nodeIdOfConnector,
  oppositePort,
  portOfConnector,
} from '../model/diagram';
import { DiagramStore } from '../model/diagram-store';
import { DiagramDocument } from '../storage/diagram-document';
import { Icon, IconName } from './icon';

@Component({
  imports: [FFlowModule, Icon],
  providers: [provideFFlow(withA11y())],
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
  protected readonly palette: readonly { type: NodeType; label: string; icon: IconName }[] = [
    { type: 'start', label: 'Start', icon: 'start' },
    { type: 'step', label: 'Step', icon: 'step' },
    { type: 'decision', label: 'Decision', icon: 'decision' },
    { type: 'end', label: 'End', icon: 'end' },
  ];
  protected readonly ports = PORTS;
  protected readonly connectorId = connectorId;

  private readonly selection = signal<{ nodeIds: string[]; edgeIds: string[] }>({
    nodeIds: [],
    edgeIds: [],
  });
  private nextSpawn = 0;
  private readonly flow = viewChild.required(FFlowComponent);
  private readonly canvas = viewChild.required(FCanvasComponent);
  private readonly zoom = viewChild.required(FZoomDirective);

  protected readonly hasSelection = computed(() => {
    const { nodeIds, edgeIds } = this.selection();
    return nodeIds.length + edgeIds.length > 0;
  });

  /** The selected node if exactly one step is selected. */
  protected readonly selectedStep = computed(() => {
    const { nodeIds } = this.selection();
    if (nodeIds.length !== 1) return undefined;
    const node = this.store.nodes().find((n) => n.id === nodeIds[0]);
    return node?.type === 'step' ? node : undefined;
  });

  protected addNode(type: NodeType): void {
    const offset = (this.nextSpawn++ % 8) * 30;
    this.store.addNode(type, { x: 120 + offset, y: 80 + offset });
  }

  /** A palette item was dragged onto the canvas. */
  protected onCreateNode(event: FCreateNodeEvent<NodeType>): void {
    const { x, y } = event.externalItemRect;
    this.selectNode(this.store.addNode(event.data, { x, y }));
  }

  protected newDiagram(): void {
    if (this.confirmDiscard()) this.file.newDiagram();
  }

  protected async open(): Promise<void> {
    if (this.confirmDiscard()) await this.file.open();
  }

  private confirmDiscard(): boolean {
    return !this.file.dirty() || confirm(`Discard unsaved changes to ${this.file.name()}?`);
  }

  protected onBeforeUnload(event: BeforeUnloadEvent): void {
    if (this.file.dirty()) event.preventDefault();
  }

  protected toggleCompensation(): void {
    const step = this.selectedStep();
    if (!step) return;
    this.store.updateNode(step.id, {
      compensation: step.compensation ? undefined : { name: `Undo ${step.name}` },
    });
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

  protected onMove(event: FMoveNodesEvent): void {
    this.store.moveNodes(event.nodes);
  }

  protected onCreateConnection(event: FCreateConnectionEvent): void {
    const source = nodeIdOfConnector(event.sourceId);
    const sourcePort = portOfConnector(event.sourceId);
    if (event.targetId) {
      this.store.connect(source, nodeIdOfConnector(event.targetId), 'forward', {
        sourcePort,
        targetPort: portOfConnector(event.targetId),
      });
      return;
    }
    // Dropped on empty canvas: create a step there, attached by the port facing the source.
    const targetPort = oppositePort(sourcePort);
    const drop = this.flow().getPositionInFlow(event.dropPosition);
    const offset = stepPortOffset(targetPort);
    const position = { x: drop.x - offset.x, y: drop.y - offset.y };
    const id = this.store.addConnectedNode(source, 'step', position, { sourcePort, targetPort });
    if (id) this.selectNode(id);
  }

  /** f-flow connector id of an edge's source or target end. */
  protected edgeEnd(edge: DiagramEdge, end: 'source' | 'target'): string {
    return end === 'source'
      ? connectorId(edge.source, edge.sourcePort ?? DEFAULT_SOURCE_PORT)
      : connectorId(edge.target, edge.targetPort ?? DEFAULT_TARGET_PORT);
  }

  /** Start nodes only emit, end nodes only receive; every other port does both. */
  protected connectorType(type: NodeType): 'source' | 'target' | 'source-target' {
    if (!hasInput(type)) return 'source';
    if (!hasOutput(type)) return 'target';
    return 'source-target';
  }

  /** Edge ports leave straight out of their side; corners pick the side facing the other end. */
  protected connectableSide(port: Port): EFConnectableSide {
    return port.length === 1 ? EFConnectableSide.AUTO : EFConnectableSide.CALCULATE;
  }

  protected deleteSelection(): void {
    this.store.remove(this.selection());
    this.selection.set({ nodeIds: [], edgeIds: [] });
    this.flow().clearSelection();
  }

  protected selectAll(): void {
    this.flow().selectAll();
    const { fNodeIds, fConnectionIds } = this.flow().getSelection();
    this.selection.set({ nodeIds: fNodeIds, edgeIds: fConnectionIds });
  }

  protected zoomIn(): void {
    this.zoom().zoomIn();
  }

  protected zoomOut(): void {
    this.zoom().zoomOut();
  }

  protected fitToScreen(): void {
    this.canvas().fitToScreen({ x: 80, y: 80 });
  }

  protected resetZoom(): void {
    this.canvas().resetScaleAndCenter();
  }

  private selectNode(id: string): void {
    this.selection.set({ nodeIds: [id], edgeIds: [] });
    // Wait until the new node is rendered before f-flow can select it.
    setTimeout(() => this.flow().select([id], [], false));
  }

  protected onDelete(event: FDeleteSelectedEvent): void {
    this.store.remove({ nodeIds: event.nodeIds, edgeIds: event.connectionIds });
  }
}

/** Rendered size of a new step node (see `.node-step` in editor.scss). */
const STEP_SIZE = { width: 160, height: 44 };

/** Position of `port` relative to a new step node's top-left corner. */
function stepPortOffset(port: Port): Point {
  const x = port.includes('w') ? 0 : port.includes('e') ? STEP_SIZE.width : STEP_SIZE.width / 2;
  const y = port.includes('n') ? 0 : port.includes('s') ? STEP_SIZE.height : STEP_SIZE.height / 2;
  return { x, y };
}

function isTextEntry(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
  );
}
