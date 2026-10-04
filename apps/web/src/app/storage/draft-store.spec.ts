import { TestBed } from '@angular/core/testing';
import { Component } from '@angular/core';
import { emptyDiagram, serializeDiagram } from '@ariadne/core';
import { DraftBanner } from '../draft-banner';
import { EditorHost } from '../host/editor-host';
import { DiagramStore } from '../model/diagram-store';
import { DiagramDocument } from './diagram-document';
import { DRAFT_DELAY_MS, DRAFT_KEY, DraftStore } from './draft-store';
import { FileRef, FileStorage } from './file-storage';

class FakeStorage extends FileStorage {
  open = vi.fn(async () => null);
  openFiles = vi.fn(async () => null);
  saveFiles = vi.fn(async () => true);
  save = vi.fn(async (_content: string, ref: FileRef) => ref);
  saveAs = vi.fn(async (_content: string, name: string) => ({ name }));
  exportFile = vi.fn(async () => null);
}

const stored = () => {
  const raw = localStorage.getItem(DRAFT_KEY);
  return raw === null ? null : (JSON.parse(raw) as { yaml: string; name: string; savedAt: string });
};

function setup(options: { embedded?: boolean } = {}) {
  TestBed.configureTestingModule({
    providers: [
      { provide: FileStorage, useClass: FakeStorage },
      ...(options.embedded
        ? [{ provide: EditorHost, useValue: { embedded: true, post() {}, listen: () => () => {} } }]
        : []),
    ],
  });
  const drafts = TestBed.inject(DraftStore);
  const store = TestBed.inject(DiagramStore);
  const doc = TestBed.inject(DiagramDocument);
  const storage = TestBed.inject(FileStorage) as FakeStorage;
  return { drafts, store, doc, storage };
}

/** A draft as an earlier session left it. */
const leaveDraft = (name = 'order.saga.yaml', yaml = serializeDiagram(emptyDiagram())) =>
  localStorage.setItem(
    DRAFT_KEY,
    JSON.stringify({ yaml, name, savedAt: '2026-10-04T10:00:00.000Z' }),
  );

