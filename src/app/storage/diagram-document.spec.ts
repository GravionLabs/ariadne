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
    store.addNode('step', { x: 0, y: 0 });
    expect(doc.dirty()).toBe(true);
    store.undo();
    expect(doc.dirty()).toBe(false);
  });

  it('asks for a location on first save, then saves in place', async () => {
    store.addNode('step', { x: 0, y: 0 });
    expect(await doc.save()).toBe(true);
    expect(storage.saveAs).toHaveBeenCalledWith(expect.any(String), 'untitled.yaml');
    expect(doc.name()).toBe('chosen.yaml');
    expect(doc.dirty()).toBe(false);

    store.addNode('end', { x: 0, y: 0 });
    await doc.save();
    expect(storage.save).toHaveBeenCalledTimes(1);
    expect(storage.written.at(-1)).toEqual({
      name: 'chosen.yaml',
      content: serializeDiagram(store.diagram()),
    });
  });

  it('stays dirty when saving is cancelled', async () => {
    storage.saveAsName = null;
    store.addNode('step', { x: 0, y: 0 });
    expect(await doc.save()).toBe(false);
    expect(doc.dirty()).toBe(true);
  });

  it('opens a file into the store with a fresh history', async () => {
    store.addNode('step', { x: 0, y: 0 });
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

  it('reports invalid files and keeps the current diagram', async () => {
    store.addNode('step', { x: 0, y: 0 });
    storage.opened = { ref: { name: 'bad.yaml' }, content: 'version: 7' };
    expect(await doc.open()).toBe(false);
    expect(doc.error()).toMatch(/Unsupported format version 7/);
    expect(store.nodes()).toHaveLength(1);
    expect(doc.name()).toBe('untitled.yaml');
  });

  it('starts a new empty diagram', () => {
    store.addNode('step', { x: 0, y: 0 });
    doc.newDiagram();
    expect(store.nodes()).toHaveLength(0);
    expect(doc.dirty()).toBe(false);
  });
});
