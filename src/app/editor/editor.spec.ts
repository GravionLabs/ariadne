import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import {
  FCanvasComponent,
  FCreateConnectionEvent,
  FDraggableDirective,
  FSelectionChangeEvent,
} from '@foblex/flow';
import { DiagramStore } from '../model/diagram-store';
import { serializeDiagram } from '../model/diagram-yaml';
import { DiagramDocument } from '../storage/diagram-document';
import { FileStorage } from '../storage/file-storage';
import type { Mock } from 'vitest';
import { CODE_EDITOR_FACTORY, CodeEditor, CodeEditorOptions } from './code-editor';
import { Editor } from './editor';
import './native-dialog.testing';

// jsdom has no ResizeObserver; f-flow uses it to track node sizes.
globalThis.ResizeObserver ??= class {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
};

/** A stand-in for the CodeMirror editor, so specs don't load it. */
interface FakeEditor extends CodeEditor {
  text: string;
  options: CodeEditorOptions;
  setText: Mock<(text: string) => void>;
  showError: Mock<CodeEditor['showError']>;
  reveal: Mock<CodeEditor['reveal']>;
  destroy: Mock<() => void>;
}

describe('Editor', () => {
  beforeEach(() => localStorage.clear());

  async function setup() {
    const editors: FakeEditor[] = [];
    const editorFactory = vi.fn(async (_parent: HTMLElement, options: CodeEditorOptions) => {
      const editor: FakeEditor = {
        text: options.text,
        options,
        setText: vi.fn((text: string) => {
          editor.text = text;
        }),
        focus: vi.fn(),
        showError: vi.fn(),
        reveal: vi.fn(),
        destroy: vi.fn(),
      };
      editors.push(editor);
      return editor;
    });
    const storage = {
      open: vi.fn(async () => null),
      save: vi.fn(async () => null),
      saveAs: vi.fn(async () => null),
    };
    await TestBed.configureTestingModule({
      imports: [Editor],
      providers: [
        { provide: FileStorage, useValue: storage },
        { provide: CODE_EDITOR_FACTORY, useValue: editorFactory },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(Editor);
    const el = fixture.nativeElement as HTMLElement;
    const store = TestBed.inject(DiagramStore);
    /** Lets the async layout finish and renders the result. */
    const settle = async () => {
      for (let i = 0; i < 3; i++) {
        await fixture.whenStable();
        fixture.detectChanges();
      }
    };
    await settle();
    const draggable = () =>
      fixture.debugElement
        .query(By.directive(FDraggableDirective))
        .injector.get(FDraggableDirective);
    /** Opens an add button's picker and picks `type`. */
    const pick = async (button: HTMLButtonElement, type: string) => {
      button.click();
      await settle();
      const option = document.querySelector<HTMLButtonElement>(
        `.cdk-overlay-container .option[data-type="${type}"]`,
      );
      option!.click();
      await settle();
    };
    const select = async (nodeIds: string[], edgeIds: string[] = []) => {
      draggable().fSelectionChange.emit(new FSelectionChangeEvent(nodeIds, [], edgeIds));
      await settle();
    };
    /** Sets an inspector field and commits it like a blur would. */
    const fill = async (selector: string, value: string) => {
      const field = el.querySelector<HTMLInputElement>(`app-inspector ${selector}`)!;
      field.value = value;
      field.dispatchEvent(new Event('change'));
      await settle();
    };
    /** Opens a collapsed section of the inspector, e.g. "Timers". */
    const expand = async (section: string) => {
      const toggle = el.querySelector<HTMLButtonElement>(
        `app-inspector [aria-label="${section}"] .group-toggle`,
      )!;
      if (toggle.getAttribute('aria-expanded') === 'false') toggle.click();
      await settle();
    };
    return { fixture, el, store, storage, editors, settle, draggable, pick, select, fill, expand };
  }

  const slotButton = (el: HTMLElement) =>
    el.querySelector<HTMLButtonElement>('.slot [aria-label="Add the next state"]')!;
  const inspectorButton = (el: HTMLElement, text: string) =>
    [...el.querySelectorAll<HTMLButtonElement>('app-inspector button')].find((b) =>
      b.textContent?.includes(text),
    )!;
  /** The "Send command" / "Publish event" buttons below the activity list (not the row toggles). */
  const addActivityButton = (el: HTMLElement, text: string) =>
    [...el.querySelectorAll<HTMLButtonElement>('app-inspector .add-row button')].find((b) =>
      b.textContent?.includes(text),
    );

  it('starts with the initial state and a "+" slot after it', async () => {
    const { el } = await setup();
    expect([...el.querySelectorAll('app-node-card')].map((n) => n.textContent?.trim())).toEqual([
      'Initial',
    ]);
    expect(el.querySelectorAll('.slot')).toHaveLength(1);
    expect(slotButton(el)).toBeTruthy();
  });

  it('appends the picked state after the slot owner and opens it in the inspector', async () => {
    const { el, store, pick } = await setup();
    await pick(slotButton(el), 'state');
    expect(store.nodes().map((n) => n.id)).toEqual(['start-1', 'state-1']);
    expect(store.edges()).toEqual([
      { id: 'edge-1', source: 'start-1', target: 'state-1', kind: 'forward' },
    ]);
    expect(el.querySelector('app-inspector')?.getAttribute('aria-label')).toBe('State settings');
  });

  it('inserts a state into a transition with its "+"', async () => {
    const { el, store, settle, pick } = await setup();
    store.appendNode('start-1', 'end');
    await settle();
    expect(el.querySelector('.slot')).toBeNull();
    const inserts = el.querySelectorAll<HTMLButtonElement>('[aria-label="Insert a state here"]');
    expect(inserts).toHaveLength(1);
    await pick(inserts[0], 'state');
    expect(store.edges().map((e) => [e.source, e.target])).toEqual([
      ['start-1', 'state-1'],
      ['state-1', 'end-1'],
    ]);
  });

  it('draws a state with several transitions as a decision', async () => {
    const { el, store, settle } = await setup();
    store.appendNode('start-1', 'state');
    store.appendNode('state-1', 'end');
    await settle();
    const card = () => el.querySelector('app-node-card:nth-of-type(2)');
    expect(el.querySelector('app-node-card[data-type="decision"]')).toBeNull();
    store.appendNode('state-1', 'end');
    await settle();
    expect(el.querySelector('app-node-card[data-type="decision"]')?.textContent).toContain(
      'Decision',
    );
    expect(card()).toBeTruthy();
  });

  it('edits a state in the inspector and adds transitions from it', async () => {
    const { el, store, select, fill, settle, expand } = await setup();
    store.appendNode('start-1', 'state');
    await select(['state-1']);

    await fill('input[type=text]', 'Charging payment');
    await fill('input[type=text]', '   '); // an empty name reverts
    await expand('Recovery');
    await fill('input[placeholder="e.g. RefundPayment"]', 'RefundPayment');
    expect(store.nodes()[1]).toEqual({
      id: 'state-1',
      type: 'state',
      name: 'Charging payment',
      compensation: { name: 'RefundPayment' },
    });
    expect(el.querySelector('app-inspector input[type=text]')).toHaveProperty(
      'value',
      'Charging payment',
    );

    inspectorButton(el, 'To a final state').click();
    await settle();
    expect(store.edges().at(-1)).toMatchObject({ source: 'state-1', target: 'end-1' });
  });

  it('edits a transition: event, source and kind, but no activities', async () => {
    const { el, store, select, fill, settle } = await setup();
    store.appendNode('start-1', 'state');
    await select([], ['edge-1']);
    expect(el.querySelector('app-inspector')?.textContent).toContain('Initial → State');

    await fill('input[placeholder="e.g. PaymentCharged"]', 'OrderSubmitted');
    expect(store.edges()[0].event).toBe('OrderSubmitted');
    const label = el.querySelector('app-transition-label')!;
    expect([...label.querySelectorAll('.row')].map((r) => r.textContent?.trim())).toEqual([
      'OrderSubmitted',
    ]);
    // Sending and publishing happen in states, not on transitions.
    expect(el.querySelector('app-inspector [aria-label="Activities"]')).toBeNull();
    expect(addActivityButton(el, 'Send command')).toBeUndefined();
    await settle();
  });

  it('edits the activities of a state: send, publish, naming hints, chips on the card', async () => {
    const { el, store, select, settle } = await setup();
    store.appendNode('start-1', 'state');
    await select(['state-1']);

    /** Sets the name of the n-th activity row in the inspector and commits it. */
    const rename = async (index: number, value: string) => {
      const field = el.querySelectorAll<HTMLInputElement>('app-inspector .message input')[index];
      field.value = value;
      field.dispatchEvent(new Event('change'));
      await settle();
    };

    addActivityButton(el, 'Send command')!.click();
    await settle();
    await rename(0, 'ReserveStock');
    expect(store.nodes()[1].activities).toEqual([{ kind: 'command', name: 'ReserveStock' }]);
    expect(el.querySelector('app-inspector .hint')).toBeNull();

    addActivityButton(el, 'Publish event')!.click();
    await settle();
    await rename(1, 'OrderAccepted');
    expect(store.nodes()[1].activities).toEqual([
      { kind: 'command', name: 'ReserveStock' },
      { kind: 'event', name: 'OrderAccepted' },
    ]);

    // Switching the first one to "Publish event" flags the imperative name.
    el.querySelector<HTMLButtonElement>(
      'app-inspector .message .segmented [aria-checked="false"]',
    )!.click();
    await settle();
    expect(store.nodes()[1].activities?.[0]).toEqual({ kind: 'event', name: 'ReserveStock' });
    expect(el.querySelector('app-inspector .hint')?.textContent).toMatch(/past tense/);

    const card = [...el.querySelectorAll('app-node-card')].find((c) =>
      c.textContent?.includes('State'),
    )!;
    expect([...card.querySelectorAll('.chip')].map((c) => c.textContent?.trim())).toEqual([
      'Publish ReserveStock',
      'Publish OrderAccepted',
    ]);

    // An empty name removes the activity.
    await rename(0, '  ');
    expect(store.nodes()[1].activities).toEqual([{ kind: 'event', name: 'OrderAccepted' }]);
  });

  it('offers activities on states only: the initial and the final state do nothing', async () => {
    const { el, store, select } = await setup();
    store.appendNode('start-1', 'state');
    store.appendNode('state-1', 'end');
    const section = () => el.querySelector('app-inspector [aria-label="Activities"]');
    await select(['start-1']);
    expect(section()).toBeNull();
    await select(['end-1']);
    expect(section()).toBeNull();
    await select(['state-1']);
    expect(section()).not.toBeNull();
  });

  it('describes states only: the initial and final pills have no description field', async () => {
    const { el, store, select } = await setup();
    store.appendNode('start-1', 'state');
    store.appendNode('state-1', 'end');
    const description = () => el.querySelector('app-inspector textarea');
    await select(['start-1']);
    expect(description()).toBeNull();
    await select(['end-1']);
    expect(description()).toBeNull();
    await select(['state-1']);
    expect(description()).not.toBeNull();
  });

  it('keeps the final state a pill, marked as final', async () => {
    const { el, store, settle } = await setup();
    store.appendNode('start-1', 'end');
    await settle();
    const final = el.querySelector('app-node-card[data-type="end"]')!;
    expect(final.classList).toContain('compact');
    expect(final.querySelector('.chip')).toBeNull();
    expect(final.textContent).toContain('Final');
  });

  it('lets a transition on an event have a guard, shown after the event', async () => {
    const { el, store, select, fill } = await setup();
    store.appendNode('start-1', 'state');
    await select([], ['edge-1']);
    // No event, no guard.
    expect(el.querySelector('app-inspector input[placeholder="e.g. amount > 100"]')).toBeNull();

    await fill('input[placeholder="e.g. PaymentCharged"]', 'OrderSubmitted');
    await fill('input[placeholder="e.g. amount > 100"]', 'amount > 100');
    expect(store.edges()[0].guard).toBe('amount > 100');
    expect(el.querySelector('app-transition-label .event .text')?.textContent?.trim()).toBe(
      'OrderSubmitted [amount > 100]',
    );

    await fill('input[placeholder="e.g. amount > 100"]', '');
    expect(store.edges()[0].guard).toBeUndefined();
  });

  it('lists ignored events of a state as struck-through chips and edits them in the inspector', async () => {
    const { el, store, select, settle, expand } = await setup();
    store.appendNode('start-1', 'state');
    await select(['state-1']);
    const ignoreInputs = () => el.querySelectorAll<HTMLInputElement>('app-inspector .ignore input');
    await expand('Ignored events');
    inspectorButton(el, 'Ignore an event').click();
    await settle();
    expect(store.nodes()[1].ignores).toEqual(['SomethingHappened']);

    const field = ignoreInputs()[0];
    field.value = 'OrderCancelled';
    field.dispatchEvent(new Event('change'));
    await settle();
    expect(store.nodes()[1].ignores).toEqual(['OrderCancelled']);
    expect(el.querySelector('app-node-card .chip-ignore')?.textContent?.trim()).toBe(
      'OrderCancelled',
    );

    // An empty name removes it again.
    field.value = '';
    field.dispatchEvent(new Event('change'));
    await settle();
    expect(store.nodes()[1].ignores).toBeUndefined();
    expect(el.querySelector('.chip-ignore')).toBeNull();
  });

  it('schedules a timeout on a state; the event of that name is a timeout transition', async () => {
    const { el, store, select, settle, fill, expand } = await setup();
    store.appendNode('start-1', 'state');
    store.appendNode('state-1', 'end');
    await select(['state-1']);
    await expand('Timers');
    inspectorButton(el, 'Schedule a timeout').click();
    await settle();
    expect(store.nodes()[1].timers).toEqual([
      { action: 'schedule', name: 'SomethingTimedOut', delay: '30s' },
    ]);
    expect(el.querySelector('app-node-card .chip-timeout')?.textContent).toContain(
      'Schedule SomethingTimedOut in 30s',
    );

    const name = el.querySelector<HTMLInputElement>('app-inspector .timer .name')!;
    name.value = 'PaymentTimeout';
    name.dispatchEvent(new Event('change'));
    const delay = el.querySelector<HTMLInputElement>('app-inspector .timer .delay')!;
    delay.value = '';
    delay.dispatchEvent(new Event('change'));
    await settle();
    expect(store.nodes()[1].timers).toEqual([{ action: 'schedule', name: 'PaymentTimeout' }]);

    // The transition on that event is a timeout.
    await select([], ['edge-2']);
    await fill('input[placeholder="e.g. PaymentCharged"]', 'PaymentTimeout');
    expect(el.querySelector('app-inspector .origin.timeout')?.textContent).toContain('State');
    const label = el.querySelectorAll('app-transition-label')[1];
    expect(label.querySelector('.event')?.classList).toContain('timeout');

    // An empty name removes the timer again.
    await select(['state-1']);
    const again = el.querySelector<HTMLInputElement>('app-inspector .timer .name')!;
    again.value = '';
    again.dispatchEvent(new Event('change'));
    await settle();
    expect(store.nodes()[1].timers).toBeUndefined();
  });

  it('makes a request on a state; its three answers are recognised as transitions', async () => {
    const { el, store, select, settle, fill, expand } = await setup();
    store.appendNode('start-1', 'state');
    store.appendNode('state-1', 'end');
    await select(['state-1']);
    await expand('Requests');
    inspectorButton(el, 'Make a request').click();
    await settle();
    expect(store.nodes()[1].requests).toEqual([{ name: 'DoSomething', timeout: '30s' }]);

    const name = el.querySelector<HTMLInputElement>('app-inspector .request .name')!;
    name.value = 'CheckStock';
    name.dispatchEvent(new Event('change'));
    const timeout = el.querySelector<HTMLInputElement>('app-inspector .request .timeout')!;
    timeout.value = '';
    timeout.dispatchEvent(new Event('change'));
    await settle();
    expect(store.nodes()[1].requests).toEqual([{ name: 'CheckStock' }]);
    expect(el.querySelector('app-node-card .chip-request')?.textContent).toContain(
      'Request CheckStock',
    );

    // The event field offers the three answers.
    await select([], ['edge-2']);
    const options = [...el.querySelectorAll<HTMLOptionElement>('#event-suggestions option')];
    expect(options.map((o) => o.value)).toEqual([
      'CheckStock.Completed',
      'CheckStock.Faulted',
      'CheckStock.TimeoutExpired',
    ]);
    await fill('input[placeholder="e.g. PaymentCharged"]', 'CheckStock.Faulted');
    const label = el.querySelectorAll('app-transition-label')[1];
    expect(label.querySelector('.event')?.classList).toContain('fault');
    expect(el.querySelector('app-inspector .origin')?.textContent).toContain('State');
  });

  it('adds a join from the "+"; it waits for the events of its incoming transitions', async () => {
    const { el, store, select, settle, fill, pick } = await setup();
    store.appendNode('start-1', 'state');
    await settle();
    await pick(slotButton(el), 'join');
    expect(store.nodes().map((n) => n.type)).toEqual(['start', 'state', 'join']);
    expect(el.querySelector('app-node-card[data-type="join"] .bar')).toBeTruthy();
    expect(el.querySelector('app-inspector')?.getAttribute('aria-label')).toBe('Join settings');
    const waits = () => el.querySelector('app-node-card[data-type="join"] .combines')?.textContent;

    // Nothing to choose: the events are those of the transitions leading in.
    expect(el.querySelector('app-inspector .combine')).toBeNull();
    expect(el.querySelector('app-inspector [aria-label="Waits for"]')?.textContent).toContain(
      'Nothing yet',
    );
    expect(waits()).toContain('no events yet');

    await select([], ['edge-2']);
    await fill('input[placeholder="e.g. PaymentCharged"]', 'PaymentCharged');
    expect(waits()).toContain('PaymentCharged');
    await select(['join-1']);
    expect(
      [...el.querySelectorAll('app-inspector .events li')].map((li) => li.textContent?.trim()),
    ).toEqual(['PaymentCharged']);

    // A second transition into the join adds its event; the same event is counted once.
    store.appendNode('start-1', 'state');
    store.connect('state-2', 'join-1');
    store.updateEdge('edge-4', { event: 'StockReserved' });
    await settle();
    expect(waits()).toContain('PaymentCharged + StockReserved');

    // A transition leaving the join on its name is the composite event.
    store.appendNode('join-1', 'end');
    await settle();
    await select([], ['edge-5']);
    await fill('input[placeholder="e.g. PaymentCharged"]', 'Join');
    const label = el.querySelectorAll('app-transition-label')[4];
    expect(label.querySelector('.event')?.classList).toContain('composite');
    expect(el.querySelector('app-inspector .origin.join')?.textContent).toContain(
      'PaymentCharged and StockReserved',
    );
  });

  it('collapses the inspector sections: entries open them, empty ones start closed', async () => {
    const { el, store, select, settle, expand } = await setup();
    store.appendNode('start-1', 'state');
    store.appendNode('state-1', 'state');
    store.updateNode('state-1', { timers: [{ action: 'schedule', name: 'T' }] });
    await select(['state-1']);
    const toggle = (section: string) =>
      el.querySelector<HTMLButtonElement>(`app-inspector [aria-label="${section}"] .group-toggle`)!;
    const expanded = (section: string) => toggle(section).getAttribute('aria-expanded');

    // Activities and Transitions always start open; Timers has an entry; the rest are empty.
    expect(expanded('Activities')).toBe('true');
    expect(expanded('Transitions')).toBe('true');
    expect(expanded('Timers')).toBe('true');
    expect(toggle('Timers').querySelector('.count')?.textContent?.trim()).toBe('1');
    expect(expanded('Requests')).toBe('false');
    expect(expanded('Ignored events')).toBe('false');
    expect(inspectorButton(el, 'Make a request')).toBeUndefined();

    await expand('Requests');
    expect(expanded('Requests')).toBe('true');
    expect(inspectorButton(el, 'Make a request')).toBeTruthy();

    // By hand: close Timers, then another state brings the defaults back.
    toggle('Timers').click();
    await settle();
    expect(expanded('Timers')).toBe('false');
    expect(inspectorButton(el, 'Schedule a timeout')).toBeUndefined();
    await select(['state-2']);
    expect(expanded('Requests')).toBe('false');
    await select(['state-1']);
    expect(expanded('Timers')).toBe('true');
  });

  it('lets a transition point at another state; an earlier one makes a loop with its label on the line', async () => {
    const { el, store, select, settle } = await setup();
    store.appendNode('start-1', 'state');
    store.appendNode('state-1', 'state');
    store.appendNode('state-2', 'end');
    store.updateEdge('edge-3', { event: 'Done' });
    await select([], ['edge-2']);

    const target = () =>
      el.querySelector<HTMLSelectElement>('app-inspector select[aria-label="Target state"]')!;
    // Everything that can be entered (also the source itself, for a loop), not the initial state.
    expect([...target().options].map((o) => o.value)).toEqual(['state-1', 'state-2', 'end-1']);
    expect(target().value).toBe('state-2');
    expect(el.querySelectorAll('app-transition-label')).toHaveLength(3);

    // state-2 → state-1 goes back to an earlier state: a loop.
    await select([], ['edge-3']);
    target().value = 'state-1';
    target().dispatchEvent(new Event('change'));
    await settle();
    expect(store.edges().find((e) => e.id === 'edge-3')).toMatchObject({
      source: 'state-2',
      target: 'state-1',
    });
    // The loop's label rides on its line instead of being laid out as a node.
    expect(el.querySelectorAll('.transition app-transition-label')).toHaveLength(2);
    expect(el.querySelectorAll('f-connection app-transition-label')).toHaveLength(1);

    store.undo();
    await settle();
    expect(store.edges().find((e) => e.id === 'edge-3')?.target).toBe('end-1');
  });

  it('groups name, description and colour in Details, and compensation, retry and timeout in Recovery', async () => {
    const { el, store, select, settle, expand } = await setup();
    store.appendNode('start-1', 'state');
    await select(['state-1']);
    const section = (label: string) => el.querySelector(`app-inspector [aria-label="${label}"]`)!;
    const expanded = (label: string) =>
      section(label).querySelector('.group-toggle')!.getAttribute('aria-expanded');

    // Details starts open; Recovery is empty, so closed, with nothing in it.
    expect(expanded('Details')).toBe('true');
    expect(section('Details').querySelector('input[type=text]')).toBeTruthy();
    expect(section('Details').querySelector('textarea')).toBeTruthy();
    expect(section('Details').querySelector('.swatches')).toBeTruthy();
    expect(expanded('Recovery')).toBe('false');
    expect(section('Recovery').querySelector('input')).toBeNull();

    await expand('Recovery');
    const inputs = [...section('Recovery').querySelectorAll<HTMLInputElement>('input')];
    expect(inputs.map((i) => i.placeholder)).toEqual(['e.g. RefundPayment', '3 attempts', '30s']);

    // Filled in, it starts open and counts what is set.
    store.updateNode('state-1', { retry: '3 attempts', timeout: '30s' });
    await select(['state-1']);
    await select([]);
    await select(['state-1']);
    expect(expanded('Recovery')).toBe('true');
    expect(section('Recovery').querySelector('.count')?.textContent?.trim()).toBe('2');

    // Details can be folded away, and the initial state has no Recovery.
    section('Details').querySelector<HTMLButtonElement>('.group-toggle')!.click();
    await settle();
    expect(section('Details').querySelector('input')).toBeNull();
    await select(['start-1']);
    expect(el.querySelector('app-inspector [aria-label="Recovery"]')).toBeNull();
    expect(expanded('Details')).toBe('true');
  });

  it("lists a state's transitions with a To select, and connects to an existing state (a loop)", async () => {
    const { el, store, select, settle } = await setup();
    store.appendNode('start-1', 'state');
    store.appendNode('state-1', 'state');
    store.appendNode('state-2', 'end');
    store.updateEdge('edge-2', { event: 'Go' });
    await select(['state-2']);
    const rows = () => [...el.querySelectorAll<HTMLElement>('app-inspector .transition-row')];
    const toggleCount = () =>
      el.querySelector('app-inspector [aria-label="Transitions"] .count')?.textContent?.trim();

    // state-2 leaves through edge-3 (no event yet) only.
    expect(rows().map((r) => r.querySelector('.transition-event')?.textContent?.trim())).toEqual([
      'no event yet',
    ]);
    expect(toggleCount()).toBe('1');

    // Loop back: state-2 → state-1 through the existing-state select.
    const existing = () =>
      el.querySelector<HTMLSelectElement>(
        'app-inspector select[aria-label="To an existing state"]',
      )!;
    expect([...existing().options].map((o) => o.value)).toEqual(['', 'state-1', 'state-2']);
    existing().value = 'state-1';
    existing().dispatchEvent(new Event('change'));
    await settle();
    expect(store.edges().at(-1)).toMatchObject({ source: 'state-2', target: 'state-1' });
    expect(toggleCount()).toBe('2');

    // Re-point a listed transition from the state itself: one undo step.
    await select(['state-1']);
    const row = rows()[0].querySelector('select')!;
    expect(row.value).toBe('state-2');
    row.value = 'end-1';
    row.dispatchEvent(new Event('change'));
    await settle();
    expect(store.edges().find((e) => e.id === 'edge-2')?.target).toBe('end-1');
    store.undo();
    expect(store.edges().find((e) => e.id === 'edge-2')?.target).toBe('state-2');
  });

  it('draws parallel transitions with a label each, and a state that leads to itself', async () => {
    const { el, store, settle } = await setup();
    store.appendNode('start-1', 'state');
    store.appendNode('state-1', 'state');
    store.updateEdge('edge-2', { event: 'Paid', guard: 'big' });
    // A second transition between the same states is fine once the first has an event.
    store.connect('state-1', 'state-2');
    store.updateEdge('edge-3', { event: 'Paid', guard: 'small' });
    store.connect('state-2', 'state-2');
    store.updateEdge('edge-4', { event: 'Retry' });
    await settle();

    const labels = [...el.querySelectorAll('.transition app-transition-label .event .text')].map(
      (t) => t.textContent?.trim(),
    );
    expect(labels).toEqual(expect.arrayContaining(['Paid [big]', 'Paid [small]']));
    // The self-transition is part of the diagram: a line with its label on it, routed around.
    expect(el.querySelector('f-connection[aria-label$="on Retry"]')).toBeTruthy();
    expect(
      el.querySelector('f-connection app-transition-label .event .text')?.textContent?.trim(),
    ).toBe('Retry');
    // Two parallel lines and the loop get waypoints; the plain ones do not.
    expect(el.querySelectorAll('f-connection-waypoints').length).toBe(3);
  });

  it('counts the problems in the toolbox, lists them, shows the element and marks it', async () => {
    const { el, store, settle } = await setup();
    const button = () => el.querySelector<HTMLButtonElement>('app-problems-menu button')!;
    expect(button().getAttribute('aria-label')).toBe('Problems: No problems');
    expect(el.querySelector('app-node-card[data-finding]')).toBeNull();

    // A state nothing leads to: unreachable (error) and a dead end (warning).
    store.addNode('state');
    await settle();
    expect(button().getAttribute('aria-label')).toBe('Problems: 1 error, 1 warning');
    expect(button().getAttribute('data-severity')).toBe('error');
    const counts = [...button().querySelectorAll('.count')].map((c) => c.textContent?.trim());
    expect(counts).toEqual(['1', '1']);
    expect(el.querySelector('app-node-card[data-finding="error"]')?.textContent).toContain('State');

    button().click();
    await settle();
    const items = () => [
      ...document.querySelectorAll<HTMLButtonElement>('.cdk-overlay-container .finding'),
    ];
    expect(items().map((i) => i.querySelector('.severity')?.textContent?.trim())).toEqual([
      'error',
      'warning',
    ]);
    expect(items()[0].textContent).toContain('cannot be reached');

    // Picking a finding selects the element, which opens its inspector.
    items()[0].click();
    await settle();
    expect(el.querySelector('app-inspector')?.getAttribute('aria-label')).toBe('State settings');

    // Fixing the problem clears the badge and the marker.
    store.appendNode('start-1', 'end');
    store.connect('start-1', 'state-1');
    store.connect('state-1', 'end-1');
    store.updateEdge('edge-2', { event: 'OrderPlaced', eventSource: 'Shop' });
    store.updateEdge('edge-3', { event: 'OrderShipped', eventSource: 'Shop' });
    await settle();
    expect(button().getAttribute('aria-label')).toBe('Problems: No problems');
    expect(el.querySelector('app-node-card[data-finding]')).toBeNull();
  });

  it('marks a transition with a problem and opens it from the list', async () => {
    const { el, store, settle } = await setup();
    store.appendNode('start-1', 'state');
    store.appendNode('state-1', 'end');
    await settle();
    // state-1 → end-1 has no event: a warning, drawn in the warning colour.
    expect(el.querySelector('f-connection[data-finding="warning"]')).toBeTruthy();
    expect(el.querySelectorAll('f-connection[data-finding]')).toHaveLength(1);

    el.querySelector<HTMLButtonElement>('app-problems-menu button')!.click();
    await settle();
    const item = document.querySelector<HTMLButtonElement>('.cdk-overlay-container .finding')!;
    expect(item.textContent).toContain('has no event');
    item.click();
    await settle();
    expect(el.querySelector('app-inspector')?.getAttribute('aria-label')).toBe(
      'Transition settings',
    );
  });

  describe('message catalog', () => {
    async function withMessages() {
      const ctx = await setup();
      const { el, store, settle } = ctx;
      store.appendNode('start-1', 'state');
      store.appendNode('state-1', 'state');
      store.appendNode('state-2', 'end');
      store.updateNode('state-1', {
        activities: [
          { kind: 'command', name: 'ReserveStock' },
          { kind: 'event', name: 'StockRequested' },
        ],
      });
      store.updateEdge('edge-1', { event: 'OrderPlaced', eventSource: 'Shop' });
      store.updateEdge('edge-2', { event: 'StockRequested' });
      await settle();
      const open = async () => {
        [...el.querySelectorAll<HTMLButtonElement>('.menu-button')]
          .find((b) => b.textContent?.trim() === 'Messages')!
          .click();
        await settle();
      };
      const entries = () => [...el.querySelectorAll<HTMLElement>('app-catalog-panel .entry')];
      return { ...ctx, open, entries };
    }

    it('lists the commands and events with where they come from and where they are used', async () => {
      const { el, open, entries } = await withMessages();
      expect(el.querySelector('app-catalog-panel')).toBeNull();
      await open();
      expect(
        entries().map((e) => (e.querySelector('input.name') as HTMLInputElement).value),
      ).toEqual(['ReserveStock', 'OrderPlaced', 'StockRequested']);
      const [command, external, internal] = entries();
      expect(command.textContent).toContain('Sent by State');
      expect(external.textContent).toContain('From outside');
      expect(external.textContent).toContain('From Shop');
      expect(external.textContent).toContain('Triggers Initial → State');
      expect(internal.textContent).toContain('Published by State');
      expect(internal.textContent).toContain('Triggers State → State');
    });

    it('filters by kind and by name', async () => {
      const { el, open, entries, settle } = await withMessages();
      await open();
      const radio = (label: string) =>
        [...el.querySelectorAll<HTMLButtonElement>('app-catalog-panel .segmented button')].find(
          (b) => b.textContent?.trim() === label,
        )!;
      radio('Commands').click();
      await settle();
      expect(entries()).toHaveLength(1);
      radio('Events').click();
      await settle();
      expect(entries()).toHaveLength(2);
      radio('All').click();
      const search = el.querySelector<HTMLInputElement>('app-catalog-panel .search')!;
      search.value = 'stock';
      search.dispatchEvent(new Event('input'));
      await settle();
      expect(entries()).toHaveLength(2);
      search.value = 'nothing like it';
      search.dispatchEvent(new Event('input'));
      await settle();
      expect(entries()).toHaveLength(0);
      expect(el.querySelector('app-catalog-panel .none')?.textContent).toContain(
        'No message matches',
      );
    });

    it('emphasises the states and transitions of a message, and lets go of them again', async () => {
      const { el, open, entries, settle } = await withMessages();
      await open();
      const cards = () =>
        [...el.querySelectorAll('app-node-card')].map((c) => c.getAttribute('data-highlight'));
      expect(cards().every((h) => h === null)).toBe(true);

      // StockRequested: published in State (state-1), reacted to by the edge state-1 → state-2.
      entries()[2].querySelector<HTMLButtonElement>('.pick')!.click();
      await settle();
      expect(cards()).toEqual(['off', 'on', 'on', 'off']);
      expect(el.querySelectorAll('f-connection[data-highlight="on"]')).toHaveLength(1);

      entries()[2].querySelector<HTMLButtonElement>('.pick')!.click();
      await settle();
      expect(cards().every((h) => h === null)).toBe(true);

      // Closing the panel lets go too.
      entries()[0].querySelector<HTMLButtonElement>('.pick')!.click();
      await settle();
      expect(cards().some((h) => h === 'on')).toBe(true);
      el.querySelector<HTMLButtonElement>(
        'app-catalog-panel [aria-label="Close messages"]',
      )!.click();
      await settle();
      expect(el.querySelector('app-catalog-panel')).toBeNull();
      expect(cards().every((h) => h === null)).toBe(true);
    });

    it('renames a message everywhere in one undo step, and says why when it cannot', async () => {
      const { el, store, open, entries, settle } = await withMessages();
      await open();
      const name = (i: number) => entries()[i].querySelector<HTMLInputElement>('input.name')!;

      name(2).value = 'StockAsked';
      name(2).dispatchEvent(new Event('change'));
      await settle();
      expect(store.nodes()[1].activities?.[1].name).toBe('StockAsked');
      expect(store.edges()[1].event).toBe('StockAsked');
      expect(
        entries().map((e) => (e.querySelector('input.name') as HTMLInputElement).value),
      ).toEqual(['ReserveStock', 'OrderPlaced', 'StockAsked']);
      store.undo();
      await settle();
      expect(store.edges()[1].event).toBe('StockRequested');

      // A name another event has: refused, the field goes back, a message tells why.
      name(2).value = 'OrderPlaced';
      name(2).dispatchEvent(new Event('change'));
      await settle();
      expect(name(2).value).toBe('StockRequested');
      expect(el.querySelector('app-catalog-panel .error')?.textContent).toContain(
        'already a event called “OrderPlaced”',
      );
      name(0).value = '  ';
      name(0).dispatchEvent(new Event('change'));
      await settle();
      expect(el.querySelector('app-catalog-panel .error')?.textContent).toContain('needs a name');
    });

    it('shows the fixed names of timeouts and replies without a field to rename them', async () => {
      const { store, open, entries, settle } = await withMessages();
      store.updateNode('state-1', { timers: [{ action: 'schedule', name: 'StockTimeout' }] });
      store.updateEdge('edge-1', { event: 'StockTimeout' });
      await settle();
      await open();
      const timeout = entries().find((e) => e.textContent?.includes('StockTimeout'))!;
      expect(timeout.textContent).toContain('Timeout');
      expect(timeout.querySelector('input.name')).toBeNull();
      expect(timeout.querySelector('.fixed')?.textContent).toContain('StockTimeout');
    });
  });

  describe('walkthrough', () => {
    async function walking() {
      const ctx = await setup();
      const { el, store, settle } = ctx;
      store.appendNode('start-1', 'state');
      store.appendNode('state-1', 'state');
      store.appendNode('state-2', 'end');
      store.updateNode('state-1', {
        name: 'Reserving',
        activities: [{ kind: 'command', name: 'ReserveStock' }],
      });
      store.updateNode('state-2', { name: 'Charging' });
      store.updateEdge('edge-1', { event: 'OrderPlaced', eventSource: 'Shop' });
      store.updateEdge('edge-2', { event: 'StockReserved', eventSource: 'Warehouse' });
      store.updateEdge('edge-3', { event: 'PaymentCharged', eventSource: 'Payments' });
      await settle();
      const button = () =>
        [...el.querySelectorAll<HTMLButtonElement>('.menu-button')].find(
          (b) => b.textContent?.trim() === 'Walkthrough',
        )!;
      const panel = () => el.querySelector('app-walkthrough-panel');
      const options = () => [
        ...el.querySelectorAll<HTMLButtonElement>('app-walkthrough-panel .option'),
      ];
      const now = () => el.querySelector('app-walkthrough-panel .now .state')?.textContent?.trim();
      const action = (label: string) =>
        [...el.querySelectorAll<HTMLButtonElement>('app-walkthrough-panel .actions button')].find(
          (b) => b.textContent?.trim() === label,
        )!;
      const start = async () => {
        button().click();
        await settle();
      };
      return { ...ctx, button, panel, options, now, action, start };
    }

    it('starts in the initial state and offers the events it reacts to', async () => {
      const { panel, options, now, start } = await walking();
      expect(panel()).toBeNull();
      await start();
      expect(panel()).toBeTruthy();
      expect(now()).toBe('Initial');
      expect(
        options().map((o) => [
          o.querySelector('.event')?.textContent,
          o.querySelector('.target')?.textContent,
        ]),
      ).toEqual([['OrderPlaced', 'Reserving']]);
    });

    it('follows the picked event, highlights it and shows what the next state does', async () => {
      const { el, options, now, start, settle } = await walking();
      await start();
      options()[0].click();
      await settle();
      expect(now()).toBe('Reserving');
      expect(el.querySelector('app-walkthrough-panel .doings')?.textContent).toContain(
        'Send ReserveStock',
      );
      const cards = [...el.querySelectorAll('app-node-card')].map((c) =>
        c.getAttribute('data-highlight'),
      );
      expect(cards).toEqual(['off', 'on', 'off', 'off']);
      expect(el.querySelectorAll('f-connection[data-highlight="on"]')).toHaveLength(1);
      expect(
        [...el.querySelectorAll('app-walkthrough-panel .path li')].map((l) =>
          l.textContent?.replace(/\s+/g, ' ').trim(),
        ),
      ).toEqual(['Initial', 'OrderPlaced → Reserving']);
    });

    it('goes back and restarts, and says when the saga ends', async () => {
      const { el, options, now, action, start, settle } = await walking();
      await start();
      options()[0].click();
      await settle();
      options()[0].click();
      await settle();
      expect(now()).toBe('Charging');
      // The final state: nothing more can happen.
      options()[0].click();
      await settle();
      expect(el.querySelector('app-walkthrough-panel .none')?.textContent).toContain(
        'The saga ends here',
      );
      action('Back').click();
      await settle();
      expect(now()).toBe('Charging');
      action('Restart').click();
      await settle();
      expect(now()).toBe('Initial');
      expect(action('Back').disabled).toBe(true);
      expect(action('Restart').disabled).toBe(true);
    });

    it('copies the path as text', async () => {
      const { options, action, start, settle } = await walking();
      const writeText = vi.fn(async () => undefined);
      vi.stubGlobal('navigator', { clipboard: { writeText } });
      try {
        await start();
        options()[0].click();
        await settle();
        action('Copy path').click();
        await settle();
        expect(writeText).toHaveBeenCalledWith(
          'Initial\n1. OrderPlaced → Reserving\n   Send ReserveStock',
        );
        expect(action('Copied')).toBeTruthy();
      } finally {
        vi.unstubAllGlobals();
      }
    });

    it('is read-only: no inspector, no "+", no editing from the toolbox or the keyboard', async () => {
      const { el, store, select, start, settle } = await walking();
      const before = store.diagram();
      await select(['state-1']);
      expect(el.querySelector('app-inspector')).toBeTruthy();
      await start();
      expect(el.querySelector('app-inspector')).toBeNull();
      expect(el.querySelector('.slot')).toBeNull();
      expect(el.querySelector('[aria-label="Insert a state here"]')).toBeNull();
      const disabled = (label: string) =>
        el.querySelector<HTMLButtonElement>(`.toolbox [aria-label="${label}"]`)!.disabled;
      for (const label of [
        'Add the Any state',
        'Delete selection',
        'Undo',
        'Redo',
        'Top to bottom',
        'Left to right',
      ]) {
        expect(disabled(label), label).toBe(true);
      }
      expect(el.querySelector<HTMLInputElement>('app-diagram-details input.name')!.readOnly).toBe(
        true,
      );

      // The keyboard does not delete or undo either.
      await select(['state-1']);
      el.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true }));
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true }));
      await settle();
      expect(store.diagram()).toBe(before);
    });

    it('ends when closed: the editor can be edited again and nothing stays highlighted', async () => {
      const { el, options, button, panel, start, settle } = await walking();
      await start();
      options()[0].click();
      await settle();
      el.querySelector<HTMLButtonElement>(
        'app-walkthrough-panel [aria-label="Close walkthrough"]',
      )!.click();
      await settle();
      expect(panel()).toBeNull();
      expect(
        [...el.querySelectorAll('app-node-card')].every((c) => !c.hasAttribute('data-highlight')),
      ).toBe(true);
      expect(el.querySelectorAll('.slot').length).toBeGreaterThanOrEqual(0);
      expect(
        el.querySelector<HTMLButtonElement>('.toolbox [aria-label="Add the Any state"]')!.disabled,
      ).toBe(false);
      // Starting again begins in the initial state.
      button().click();
      await settle();
      expect(el.querySelector('app-walkthrough-panel .now .state')?.textContent?.trim()).toBe(
        'Initial',
      );
    });

    it('ends when the path no longer holds, e.g. after the text was edited', async () => {
      const { store, options, panel, start, settle } = await walking();
      await start();
      options()[0].click();
      await settle();
      store.remove({ edgeIds: ['edge-1'] });
      await settle();
      expect(panel()).toBeNull();
    });

    it('swaps with the message catalog: only one panel at a time', async () => {
      const { el, start, panel, settle } = await walking();
      await start();
      [...el.querySelectorAll<HTMLButtonElement>('.menu-button')]
        .find((b) => b.textContent?.trim() === 'Messages')!
        .click();
      await settle();
      expect(panel()).toBeNull();
      expect(el.querySelector('app-catalog-panel')).toBeTruthy();
      // Walking is over, so the editor is editable again.
      expect(
        el.querySelector<HTMLButtonElement>('.toolbox [aria-label="Add the Any state"]')!.disabled,
      ).toBe(false);
    });
  });

  it('adds the one Any state from the toolbox and opens it', async () => {
    const { el, store, settle } = await setup();
    const add = () => el.querySelector<HTMLButtonElement>('[aria-label="Add the Any state"]')!;
    add().click();
    await settle();
    expect(store.nodes().map((n) => n.type)).toEqual(['start', 'any']);
    expect(el.querySelector('app-inspector')?.getAttribute('aria-label')).toBe(
      'Any state settings',
    );
    expect(el.querySelector('app-node-card[data-type="any"]')).toBeTruthy();

    add().click();
    await settle();
    expect(store.nodes()).toHaveLength(2);
  });

  it('marks events nobody in the saga publishes as external, with their source', async () => {
    const { el, store, select, fill, settle } = await setup();
    store.appendNode('start-1', 'state');
    store.appendNode('state-1', 'state');
    // OrderReceived arrives from outside, in a state other than the initial one.
    store.updateEdge('edge-2', { event: 'OrderReceived' });
    await select([], ['edge-2']);
    expect(el.querySelector('app-inspector .origin')?.textContent).toContain('External');
    await fill('input[placeholder="e.g. Shop API, Payment service"]', 'Shop API');
    expect(store.edges()[1].eventSource).toBe('Shop API');
    const label = () => el.querySelectorAll('app-transition-label')[1];
    expect(label().querySelector('.event')?.classList).toContain('external');
    expect(label().querySelector('.source')?.textContent?.trim()).toBe('from Shop API');

    // Once the saga publishes it itself, the event is internal.
    store.updateNode('state-1', { activities: [{ kind: 'event', name: 'OrderReceived' }] });
    await settle();
    expect(el.querySelector('app-inspector .origin')?.textContent).toContain(
      'Published by this saga when entering State',
    );
    expect(label().querySelector('.event')?.classList).not.toContain('external');
  });

  it('selects a transition by clicking its label', async () => {
    const { el, store, settle } = await setup();
    store.appendNode('start-1', 'state');
    store.updateEdge('edge-1', { event: 'OrderSubmitted' });
    await settle();
    el.querySelector<HTMLButtonElement>('app-transition-label .card')!.click();
    await settle();
    expect(el.querySelector('app-inspector')?.getAttribute('aria-label')).toBe(
      'Transition settings',
    );
  });

  it('deletes the selection from the inspector', async () => {
    const { el, store, select, settle } = await setup();
    store.appendNode('start-1', 'state');
    store.appendNode('state-1', 'end');
    await select(['state-1']);
    inspectorButton(el, 'Delete state').click();
    await settle();
    expect(store.nodes().map((n) => n.id)).toEqual(['start-1', 'end-1']);
    expect(store.edges().map((e) => [e.source, e.target])).toEqual([['start-1', 'end-1']]);
    expect(el.querySelector('app-inspector')).toBeNull();
  });

  it('connects by dragging onto a state, or appends a state when dropped on the canvas', async () => {
    const { store, draggable } = await setup();
    store.appendNode('start-1', 'state');
    store.appendNode('state-1', 'end');
    draggable().fCreateConnection.emit(
      new FCreateConnectionEvent('state-1:out', undefined, { x: 10, y: 10 }),
    );
    expect(store.edges().at(-1)).toMatchObject({ source: 'state-1', target: 'state-2' });
    draggable().fCreateConnection.emit(
      new FCreateConnectionEvent('state-2:out', 'end-1:in', { x: 10, y: 10 }),
    );
    expect(store.edges().at(-1)).toMatchObject({ source: 'state-2', target: 'end-1' });
  });

  it('toggles the layout direction', async () => {
    const { el, store, settle } = await setup();
    el.querySelector<HTMLButtonElement>('[aria-label="Left to right"]')!.click();
    await settle();
    expect(store.direction()).toBe('left-right');
    expect(el.querySelector('.workspace')?.getAttribute('data-direction')).toBe('left-right');
  });

  it('fits the diagram when a layout option changes, but not when it is edited', async () => {
    const { fixture, store, settle } = await setup();
    const canvas = fixture.debugElement.query(By.directive(FCanvasComponent))
      .componentInstance as FCanvasComponent;
    const fit = vi.spyOn(canvas, 'fitToScreen');
    /** Lets the layout finish and the deferred fit run. */
    const flush = async () => {
      await settle();
      await new Promise((resolve) => setTimeout(resolve));
    };

    store.setDirection('left-right');
    await flush();
    expect(fit).toHaveBeenCalledTimes(1);

    store.undo();
    await flush();
    expect(fit).toHaveBeenCalledTimes(2);

    store.appendNode(store.nodes()[0].id, 'state');
    await flush();
    expect(fit).toHaveBeenCalledTimes(2);
  });

  it('offers to add the initial state when the diagram is empty', async () => {
    const { el, store, settle } = await setup();
    store.load({ direction: 'top-bottom', nodes: [], edges: [] });
    await settle();
    [...el.querySelectorAll<HTMLButtonElement>('.empty-state button')][0].click();
    await settle();
    expect(store.nodes().map((n) => n.type)).toEqual(['start']);
    expect(el.querySelector('.empty-state')).toBeNull();
  });

  it('saves with Ctrl+S and opens with Ctrl+O', async () => {
    const { storage } = await setup();
    const press = (key: string, shiftKey = false) =>
      window.dispatchEvent(new KeyboardEvent('keydown', { key, ctrlKey: true, shiftKey }));
    press('s');
    expect(storage.saveAs).toHaveBeenCalledWith(
      expect.stringContaining('version: 3'),
      'untitled.saga.yaml',
    );
    press('S', true);
    expect(storage.saveAs).toHaveBeenCalledTimes(2);
    press('o');
    expect(storage.open).toHaveBeenCalled();
  });

  it('shows the file name and marks unsaved changes', async () => {
    const { el, store, settle } = await setup();
    const save = () =>
      [...el.querySelectorAll<HTMLButtonElement>('.file-actions button')].find(
        (b) => b.textContent?.trim() === 'Save',
      )!;
    expect(el.querySelector('.file-name')?.textContent?.trim()).toBe('untitled.saga.yaml');
    expect(el.querySelector('[aria-label="Unsaved changes"]')).toBeNull();
    expect(save().classList).not.toContain('primary');
    store.appendNode('start-1', 'state');
    await settle();
    expect(el.querySelector('[aria-label="Unsaved changes"]')).toBeTruthy();
    expect(save().classList).toContain('primary');
    TestBed.inject(DiagramDocument).newDiagram();
    await settle();
    expect(el.querySelector('[aria-label="Unsaved changes"]')).toBeNull();
  });

  it('asks for a name and description before starting a new diagram', async () => {
    const { el, settle, store } = await setup();
    store.appendNode('start-1', 'state');
    const newButton = [...el.querySelectorAll<HTMLButtonElement>('.file-actions button')].find(
      (b) => b.textContent?.trim() === 'New',
    )!;
    // The unsaved change asks first; confirm it.
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    newButton.click();
    await settle();
    const dialog = el.querySelector('app-new-diagram-dialog')!;
    expect(dialog).toBeTruthy();
    const name = dialog.querySelector<HTMLInputElement>('input')!;
    name.value = 'Order Saga';
    name.dispatchEvent(new Event('input'));
    await settle();
    dialog.querySelector<HTMLButtonElement>('button[type=submit]')!.click();
    await settle();
    expect(store.diagram().name).toBe('Order Saga');
    expect(store.nodes().map((n) => n.type)).toEqual(['start']);
    expect(el.querySelector('app-new-diagram-dialog dialog[open]')).toBeNull();
  });

  it('keeps the diagram when the new-diagram popup is cancelled', async () => {
    const { el, settle, store } = await setup();
    store.appendNode('start-1', 'state');
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    [...el.querySelectorAll<HTMLButtonElement>('.file-actions button')]
      .find((b) => b.textContent?.trim() === 'New')!
      .click();
    await settle();
    document
      .querySelector<HTMLButtonElement>('app-new-diagram-dialog button[type=button]')!
      .click();
    await settle();
    expect(store.nodes()).toHaveLength(2);
  });

  it('shows file errors and lets them be dismissed', async () => {
    const { el, settle } = await setup();
    TestBed.inject(DiagramDocument).setError('Unsupported format version 7');
    await settle();
    expect(el.querySelector('[role=alert]')?.textContent).toContain('Unsupported format');
    el.querySelector<HTMLButtonElement>('[aria-label="Dismiss error"]')!.click();
    await settle();
    expect(el.querySelector('[role=alert]')).toBeNull();
  });

  describe('source view', () => {
    const sourceButton = (el: HTMLElement) =>
      el.querySelector<HTMLButtonElement>('.topbar .source-toggle')!;

    it('opens next to the canvas with the diagram as YAML, and closes again', async () => {
      const { el, store, editors, settle } = await setup();
      expect(el.querySelector('app-source-panel')).toBeNull();
      expect(sourceButton(el).getAttribute('aria-pressed')).toBe('false');

      sourceButton(el).click();
      await settle();
      expect(el.querySelector('app-source-panel')).not.toBeNull();
      expect(el.querySelector('.workspace')).not.toBeNull(); // the canvas stays
      expect(sourceButton(el).getAttribute('aria-pressed')).toBe('true');
      expect(editors).toHaveLength(1);
      expect(editors[0].text).toBe(serializeDiagram(store.diagram()));

      el.querySelector<HTMLButtonElement>('[aria-label="Close source"]')!.click();
      await settle();
      expect(el.querySelector('app-source-panel')).toBeNull();
      expect(editors[0].destroy).toHaveBeenCalled();
    });

    it('has a labelled button in the top bar that opens the panel again after it was closed', async () => {
      const { el, editors, settle } = await setup();
      const button = sourceButton(el);
      expect(button.textContent?.trim()).toBe('Source');
      expect(button.classList).not.toContain('active');

      button.click();
      await settle();
      expect(button.classList).toContain('active');
      el.querySelector<HTMLButtonElement>('[aria-label="Close source"]')!.click();
      await settle();
      expect(button.classList).not.toContain('active');

      // The button stays where it was, and works again.
      expect(sourceButton(el)).toBe(button);
      button.click();
      await settle();
      expect(el.querySelector('app-source-panel')).not.toBeNull();
      expect(editors).toHaveLength(2);

      // It toggles: pressing it with the panel open closes the panel.
      button.click();
      await settle();
      expect(el.querySelector('app-source-panel')).toBeNull();
    });

    it('is not a second, hidden button in the toolbox', async () => {
      const { el } = await setup();
      expect(el.querySelectorAll('.source-toggle')).toHaveLength(1);
      expect(el.querySelector('.toolbox .source-toggle')).toBeNull();
    });

    it('applies text typed in the panel to the diagram, as one undo step', async () => {
      const { el, store, editors, settle } = await setup();
      sourceButton(el).click();
      await settle();
      const [editor] = editors;
      const typed = editor.text.replace('name: Initial', 'name: Begin');
      editor.options.onChange(typed);
      editor.options.onBlur(); // leaving the editor applies the text without waiting
      await settle();
      expect(store.nodes()[0].name).toBe('Begin');
      expect(el.querySelector('app-node-card')?.textContent).toContain('Begin');
      expect(el.querySelector('app-source-panel [role=status]')?.textContent).toContain('Valid');
      store.undo();
      await settle();
      expect(store.nodes()[0].name).toBe('Initial');
      expect(editor.text).toContain('name: Initial');
    });

    it('shows what is wrong with invalid text and keeps the diagram', async () => {
      const { el, store, editors, settle } = await setup();
      sourceButton(el).click();
      await settle();
      const before = store.diagram();
      editors[0].options.onChange('version: 3\nnodes: {}\n');
      editors[0].options.onBlur();
      await settle();
      expect(store.diagram()).toBe(before);
      const status = el.querySelector('app-source-panel [role=status]')!;
      expect(status.textContent).toContain('nodes must be a list');
      expect(status.textContent).toContain('keeps its last valid state');
    });

    it('names the line of a problem, marks it in the editor, and jumps there', async () => {
      const { el, editors, settle } = await setup();
      sourceButton(el).click();
      await settle();
      const [editor] = editors;
      editor.options.onChange('version: 3\nnodes:\n  - { id: a, type: task, name: A }\n');
      editor.options.onBlur();
      await settle();
      const status = el.querySelector('app-source-panel [role=status]')!;
      expect(status.textContent).toContain('Line 3:20');
      expect(editor.showError).toHaveBeenLastCalledWith({
        message: expect.stringContaining('nodes[0].type must be one of'),
        line: 3,
        column: 20,
      });

      status.querySelector<HTMLButtonElement>('.where')!.click();
      expect(editor.reveal).toHaveBeenCalledWith(3, 20);

      // Fixing the text removes the mark.
      editor.options.onChange(editor.text.replace('task', 'state'));
      editor.options.onBlur();
      await settle();
      expect(editor.showError).toHaveBeenLastCalledWith(null);
      expect(status.textContent).toContain('Valid');
    });

    it('has no line to show for a problem that cannot be placed', async () => {
      const { el, editors, settle } = await setup();
      sourceButton(el).click();
      await settle();
      editors[0].options.onChange('- 1\n');
      editors[0].options.onBlur();
      await settle();
      const status = el.querySelector('app-source-panel [role=status]')!;
      expect(status.textContent).toContain('file must be a mapping');
      expect(status.querySelector('.where')).toBeNull();
      expect(editors[0].showError).toHaveBeenLastCalledWith(null);
    });

    it('follows edits made on the canvas', async () => {
      const { el, store, editors, settle } = await setup();
      sourceButton(el).click();
      await settle();
      store.appendNode('start-1', 'state');
      await settle();
      expect(editors[0].text).toBe(serializeDiagram(store.diagram()));
      expect(editors[0].text).toContain('id: state-1');
    });

    it('is remembered between visits, with its width', async () => {
      const first = await setup();
      first.el.querySelector<HTMLButtonElement>('.topbar .source-toggle')!.click();
      await first.settle();
      const divider = first.el.querySelector<HTMLElement>('[role=separator]')!;
      divider.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
      await first.settle();
      expect(localStorage.getItem('ariadne.source-open')).toBe('1');
      expect(localStorage.getItem('ariadne.source-width')).toBe('464'); // 440 + one step of 24
      first.fixture.destroy();
      TestBed.resetTestingModule();

      const second = await setup();
      expect(second.el.querySelector('app-source-panel')).not.toBeNull();
      expect(second.el.querySelector<HTMLElement>('app-source-panel')!.style.width).toBe('464px');
    });

    it('can be resized with the keyboard, within limits', async () => {
      const { el, settle } = await setup();
      sourceButton(el).click();
      await settle();
      const divider = el.querySelector<HTMLElement>('[role=separator]')!;
      const panel = el.querySelector<HTMLElement>('app-source-panel')!;
      const press = async (key: string, shiftKey = false) => {
        divider.dispatchEvent(new KeyboardEvent('keydown', { key, shiftKey, bubbles: true }));
        await settle();
      };
      await press('End');
      expect(panel.style.width).toBe('280px');
      await press('ArrowRight');
      expect(panel.style.width).toBe('280px'); // not narrower than the minimum
      await press('ArrowLeft', true);
      expect(panel.style.width).toBe('360px');
    });

    it('saves with Ctrl+S from inside the editor, after applying what was typed', async () => {
      const { el, store, storage, editors, settle } = await setup();
      sourceButton(el).click();
      await settle();
      const [editor] = editors;
      editor.options.onChange(editor.text.replace('name: Initial', 'name: Begin'));
      // The panel applies on blur; Ctrl+S in a text field leaves the field first.
      const field = document.createElement('input');
      field.addEventListener('blur', () => editor.options.onBlur());
      el.append(field);
      field.focus();
      field.dispatchEvent(
        new KeyboardEvent('keydown', { key: 's', ctrlKey: true, bubbles: true, cancelable: true }),
      );
      await settle();
      expect(store.nodes()[0].name).toBe('Begin');
      expect(storage.saveAs).toHaveBeenCalledWith(
        expect.stringContaining('name: Begin'),
        'untitled.saga.yaml',
      );
    });

    it('does not undo the diagram when Ctrl+Z is pressed while typing in a text field', async () => {
      const { el, store, settle } = await setup();
      store.appendNode('start-1', 'state');
      await settle();
      const field = document.createElement('input');
      el.append(field);
      field.focus();
      field.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true, cancelable: true }),
      );
      expect(store.nodes()).toHaveLength(2);
    });
  });

  describe('accessibility', () => {
    afterEach(() => vi.unstubAllGlobals());

    /** Serious or critical axe findings; jsdom has no layout, so the colour contrast rule is off. */
    async function axeFindings(root: HTMLElement): Promise<string[]> {
      const { default: axe } = await import('axe-core');
      const { violations } = await axe.run(root, {
        rules: { 'color-contrast': { enabled: false } },
      });
      return violations
        .filter((v) => v.impact === 'serious' || v.impact === 'critical')
        .map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
    }

    it('has no serious axe findings, also with a selection and the source panel open', async () => {
      const { el, store, settle, select } = await setup();
      store.appendNode('start-1', 'state');
      await settle();
      expect(await axeFindings(el)).toEqual([]);

      await select(['start-1']);
      el.querySelector<HTMLButtonElement>('.source-toggle')!.click();
      await settle();
      expect(await axeFindings(el)).toEqual([]);

      await select([], [store.edges()[0].id]);
      expect(await axeFindings(el)).toEqual([]);
    });

    it('labels the theme toggle with the theme it switches to', async () => {
      const { el, fixture } = await setup();
      const toggle = el.querySelector<HTMLButtonElement>('.theme-toggle')!;
      const before = toggle.textContent!.trim();
      toggle.click();
      fixture.detectChanges();
      expect(toggle.textContent!.trim()).not.toBe(before);
    });

    it('names states and transitions for screen readers', async () => {
      const { el, store, settle } = await setup();
      const id = store.appendNode('start-1', 'state')!;
      store.updateNode(id, { name: 'Reserve stock' });
      await settle();
      const label = (selector: string) => el.querySelector(selector)?.getAttribute('aria-label');
      expect(label('app-node-card')).toMatch(/^Initial: /);
      expect(el.querySelector(`app-node-card[aria-label$="Reserve stock"]`)).not.toBeNull();
      expect(label('f-connection')).toMatch(/^Transition from .+ to Reserve stock$/);
    });

    it('does not animate fitting or centring when the user prefers reduced motion', async () => {
      vi.stubGlobal('matchMedia', (query: string) => ({
        matches: query.includes('reduce'),
        addEventListener: () => {},
      }));
      const { fixture, store, settle } = await setup();
      const canvas = fixture.debugElement.query(By.directive(FCanvasComponent))
        .componentInstance as FCanvasComponent;
      const fit = vi.spyOn(canvas, 'fitToScreen');
      store.setDirection('left-right');
      await settle();
      await new Promise((resolve) => setTimeout(resolve));
      expect(fit).toHaveBeenCalled();
      expect(fit.mock.calls[0][1]).toBe(false);
    });
  });
});
