import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import {
  FCreateConnectionEvent,
  FCreateNodeEvent,
  FDraggableDirective,
  FFlowComponent,
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
        (b) => b.textContent?.trim() === label,
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

  it('renders connectors according to the node type', async () => {
    const { el, store, click } = await setup();
    await click('Start');
    await click('End');
    await click('Step');
    expect(store.nodes()).toHaveLength(3);
    expect(el.querySelectorAll('.node-start .port.in')).toHaveLength(0);
    expect(el.querySelectorAll('.node-start .port.out')).toHaveLength(1);
    expect(el.querySelectorAll('.node-end .port.in')).toHaveLength(1);
    expect(el.querySelectorAll('.node-end .port.out')).toHaveLength(0);
    expect(el.querySelectorAll('.node-step .port')).toHaveLength(2);
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
      new FCreateConnectionEvent('start-1:out', undefined, { x: 10, y: 10 }),
    );
    expect(store.nodes().at(-1)).toMatchObject({
      id: 'step-1',
      type: 'step',
      position: { x: 300 },
    });
    expect(store.edges()).toEqual([
      { id: 'edge-1', source: 'start-1', target: 'step-1', kind: 'forward' },
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
      new FCreateConnectionEvent('start-1:out', 'end-1:in', { x: 10, y: 10 }),
    );
    expect(store.nodes()).toHaveLength(2);
    expect(store.edges()).toHaveLength(1);
  });

  it('adds a node where a palette item is dropped', async () => {
    const { el, store, draggable } = await setup();
    expect(el.querySelectorAll('.palette [fExternalItem]')).toHaveLength(4);
    draggable().fCreateNode.emit(
      new FCreateNodeEvent({ x: 120, y: 340, width: 100, height: 40 } as never, 'decision'),
    );
    expect(store.nodes()).toMatchObject([{ type: 'decision', position: { x: 120, y: 340 } }]);
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
