import { Component, computed, inject, input, signal } from '@angular/core';
import { SagaInfo } from '@ariadne/core';
import { DiagramStore } from '../model/diagram-store';
import { Icon } from './icon';

/**
 * A card on the canvas with the saga's name; expanding it shows the description. Fields commit on
 * `change` (blur or Enter), so every edit is one undo step; unchanged values are not committed.
 */
@Component({
  selector: 'app-diagram-details',
  imports: [Icon],
  templateUrl: './diagram-details.html',
  styleUrl: './diagram-details.scss',
})
export class DiagramDetails {
  protected readonly store = inject(DiagramStore);

  /** The diagram is being walked through: look, don't edit. */
  readonly locked = input(false);

  protected readonly expanded = signal(false);
  protected readonly codeOpen = signal(false);

  /** The saga's code metadata (class, namespace, …): what generating C# needs. */
  protected readonly codeFields: readonly {
    key: keyof SagaInfo;
    label: string;
    placeholder: string;
  }[] = [
    { key: 'className', label: 'State machine class', placeholder: 'OrderStateMachine' },
    { key: 'namespace', label: 'Namespace', placeholder: 'Shop.Orders' },
    { key: 'instanceType', label: 'Saga instance type', placeholder: 'OrderState' },
    { key: 'stateProperty', label: 'Current state property', placeholder: 'CurrentState' },
    {
      key: 'contractsNamespace',
      label: 'Contracts namespace',
      placeholder: 'Shop.Orders.Contracts',
    },
    { key: 'source', label: 'C# file', placeholder: '../Sagas/OrderStateMachine.cs' },
  ];
  protected readonly saga = computed(() => this.store.diagram().saga ?? {});
  protected readonly codeCount = computed(() => Object.keys(this.saga()).length);

  protected toggleCode(): void {
    this.codeOpen.update((open) => !open);
  }

  protected setCode(key: keyof SagaInfo, event: Event): void {
    this.store.setSaga({ [key]: (event.target as HTMLInputElement).value });
  }

  protected toggle(): void {
    this.expanded.update((open) => !open);
  }

  protected setName(event: Event): void {
    this.store.setDetails({ name: (event.target as HTMLInputElement).value });
  }

  protected setDescription(event: Event): void {
    this.store.setDetails({ description: (event.target as HTMLTextAreaElement).value });
  }
}
