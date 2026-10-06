import { AfterViewInit, Component, ElementRef, input, output, viewChild } from '@angular/core';
import { FFlowModule } from '@foblex/flow';

/**
 * A text field that replaces a name or an event on the canvas. Enter or leaving the field commits
 * (once), Escape cancels. Keys and pointer stay in the field, so the diagram does not select, drag
 * or delete while typing.
 */
@Component({
  selector: 'app-inline-edit',
  imports: [FFlowModule],
  host: { '(pointerdown)': '$event.stopPropagation()', '(dblclick)': '$event.stopPropagation()' },
  template: `<input
    #field
    fDragBlocker
    type="text"
    autocomplete="off"
    [attr.aria-label]="label()"
    [attr.list]="list() || null"
    [placeholder]="placeholder()"
    [value]="value()"
    (keydown)="onKeydown($event)"
    (blur)="commit()"
  />`,
  styles: `
    :host {
      display: block;
      min-width: 0;
    }

    input {
      box-sizing: border-box;
      width: 100%;
      min-width: 0;
      padding: 0 4px;
      color: var(--c-text);
      background: var(--c-surface-1);
      border: 1px solid var(--c-primary);
      border-radius: var(--radius-sm, 4px);
      font: inherit;
      font-weight: 600;
      line-height: inherit;
      height: 1.6em;
    }

    input:focus-visible {
      outline: 2px solid var(--c-focus);
      outline-offset: 1px;
    }
  `,
})
export class InlineEdit implements AfterViewInit {
  readonly value = input('');
  readonly label = input.required<string>();
  readonly placeholder = input('');
  /** The id of a `<datalist>` of suggestions. */
  readonly list = input<string>();
  readonly committed = output<string>();
  readonly cancelled = output<void>();

  private readonly field = viewChild.required<ElementRef<HTMLInputElement>>('field');
  private done = false;

  ngAfterViewInit(): void {
    const input = this.field().nativeElement;
    input.focus();
    input.select();
  }

  protected onKeydown(event: KeyboardEvent): void {
    // Nothing typed here is a shortcut of the diagram (Delete, arrows, F2, Escape).
    event.stopPropagation();
    if (event.key === 'Enter') {
      event.preventDefault();
      this.commit();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      if (this.done) return;
      this.done = true;
      this.cancelled.emit();
    }
  }

  protected commit(): void {
    if (this.done) return;
    this.done = true;
    this.committed.emit(this.field().nativeElement.value);
  }
}
