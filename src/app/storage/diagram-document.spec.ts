import { TestBed } from '@angular/core/testing';
import { DiagramStore } from '../model/diagram-store';
import { serializeDiagram } from '../model/diagram-yaml';
import { DiagramDocument } from './diagram-document';
import { FileRef, FileStorage, OpenedFile } from './file-storage';

class FakeFileStorage extends FileStorage {
  opened: OpenedFile | null = null;
  saveAsName: string | null = 'chosen.yaml';
  readonly written: { name: string; content: string }[] = [];

  open = vi.fn(async () => this.opened);
  save = vi.fn(async (content: string, ref: FileRef) => {
    this.written.push({ name: ref.name, content });
    return ref;
  });
  saveAs = vi.fn(async (content: string) => {
    if (!this.saveAsName) return null;
    this.written.push({ name: this.saveAsName, content });
    return { name: this.saveAsName };
  });
}

describe('DiagramDocument', () => {
  let storage: FakeFileStorage;
  let store: DiagramStore;
  let doc: DiagramDocument;

  beforeEach(() => {
    storage = new FakeFileStorage();
    TestBed.configureTestingModule({ providers: [{ provide: FileStorage, useValue: storage }] });
    store = TestBed.inject(DiagramStore);
    doc = TestBed.inject(DiagramDocument);
  });

  it('starts clean and untitled, and becomes dirty on edits', () => {
    expect(doc.name()).toBe('untitled.yaml');
    expect(doc.dirty()).toBe(false);
    store.addNode('state');
    expect(doc.dirty()).toBe(true);
    store.undo();
    expect(doc.dirty()).toBe(false);
  });

  it('asks for a location on first save, then saves in place', async () => {
    store.addNode('state');
    expect(await doc.save()).toBe(true);
    expect(storage.saveAs).toHaveBeenCalledWith(expect.any(String), 'untitled.yaml');
    expect(doc.name()).toBe('chosen.yaml');
    expect(doc.dirty()).toBe(false);

    store.addNode('end');
    await doc.save();
    expect(storage.save).toHaveBeenCalledTimes(1);
    expect(storage.written.at(-1)).toEqual({
      name: 'chosen.yaml',
      content: serializeDiagram(store.diagram()),
    });
  });

  it('stays dirty when saving is cancelled', async () => {
    storage.saveAsName = null;
    store.addNode('state');
    expect(await doc.save()).toBe(false);
    expect(doc.dirty()).toBe(true);
  });

  it('opens a file into the store with a fresh history', async () => {
    store.addNode('state');
    storage.opened = {
      ref: { name: 'order.yaml' },
      content:
        'version: 1\nnodes:\n  - { id: start-1, type: start, name: Go, position: { x: 1, y: 2 } }\n',
    };
    expect(await doc.open()).toBe(true);
    expect(store.nodes().map((n) => n.name)).toEqual(['Go']);
    expect(store.canUndo()).toBe(false);
    expect(doc.name()).toBe('order.yaml');
    expect(doc.dirty()).toBe(false);
  });

  describe('files from before activities moved to states (format version 2)', () => {
    const v2 = [
      'version: 2',
      'nodes:',
      '  - { id: start-1, type: start, name: Initial }',
      '  - { id: state-1, type: state, name: Reserving stock }',
      'edges:',
      '  - id: edge-1',
      '    source: start-1',
      '    target: state-1',
      '    event: OrderReceived',
      '    activities: [{ command: ReserveStock }]',
      '',
    ].join('\n');

    it('migrates them, tells the user, and counts the file as unsaved', async () => {
      storage.opened = { ref: { name: 'order.yaml' }, content: v2 };
      expect(await doc.open()).toBe(true);
      expect(store.nodes()[1].activities).toEqual([{ kind: 'command', name: 'ReserveStock' }]);
      expect(doc.notice()).toContain('"Reserving stock"');
      expect(doc.dirty()).toBe(true);
      expect(doc.name()).toBe('order.yaml');
    });

    it('is clean again after saving the migrated file, and the notice goes away', async () => {
      storage.opened = { ref: { name: 'order.yaml' }, content: v2 };
      await doc.open();
      expect(await doc.save()).toBe(true);
      expect(doc.dirty()).toBe(false);
      expect(storage.written.at(-1)?.content).toContain('version: 3');
      expect(storage.written.at(-1)?.content).not.toMatch(/edges:[\s\S]*activities:/);
    });

    it('clears the notice when another diagram is opened or created', async () => {
      storage.opened = { ref: { name: 'order.yaml' }, content: v2 };
      await doc.open();
      doc.newDiagram();
      expect(doc.notice()).toBeNull();

      storage.opened = { ref: { name: 'order.yaml' }, content: v2 };
      await doc.open();
      storage.opened = { ref: { name: 'v3.yaml' }, content: 'version: 3\n' };
      await doc.open();
      expect(doc.notice()).toBeNull();
      expect(doc.dirty()).toBe(false);
    });
  });

  it('reports invalid files and keeps the current diagram', async () => {
    store.addNode('state');
    storage.opened = { ref: { name: 'bad.yaml' }, content: 'version: 7' };
    expect(await doc.open()).toBe(false);
    expect(doc.error()).toMatch(/Unsupported format version 7/);
    expect(store.nodes().map((n) => n.id)).toEqual(['start-1', 'state-1']);
    expect(doc.name()).toBe('untitled.yaml');
  });

  it('starts a new diagram with just a start node', () => {
    store.addNode('state');
    doc.newDiagram();
    expect(store.nodes().map((n) => n.type)).toEqual(['start']);
    expect(doc.dirty()).toBe(false);
  });
});
