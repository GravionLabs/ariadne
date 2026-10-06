import {
  AfterViewInit,
  Component,
  ElementRef,
  input,
  model,
  output,
  viewChild,
} from '@angular/core';
import { NewStateInit, NodeType, namingHint } from '@ariadne/core';
import { NODE_TYPES } from './node-types';

let nextId = 0;

/**
 * The two questions asked when a state is added: the event of its transition and its name. Enter
 * commits whatever is typed (empty fields give the default name and no event), Escape gives that
 * default result too; the parent decides what leaving the popover otherwise means. With more than one
 * type to choose from, a switch at the top changes what is added.
 */
@Component({
  selector: 'app-state-prompt',
  templateUrl: './state-prompt.html',
  styleUrl: './state-prompt.scss',
})
export class StatePrompt implements AfterViewInit {
  readonly type = model.required<NodeType>();
  /** The types to switch between; with fewer than two there is no switch. */
  readonly types = input<readonly NodeType[]>([]);
  readonly suggestions = input<readonly string[]>([]);
  /** Label of the event field; it differs when the state is inserted into a transition. */
  readonly eventLabel = input('Event');
  readonly committed = output<NewStateInit>();
  readonly cancelled = output<void>();

  protected readonly info = NODE_TYPES;
  protected readonly uid = `state-prompt-${nextId++}`;
  protected readonly namingHint = namingHint;
  private readonly firstField = viewChild.required<ElementRef<HTMLInputElement>>('firstField');
  private readonly nameField = viewChild.required<ElementRef<HTMLInputElement>>('nameField');

  ngAfterViewInit(): void {
    this.firstField().nativeElement.focus();
  }

  protected commit(event: Event): void {
    event.preventDefault();
    this.committed.emit({
      event: this.firstField().nativeElement.value,
      name: this.nameField().nativeElement.value,
    });
  }

  protected onKeydown(event: KeyboardEvent): void {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    event.stopPropagation();
    this.cancelled.emit();
  }
}
