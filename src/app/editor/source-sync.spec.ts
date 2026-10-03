import { TestBed } from '@angular/core/testing';
import { DiagramStore } from '../model/diagram-store';
import { serializeDiagram } from '../model/diagram-yaml';
import { DiagramDocument } from '../storage/diagram-document';
import { FileStorage } from '../storage/file-storage';
import { SOURCE_DEBOUNCE_MS, SourceSync } from './source-sync';

describe('SourceSync', () => {
  let store: DiagramStore;
  let sync: SourceSync;
  let document: DiagramDocument;

  /** Runs effects and, optionally, the debounce timer. */
  const tick = (ms = 0) => {
    vi.advanceTimersByTime(ms);
    TestBed.tick();
  };

  beforeEach(() => {
    vi.useFakeTimers();
    TestBed.configureTestingModule({
      providers: [
        SourceSync,
        { provide: FileStorage, useValue: { open: vi.fn(), save: vi.fn(), saveAs: vi.fn() } },
      ],
    });
    store = TestBed.inject(DiagramStore);
    document = TestBed.inject(DiagramDocument);
    sync = TestBed.inject(SourceSync);
    tick();
  });

  afterEach(() => vi.useRealTimers());

  const withName = (text: string, from: string, to: string) => text.replace(from, to);

  describe('diagram → text', () => {
    it('starts with the diagram in file format', () => {
      expect(sync.text()).toBe(serializeDiagram(store.diagram()));
      expect(sync.status()).toEqual({ kind: 'synced' });
    });

    it('follows edits of the diagram, also undo and redo', () => {
      store.appendNode('start-1', 'state');
      tick();
      expect(sync.text()).toBe(serializeDiagram(store.diagram()));
      expect(sync.text()).toContain('id: state-1');
      store.undo();
      tick();
      expect(sync.text()).not.toContain('state-1');
      store.redo();
      tick();
      expect(sync.text()).toContain('state-1');
    });

    it('follows a diagram that is loaded, replacing text with errors', () => {
      sync.edit('nodes: [');
      tick(SOURCE_DEBOUNCE_MS);
      expect(sync.status().kind).toBe('error');
      store.load({ direction: 'left-right', nodes: [], edges: [] });
      tick();
      expect(sync.text()).toBe(serializeDiagram(store.diagram()));
      expect(sync.status()).toEqual({ kind: 'synced' });
    });

    it('drops a pending edit when the diagram changes under it', () => {
      sync.edit(withName(sync.text(), 'name: Initial', 'name: Typed'));
      store.appendNode('start-1', 'state');
      tick();
      tick(SOURCE_DEBOUNCE_MS * 2);
      expect(store.nodes()[0].name).toBe('Initial');
      expect(sync.text()).toContain('name: Initial');
    });
  });

  describe('text → diagram', () => {
    it('applies valid text after a pause, as one undo step', () => {
      sync.edit(withName(sync.text(), 'name: Initial', 'name: Begin'));
      expect(sync.status()).toEqual({ kind: 'pending' });
      tick(SOURCE_DEBOUNCE_MS - 1);
      expect(store.nodes()[0].name).toBe('Initial');
      tick(1);
      expect(store.nodes()[0].name).toBe('Begin');
      expect(sync.status()).toEqual({ kind: 'synced' });
      store.undo();
      expect(store.nodes()[0].name).toBe('Initial');
      expect(store.canUndo()).toBe(false);
    });

    it('waits for the pause: several keystrokes are one change', () => {
      sync.edit(withName(sync.text(), 'name: Initial', 'name: B'));
      tick(SOURCE_DEBOUNCE_MS - 50);
      sync.edit(withName(sync.text(), 'name: B', 'name: Be'));
      tick(SOURCE_DEBOUNCE_MS - 50);
      expect(store.nodes()[0].name).toBe('Initial');
      tick(50);
      expect(store.nodes()[0].name).toBe('Be');
      store.undo();
      expect(store.nodes()[0].name).toBe('Initial');
    });

    it('does not rewrite the text the user typed, even if it is not in canonical form', () => {
      const typed = `# my notes\n${withName(sync.text(), 'name: Initial', 'name: Begin')}`;
      sync.edit(typed);
      tick(SOURCE_DEBOUNCE_MS);
      expect(store.nodes()[0].name).toBe('Begin');
      expect(sync.text()).toBe(typed);
    });

    it('rewrites the text on the next change of the diagram, then undo returns to the typed one', () => {
      const typed = withName(sync.text(), 'name: Initial', 'name: Begin');
      sync.edit(typed);
      tick(SOURCE_DEBOUNCE_MS);
      const applied = store.diagram();

      store.appendNode('start-1', 'state');
      tick();
      expect(sync.text()).toContain('state-1');

      // Back to the diagram that came from the text: the text must follow, not stay stale.
      store.undo();
      tick();
      expect(store.diagram()).toBe(applied);
      expect(sync.text()).toBe(serializeDiagram(applied));
      expect(sync.text()).not.toContain('state-1');
    });

    it('adds and removes states by editing the text', () => {
      const text = serializeDiagram({
        direction: 'top-bottom',
        nodes: [
          { id: 'start-1', type: 'start', name: 'Initial' },
          {
            id: 'state-1',
            type: 'state',
            name: 'Charging',
            activities: [{ kind: 'command', name: 'ChargePayment' }],
          },
        ],
        edges: [
          {
            id: 'edge-1',
            source: 'start-1',
            target: 'state-1',
            kind: 'forward',
            event: 'OrderReceived',
          },
        ],
      });
      sync.edit(text);
      tick(SOURCE_DEBOUNCE_MS);
      expect(store.nodes().map((n) => n.id)).toEqual(['start-1', 'state-1']);
      expect(store.edges()[0].event).toBe('OrderReceived');
      expect(store.nodes()[1].activities).toEqual([{ kind: 'command', name: 'ChargePayment' }]);
    });

    it('flush() applies without waiting', () => {
      sync.edit(withName(sync.text(), 'name: Initial', 'name: Begin'));
      sync.flush();
      expect(store.nodes()[0].name).toBe('Begin');
      tick(SOURCE_DEBOUNCE_MS * 2);
      expect(store.canUndo()).toBe(true);
      store.undo();
      expect(store.canUndo()).toBe(false);
    });

    it('does nothing for text that is the same as before', () => {
      sync.edit(sync.text());
      expect(sync.status()).toEqual({ kind: 'synced' });
      expect(store.canUndo()).toBe(false);
    });

    it('records no history for text that only differs in formatting', () => {
      sync.edit(`# comment\n${sync.text()}`);
      tick(SOURCE_DEBOUNCE_MS);
      expect(sync.status()).toEqual({ kind: 'synced' });
      expect(store.canUndo()).toBe(false);
    });
  });

  describe('invalid text', () => {
    it('is reported, and neither the diagram nor the text change', () => {
      const before = store.diagram();
      sync.edit('version: 3\nnodes: {}\n');
      tick(SOURCE_DEBOUNCE_MS);
      const status = sync.status();
      expect(status.kind).toBe('error');
      expect(status.kind === 'error' && status.error.message).toMatch(/nodes must be a list/);
      expect(store.diagram()).toBe(before);
      expect(sync.text()).toBe('version: 3\nnodes: {}\n');
    });

    it('reports YAML syntax errors', () => {
      sync.edit('nodes: [');
      tick(SOURCE_DEBOUNCE_MS);
      const status = sync.status();
      expect(status.kind === 'error' && status.error.message).toMatch(/Not valid YAML/);
    });

    it('recovers when the text is fixed', () => {
      sync.edit('nodes: [');
      tick(SOURCE_DEBOUNCE_MS);
      expect(sync.status().kind).toBe('error');
      sync.edit(withName(serializeDiagram(store.diagram()), 'name: Initial', 'name: Fixed'));
      tick(SOURCE_DEBOUNCE_MS);
      expect(sync.status()).toEqual({ kind: 'synced' });
      expect(store.nodes()[0].name).toBe('Fixed');
    });

    it('does not apply a diagram with a missing reference', () => {
      sync.edit(
        `${serializeDiagram(store.diagram())}edges:\n  - { id: e, source: start-1, target: nope }\n`.replace(
          'edges: []\n',
          '',
        ),
      );
      tick(SOURCE_DEBOUNCE_MS);
      expect(sync.status().kind).toBe('error');
      expect(store.edges()).toEqual([]);
    });
  });

  describe('older file versions', () => {
    it('migrates pasted version 2 text and tells the user', () => {
      sync.edit(
        [
          'version: 2',
          'nodes:',
          '  - { id: start-1, type: start, name: Initial }',
          '  - { id: state-1, type: state, name: Reserving stock }',
          'edges:',
          '  - { id: edge-1, source: start-1, target: state-1, activities: [{ command: ReserveStock }] }',
          '',
        ].join('\n'),
      );
      tick(SOURCE_DEBOUNCE_MS);
      expect(store.nodes()[1].activities).toEqual([{ kind: 'command', name: 'ReserveStock' }]);
      expect(document.notice()).toContain('"Reserving stock"');
    });
  });
});
