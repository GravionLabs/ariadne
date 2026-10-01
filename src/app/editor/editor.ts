import { Component, inject } from '@angular/core';
import {
  FCreateConnectionEvent,
  FDeleteSelectedEvent,
  FFlowModule,
  FMoveNodesEvent,
  provideFFlow,
  withA11y,
} from '@foblex/flow';
import { inConnectorId, nodeIdOfConnector, outConnectorId } from '../model/diagram';
import { DiagramStore } from '../model/diagram-store';

@Component({
  imports: [FFlowModule],
  providers: [provideFFlow(withA11y())],
  host: { '(window:keydown)': 'onKeydown($event)' },
  selector: 'app-editor',
  styleUrl: './editor.scss',
  templateUrl: './editor.html',
})
export class Editor {
  protected readonly store = inject(DiagramStore);
  protected readonly inId = inConnectorId;
  protected readonly outId = outConnectorId;

  private nextSpawn = 0;

  protected addStep(): void {
    const offset = (this.nextSpawn++ % 8) * 30;
    this.store.addNode('step', { x: 80 + offset, y: 80 + offset });
  }

  protected onKeydown(event: KeyboardEvent): void {
    if (!(event.ctrlKey || event.metaKey) || isTextEntry(event.target)) return;
    const key = event.key.toLowerCase();
    if (key === 'z' && !event.shiftKey) this.store.undo();
    else if ((key === 'z' && event.shiftKey) || key === 'y') this.store.redo();
    else return;
    event.preventDefault();
  }

  protected onMove(event: FMoveNodesEvent): void {
    this.store.moveNodes(event.nodes);
  }

  protected onCreateConnection(event: FCreateConnectionEvent): void {
    if (!event.targetId) return;
    this.store.connect(nodeIdOfConnector(event.sourceId), nodeIdOfConnector(event.targetId));
  }

  protected onDelete(event: FDeleteSelectedEvent): void {
    this.store.remove({ nodeIds: event.nodeIds, edgeIds: event.connectionIds });
  }
}

function isTextEntry(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
  );
}
