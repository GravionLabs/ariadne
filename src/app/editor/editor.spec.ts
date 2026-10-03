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
    return { fixture, el, store, storage, editors, settle, draggable, pick, select, fill };
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
    const { el, store, settle } = await setup();
    store.appendNode('start-1', 'end');
    await settle();
    expect(el.querySelector('.slot')).toBeNull();
    const inserts = el.querySelectorAll<HTMLButtonElement>('[aria-label="Insert a state here"]');
    expect(inserts).toHaveLength(1);
    // Only states can be inserted, so there is no picker.
    inserts[0].click();
    await settle();
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
    const { el, store, select, fill, settle } = await setup();
    store.appendNode('start-1', 'state');
    await select(['state-1']);

    await fill('input[type=text]', 'Charging payment');
    await fill('input[type=text]', '   '); // an empty name reverts
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

  it('shows file errors and lets them be dismissed', async () => {
    const { el, settle } = await setup();
    TestBed.inject(DiagramDocument).error.set('Unsupported format version 7');
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
});
