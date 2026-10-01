import { Component, computed, inject, signal, viewChild } from '@angular/core';
import {
  FCreateConnectionEvent,
  FCreateNodeEvent,
  FDeleteSelectedEvent,
  FFlowComponent,
  FFlowModule,
  FMoveNodesEvent,
  FSelectionChangeEvent,
  provideFFlow,
  withA11y,
} from '@foblex/flow';
import {
  NodeType,
  hasInput,
  hasOutput,
  inConnectorId,
  nodeIdOfConnector,
  outConnectorId,
} from '../model/diagram';
import { DiagramStore } from '../model/diagram-store';
import { DiagramDocument } from '../storage/diagram-document';

@Component({
  imports: [FFlowModule],
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
  protected readonly palette: readonly { type: NodeType; label: string; shape: string }[] = [
    { type: 'start', label: 'Start', shape: '▶' },
    { type: 'step', label: 'Step', shape: '▭' },
    { type: 'decision', label: 'Decision', shape: '◆' },
    { type: 'end', label: 'End', shape: '■' },
  ];
  protected readonly inId = inConnectorId;
  protected readonly outId = outConnectorId;
  protected readonly hasInput = hasInput;
  protected readonly hasOutput = hasOutput;

  private readonly selection = signal<{ nodeIds: string[]; edgeIds: string[] }>({
    nodeIds: [],
    edgeIds: [],
  });
  private nextSpawn = 0;
  private readonly flow = viewChild.required(FFlowComponent);

  /** The selected node if exactly one step is selected. */
  protected readonly selectedStep = computed(() => {
    const { nodeIds } = this.selection();
    if (nodeIds.length !== 1) return undefined;
    const node = this.store.nodes().find((n) => n.id === nodeIds[0]);
    return node?.type === 'step' ? node : undefined;
  });

  protected addNode(type: NodeType): void {
    const offset = (this.nextSpawn++ % 8) * 30;
    this.store.addNode(type, { x: 80 + offset, y: 80 + offset });
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
    if (event.targetId) {
      this.store.connect(source, nodeIdOfConnector(event.targetId));
      return;
    }
    // Dropped on empty canvas: create a step there, its input port under the cursor.
    const drop = this.flow().getPositionInFlow(event.dropPosition);
    const position = { x: drop.x, y: drop.y - NEW_NODE_PORT_OFFSET_Y };
    const id = this.store.addConnectedNode(source, 'step', position);
    if (id) this.selectNode(id);
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

/** Vertical distance from a step node's top edge to its `in` port (half its rendered height). */
const NEW_NODE_PORT_OFFSET_Y = 22;

function isTextEntry(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
  );
}
