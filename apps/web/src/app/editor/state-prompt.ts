import {
  AfterViewInit,
  Component,
  ElementRef,
  input,
  output,
  viewChild,
  inject,
} from '@angular/core';
import { NewStateInit, NodeType, namingHint } from '@ariadne/core';
import { NODE_TYPES } from './node-types';

let nextId = 0;

/**
 * The two questions asked when a state is added: the event of its transition and its name. Enter
 * commits whatever is typed (empty fields give the default name and no event), Escape gives that
 * default result too; the parent decides what leaving the popover otherwise means.
 */
@Component({
  selector: 'app-state-prompt',
  templateUrl: './state-prompt.html',
  styleUrl: './state-prompt.scss',
})
export class StatePrompt implements AfterViewInit {
  readonly type = input.required<NodeType>();
  readonly suggestions = input<readonly string[]>([]);
  /** Label of the event field; it differs when the state is inserted into a transition. */
  readonly eventLabel = input('Event');
  readonly committed = output<NewStateInit>();
  readonly cancelled = output<void>();

  protected readonly info = NODE_TYPES;
  protected readonly uid = `state-prompt-${nextId++}`;
  protected readonly namingHint = namingHint;
  private readonly firstField = viewChild.required<ElementRef<HTMLInputElement>>('firstField');
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  ngAfterViewInit(): void {
    this.firstField().nativeElement.focus();
  }

  protected commit(event: Event): void {
    event.preventDefault();
    const field = (name: string): string =>
      (this.host.nativeElement.querySelector(`[name=${name}]`) as HTMLInputElement).value;
    this.committed.emit({ event: field('event'), name: field('name') });
  }

  protected onKeydown(event: KeyboardEvent): void {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    event.stopPropagation();
    this.cancelled.emit();
  }
}