describe('DraftStore', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    localStorage.clear();
  });

  describe('keeping unsaved edits', () => {
    it('writes nothing for a diagram that was not changed', () => {
      setup();
      TestBed.tick();
      vi.advanceTimersByTime(10 * DRAFT_DELAY_MS);
      expect(stored()).toBeNull();
    });

    it('writes a draft one second after the last edit, not before', () => {
      const { store, doc } = setup();
      TestBed.tick();
      store.addNode('state');
      TestBed.tick();
      vi.advanceTimersByTime(DRAFT_DELAY_MS - 1);
      expect(stored()).toBeNull();
      vi.advanceTimersByTime(1);

      expect(stored()).toMatchObject({
        yaml: serializeDiagram(store.diagram()),
        name: doc.name(),
      });
      expect(new Date(stored()!.savedAt).getTime()).not.toBeNaN();
    });

    it('waits for the last of several quick edits and writes once', () => {
      const { store } = setup();
      const setItem = vi.spyOn(Storage.prototype, 'setItem');
      TestBed.tick();
      for (let i = 0; i < 3; i++) {
        store.addNode('state');
        TestBed.tick();
        vi.advanceTimersByTime(DRAFT_DELAY_MS / 2);
      }
      vi.advanceTimersByTime(DRAFT_DELAY_MS);

      expect(setItem).toHaveBeenCalledTimes(1);
      expect(stored()!.yaml).toBe(serializeDiagram(store.diagram()));
    });

    it('removes the draft after a save', async () => {
      const { store, doc } = setup();
      TestBed.tick();
      store.addNode('state');
      TestBed.tick();
      vi.advanceTimersByTime(DRAFT_DELAY_MS);
      expect(stored()).not.toBeNull();

      await doc.save();
      TestBed.tick();

      expect(stored()).toBeNull();
    });

    it('removes the draft when the changes are discarded for a new diagram', () => {
      const { store, doc } = setup();
      TestBed.tick();
      store.addNode('state');
      TestBed.tick();
      vi.advanceTimersByTime(DRAFT_DELAY_MS);

      doc.newDiagram();
      TestBed.tick();

      expect(stored()).toBeNull();
    });

    it('removes the draft when the diagram is back in its saved state', () => {
      const { store } = setup();
      TestBed.tick();
      store.addNode('state');
      TestBed.tick();
      vi.advanceTimersByTime(DRAFT_DELAY_MS);
      expect(stored()).not.toBeNull();

      store.undo();
      TestBed.tick();

      expect(stored()).toBeNull();
    });

    it('does not write a draft that a save made unnecessary in the meantime', async () => {
      const { store, doc } = setup();
      TestBed.tick();
      store.addNode('state');
      TestBed.tick();
      await doc.save();
      TestBed.tick();
      vi.advanceTimersByTime(10 * DRAFT_DELAY_MS);
      expect(stored()).toBeNull();
    });
  });

  describe('when storage is not available', () => {
    it('keeps working when writing fails (full or blocked)', () => {
      const { store } = setup();
      vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new DOMException('full', 'QuotaExceededError');
      });
      TestBed.tick();
      store.addNode('state');
      TestBed.tick();
      expect(() => vi.advanceTimersByTime(DRAFT_DELAY_MS)).not.toThrow();
      expect(store.nodes()).toHaveLength(2);
    });

    it('starts without a draft when reading fails', () => {
      vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
        throw new DOMException('blocked', 'SecurityError');
      });
      const { drafts } = setup();
      expect(drafts.found()).toBeNull();
    });

    it('keeps working when removing fails', () => {
      const { store, doc } = setup();
      TestBed.tick();
      store.addNode('state');
      TestBed.tick();
      vi.advanceTimersByTime(DRAFT_DELAY_MS);
      vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
        throw new DOMException('blocked', 'SecurityError');
      });
      expect(() => {
        doc.newDiagram();
        TestBed.tick();
      }).not.toThrow();
    });
  });

  describe('finding a draft at start', () => {
    it('reads it, with its name and time', () => {
      leaveDraft('order.saga.yaml');
      const { drafts } = setup();
      expect(drafts.found()).toMatchObject({
        name: 'order.saga.yaml',
        savedAt: '2026-10-04T10:00:00.000Z',
        diagram: { nodes: [{ id: 'start-1' }] },
      });
    });

    it('finds nothing when there is none', () => {
      expect(setup().drafts.found()).toBeNull();
    });

    it.each([
      ['not JSON', 'oops {'],
      ['JSON that is not a draft', JSON.stringify({ hello: 'world' })],
      ['a draft without a name', JSON.stringify({ yaml: 'version: 3', savedAt: 'x' })],
      [
        'a draft whose YAML is not a diagram',
        JSON.stringify({ yaml: 'version: 99', name: 'a', savedAt: 'x' }),
      ],
      [
        'a draft whose YAML is broken',
        JSON.stringify({ yaml: 'nodes: [', name: 'a', savedAt: 'x' }),
      ],
      ['JSON null', 'null'],
    ])('removes %s without a word', (_what, raw) => {
      localStorage.setItem(DRAFT_KEY, raw);
      const { drafts } = setup();
      TestBed.tick();
      expect(drafts.found()).toBeNull();
      expect(localStorage.getItem(DRAFT_KEY)).toBeNull();
    });

    it('keeps it while the user has not answered, though nothing is unsaved yet', () => {
      leaveDraft();
      const { drafts } = setup();
      TestBed.tick();
      vi.advanceTimersByTime(10 * DRAFT_DELAY_MS);
      expect(drafts.found()).not.toBeNull();
      expect(localStorage.getItem(DRAFT_KEY)).not.toBeNull();
    });

    it('restores it as an unsaved diagram under its old name, tied to no file', () => {
      const saga = { ...emptyDiagram(), name: 'Recovered' };
      leaveDraft('order.saga.yaml', serializeDiagram(saga));
      const { drafts, doc, store } = setup();

      drafts.restore();

      expect(drafts.found()).toBeNull();
      expect(store.diagram()).toEqual(saga);
      expect(doc.name()).toBe('order.saga.yaml');
      expect(doc.dirty()).toBe(true);
      expect(doc.file()).toEqual({ name: 'order.saga.yaml' });
    });

    it('keeps the restored diagram as a draft until it is saved', async () => {
      leaveDraft();
      const { drafts, doc, storage } = setup();
      drafts.restore();
      TestBed.tick();
      vi.advanceTimersByTime(DRAFT_DELAY_MS);
      expect(stored()).not.toBeNull();

      await doc.save();
      TestBed.tick();

      // No file handle, so it is the storage that asks where to save.
      expect(storage.save).toHaveBeenCalledWith(expect.any(String), { name: 'order.saga.yaml' });
      expect(stored()).toBeNull();
    });

    it('throws it away on request', () => {
      leaveDraft();
      const { drafts, doc } = setup();

      drafts.discard();

      expect(drafts.found()).toBeNull();
      expect(localStorage.getItem(DRAFT_KEY)).toBeNull();
      expect(doc.dirty()).toBe(false);
    });

    it('does nothing when asked to restore without a draft', () => {
      const { drafts, doc } = setup();
      drafts.restore();
      expect(doc.dirty()).toBe(false);
    });
  });

  describe('in a host (VS Code)', () => {
    it('keeps nothing, and finds nothing: the host keeps the document', () => {
      leaveDraft();
      const { drafts, store } = setup({ embedded: true });
      TestBed.tick();
      store.addNode('state');
      TestBed.tick();
      vi.advanceTimersByTime(10 * DRAFT_DELAY_MS);

      expect(drafts.found()).toBeNull();
      // Neither written over nor removed.
      expect(stored()!.savedAt).toBe('2026-10-04T10:00:00.000Z');
    });
  });
});

