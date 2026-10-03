import { TestBed } from '@angular/core/testing';
import { parseDiagram, serializeDiagram } from '@ariadne/core';
import type { EditorMessage, HostMessage } from '@ariadne/editor-protocol';
import orderYaml from '../../../../../docs/examples/order.saga.yaml';
import { DiagramStore } from '../model/diagram-store';
import { Theme } from '../theme';
import { EditorHost } from './editor-host';
import { EmbeddedSync } from './embedded-sync';

function setup(embedded = true) {
  const posted: EditorMessage[] = [];
  let handler: (message: HostMessage) => void = () => {};
  TestBed.configureTestingModule({
    providers: [
      {
        provide: EditorHost,
        useValue: {
          embedded,
          post: (m: EditorMessage) => posted.push(m),
          listen: (h: (message: HostMessage) => void) => {
            handler = h;
            return () => {};
          },
        },
      },
    ],
  });
  const sync = TestBed.inject(EmbeddedSync);
  const store = TestBed.inject(DiagramStore);
  sync.start();
  const send = (message: HostMessage) => {
    handler(message);
    TestBed.tick();
  };
  const init = (text: string) =>
    send({ v: 1, type: 'init', text, theme: 'dark', settings: { autoLayout: true } });
  const edits = () => posted.filter((m) => m.type === 'edit');
  return { sync, store, posted, send, init, edits };
}

describe('EmbeddedSync', () => {
  it('says ready and waits for the document', () => {
    const { posted, edits } = setup();
    TestBed.tick();
    expect(posted).toEqual([{ v: 1, type: 'ready' }]);
    expect(edits()).toEqual([]);
  });

  it('shows the document it is given, without writing it back', () => {
    const { store, init, edits, sync } = setup();
    init(orderYaml);
    expect(store.diagram()).toEqual(parseDiagram(orderYaml));
    expect(edits()).toEqual([]);
    expect(sync.opened()).toBe(1);
  });

  it('applies the theme of the host', () => {
    const { init, send } = setup();
    init(orderYaml);
    expect(TestBed.inject(Theme).name()).toBe('dark');
    send({ v: 1, type: 'theme', kind: 'high-contrast' });
    expect(TestBed.inject(Theme).name()).toBe('high-contrast');
  });

  it('sends the whole deterministic text for a change of the user', () => {
    const { store, init, edits } = setup();
    init(orderYaml);
    store.setDetails({ name: 'Renamed' });
    TestBed.tick();
    expect(edits()).toEqual([{ v: 1, type: 'edit', text: serializeDiagram(store.diagram()) }]);
    expect(parseDiagram((edits()[0] as { text: string }).text).name).toBe('Renamed');
  });

  it('sends one edit for several quick changes', () => {
    const { store, init, edits } = setup();
    init(orderYaml);
    store.setDetails({ name: 'One' });
    store.setDetails({ name: 'Two' });
    TestBed.tick();
    expect(edits()).toHaveLength(1);
  });

  it('shows a change of the document and keeps the ids of the nodes', () => {
    const { store, init, send, edits } = setup();
    init(orderYaml);
    const ids = store.nodes().map((n) => n.id);
    send({
      v: 1,
      type: 'documentChanged',
      text: serializeDiagram({ ...parseDiagram(orderYaml), name: 'From git' }),
    });
    expect(store.diagram().name).toBe('From git');
    expect(store.nodes().map((n) => n.id)).toEqual(ids);
    expect(edits()).toEqual([]);
  });

  it('ignores a change of the document that is its own last edit', () => {
    const { store, init, send, edits } = setup();
    init(orderYaml);
    store.setDetails({ name: 'Mine' });
    TestBed.tick();
    store.setDetails({ name: 'Newer' });
    const old = (edits()[0] as { text: string }).text;
    send({ v: 1, type: 'documentChanged', text: old });
    expect(store.diagram().name).toBe('Newer');
  });

  it('keeps the history off: the host undoes', () => {
    const { store, init } = setup();
    init(orderYaml);
    store.setDetails({ name: 'x' });
    expect(store.canUndo()).toBe(false);
  });

  describe('an invalid document', () => {
    it('reports it, keeps the diagram and sends nothing', () => {
      const { store, init, send, sync, edits } = setup();
      init(orderYaml);
      const before = store.diagram();
      send({ v: 1, type: 'documentChanged', text: 'nodes: [unclosed' });
      expect(sync.invalid()).toMatch(/\S/);
      expect(store.diagram()).toBe(before);
      expect(edits()).toEqual([]);
    });

    it('never overwrites the file, even if the diagram is touched', () => {
      const { store, init, send, edits } = setup();
      init(orderYaml);
      send({ v: 1, type: 'documentChanged', text: '{{{' });
      store.setDetails({ name: 'sneaky' });
      TestBed.tick();
      expect(edits()).toEqual([]);
    });

    it('comes back when the document is valid again', () => {
      const { store, init, send, sync } = setup();
      init(orderYaml);
      send({ v: 1, type: 'documentChanged', text: '{{{' });
      send({ v: 1, type: 'documentChanged', text: orderYaml });
      expect(sync.invalid()).toBeNull();
      expect(store.diagram()).toEqual(parseDiagram(orderYaml));
    });

    it('does not count as opened, and offers "Open as text"', () => {
      const { init, sync, posted } = setup();
      init('{{{');
      expect(sync.opened()).toBe(0);
      sync.showAsText();
      expect(posted.at(-1)).toEqual({ v: 1, type: 'showAsText' });
    });
  });

  it('marks the page as hosted in VS Code, so the styles use its colours', () => {
    setup();
    expect(document.documentElement.getAttribute('data-host')).toBe('vscode');
    document.documentElement.removeAttribute('data-host');
  });

  it('does nothing without a host', () => {
    const { posted, store } = setup(false);
    expect(document.documentElement.hasAttribute('data-host')).toBe(false);
    store.setDetails({ name: 'x' });
    TestBed.tick();
    expect(posted).toEqual([]);
  });
});
