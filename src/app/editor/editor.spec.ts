import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import {
  FCreateConnectionEvent,
  FConnectionComponent,
  FConnectorDirective,
  FCreateNodeEvent,
  FDraggableDirective,
  FFlowComponent,
  FSelectionChangeEvent,
} from '@foblex/flow';
import { DiagramStore } from '../model/diagram-store';
import { DiagramDocument } from '../storage/diagram-document';
import { FileStorage } from '../storage/file-storage';
import { Editor } from './editor';

// jsdom has no ResizeObserver; f-flow uses it to track node sizes.
globalThis.ResizeObserver ??= class {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
};

describe('Editor', () => {
  async function setup() {
    const storage = {
      open: vi.fn(async () => null),
      save: vi.fn(async () => null),
      saveAs: vi.fn(async () => null),
    };
    await TestBed.configureTestingModule({
      imports: [Editor],
      providers: [{ provide: FileStorage, useValue: storage }],
    }).compileComponents();
    const fixture = TestBed.createComponent(Editor);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    const store = TestBed.inject(DiagramStore);
    const click = async (label: string) => {
      const button = [...el.querySelectorAll('button')].find(
        (b) => (b.getAttribute('aria-label') ?? b.textContent?.trim()) === label,
      );
      button!.click();
      await fixture.whenStable();
      fixture.detectChanges();
    };
    const draggable = () =>
      fixture.debugElement
        .query(By.directive(FDraggableDirective))
        .injector.get(FDraggableDirective);
    return { fixture, el, store, storage, click, draggable };
  }

  it('adds a node of each palette type', async () => {
    const { store, click } = await setup();
    await click('Start');
    await click('Step');
    await click('Decision');
    await click('End');
    expect(store.nodes().map((n) => n.type)).toEqual(['start', 'step', 'decision', 'end']);
  });

  it('renders eight connectors per node, typed by the node type', async () => {
    const { fixture, store, click } = await setup();
    await click('Start');
    await click('End');
    await click('Step');
    expect(store.nodes()).toHaveLength(3);
    const ports = (type: string) =>
      fixture.debugElement
        .queryAll(By.css(`.node-${type} .port`))
        .map((d) => d.injector.get(FConnectorDirective));
    expect(ports('start').map((c) => c.fConnectorType())).toEqual(Array(8).fill('source'));
    expect(ports('end').map((c) => c.fConnectorType())).toEqual(Array(8).fill('target'));
    expect(ports('step').map((c) => c.fConnectorType())).toEqual(Array(8).fill('source-target'));
    expect(ports('step').map((c) => c.fId())).toEqual(
      ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw'].map((p) => `step-1:${p}`),
    );
  });

  it('attaches edges to their stored ports, defaulting to east → west', async () => {
    const { fixture, store, click } = await setup();
    await click('Step');
    await click('Step');
    store.connect('step-1', 'step-2');
    store.connect('step-2', 'step-1', 'compensation', { sourcePort: 's', targetPort: 'ne' });
    await fixture.whenStable();
    fixture.detectChanges();
    const ends = fixture.debugElement
      .queryAll(By.css('f-connection'))
      .map((d) => d.componentInstance as FConnectionComponent)
      .map((c) => [c.fSourceId(), c.fTargetId()]);
    expect(ends).toEqual([
      ['step-1:e', 'step-2:w'],
      ['step-2:s', 'step-1:ne'],
    ]);
  });

  it('shows the compensation action of a step', async () => {
    const { fixture, el, store, click } = await setup();
    await click('Step');
    expect(el.querySelector('.compensation')).toBeNull();
    store.updateNode('step-1', { compensation: { name: 'Refund payment' } });
    await fixture.whenStable();
    fixture.detectChanges();
    expect(el.querySelector('.compensation')?.textContent).toContain('Refund payment');
  });

  it('creates a connected step when a connection is dropped on empty canvas', async () => {
    const { fixture, store, click } = await setup();
    await click('Start');
    const flow = fixture.debugElement.query(By.directive(FFlowComponent));
    vi.spyOn(flow.componentInstance as FFlowComponent, 'getPositionInFlow').mockReturnValue({
      x: 300,
      y: 200,
      width: 0,
      height: 0,
    } as ReturnType<FFlowComponent['getPositionInFlow']>);
    const draggable = flow.injector.get(FDraggableDirective);
    draggable.fCreateConnection.emit(
      new FCreateConnectionEvent('start-1:s', undefined, { x: 10, y: 10 }),
    );
    // The new step's north port (top centre of its 160×44 box) lands under the cursor.
    expect(store.nodes().at(-1)).toMatchObject({
      id: 'step-1',
      type: 'step',
      position: { x: 220, y: 200 },
    });
    expect(store.edges()).toEqual([
      {
        id: 'edge-1',
        source: 'start-1',
        target: 'step-1',
        kind: 'forward',
        sourcePort: 's',
        targetPort: 'n',
      },
    ]);
  });

  it('only connects when a connection is dropped on a connector', async () => {
    const { fixture, store, click } = await setup();
    await click('Start');
    await click('End');
    const draggable = fixture.debugElement
      .query(By.directive(FDraggableDirective))
      .injector.get(FDraggableDirective);
    draggable.fCreateConnection.emit(
      new FCreateConnectionEvent('start-1:ne', 'end-1:sw', { x: 10, y: 10 }),
    );
    expect(store.nodes()).toHaveLength(2);
    expect(store.edges()).toMatchObject([{ sourcePort: 'ne', targetPort: 'sw' }]);
  });

  it('adds a node where a palette item is dropped', async () => {
    const { el, store, draggable } = await setup();
    expect(el.querySelectorAll('.palette [fExternalItem]')).toHaveLength(4);
    draggable().fCreateNode.emit(
      new FCreateNodeEvent({ x: 120, y: 340, width: 100, height: 40 } as never, 'decision'),
    );
    expect(store.nodes()).toMatchObject([{ type: 'decision', position: { x: 120, y: 340 } }]);
  });

  it('deletes the selection from the toolbox', async () => {
    const { fixture, el, store, click } = await setup();
    await click('Step');
    await click('Step');
    const deleteButton = el.querySelector<HTMLButtonElement>('[aria-label="Delete selection"]')!;
    expect(deleteButton.disabled).toBe(true);
    const draggable = fixture.debugElement
      .query(By.directive(FDraggableDirective))
      .injector.get(FDraggableDirective);
    draggable.fSelectionChange.emit(new FSelectionChangeEvent(['step-1'], [], []));
    fixture.detectChanges();
    expect(deleteButton.disabled).toBe(false);
    await click('Delete selection');
    expect(store.nodes().map((n) => n.id)).toEqual(['step-2']);
    expect(deleteButton.disabled).toBe(true);
  });

  it('saves with Ctrl+S and opens with Ctrl+O', async () => {
    const { storage } = await setup();
    const press = (key: string, shiftKey = false) =>
      window.dispatchEvent(new KeyboardEvent('keydown', { key, ctrlKey: true, shiftKey }));
    press('s');
    expect(storage.saveAs).toHaveBeenCalledWith(
      expect.stringContaining('version: 1'),
      'untitled.yaml',
    );
    press('S', true);
    expect(storage.saveAs).toHaveBeenCalledTimes(2);
    press('o');
    expect(storage.open).toHaveBeenCalled();
  });

  it('shows the file name and marks unsaved changes', async () => {
    const { fixture, el, click } = await setup();
    expect(el.querySelector('.file-name')?.textContent?.trim()).toBe('untitled.yaml');
    await click('Step');
    expect(el.querySelector('.file-name')?.textContent).toContain('•');
    TestBed.inject(DiagramDocument).newDiagram();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(el.querySelector('.file-name')?.textContent).not.toContain('•');
  });
});