@Component({ imports: [DraftBanner], template: '<app-draft-banner />' })
class Host {}

describe('DraftBanner', () => {
  beforeEach(() => {
    localStorage.clear();
  });
  afterEach(() => localStorage.clear());

  const render = async () => {
    TestBed.configureTestingModule({
      providers: [{ provide: FileStorage, useClass: FakeStorage }],
    });
    const fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
    return fixture;
  };
  const element = (fixture: { nativeElement: unknown }) => fixture.nativeElement as HTMLElement;
  const button = (fixture: { nativeElement: unknown }, label: string) =>
    [...element(fixture).querySelectorAll('button')].find((b) => b.textContent?.trim() === label)!;

  it('shows nothing without a draft', async () => {
    const fixture = await render();
    expect(element(fixture).querySelector('.banner')).toBeNull();
  });

  it('says what was found, and Restore opens it', async () => {
    leaveDraft('order.saga.yaml');
    const fixture = await render();
    const banner = element(fixture).querySelector('.banner')!;
    expect(banner.getAttribute('role')).toBe('status');
    expect(banner.textContent).toContain('Unsaved changes to order.saga.yaml from');
    expect(banner.textContent).toContain('were found.');

    button(fixture, 'Restore').click();
    await fixture.whenStable();

    expect(element(fixture).querySelector('.banner')).toBeNull();
    expect(TestBed.inject(DiagramDocument).name()).toBe('order.saga.yaml');
    expect(TestBed.inject(DiagramDocument).dirty()).toBe(true);
  });

  it('Discard removes the draft and the banner', async () => {
    leaveDraft();
    const fixture = await render();

    button(fixture, 'Discard').click();
    await fixture.whenStable();

    expect(element(fixture).querySelector('.banner')).toBeNull();
    expect(localStorage.getItem(DRAFT_KEY)).toBeNull();
    expect(TestBed.inject(DiagramDocument).dirty()).toBe(false);
  });
});
