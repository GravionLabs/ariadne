import { serializeDiagram } from '@ariadne/core';
import { fetchSaga, readSaga } from './read-saga';

const yaml = serializeDiagram({
  direction: 'top-bottom',
  name: 'Order',
  nodes: [{ id: 'start-1', type: 'start', name: 'Initial' }],
  edges: [],
});

afterEach(() => vi.unstubAllGlobals());

describe('readSaga', () => {
  it('reads a saga file', () => {
    expect(readSaga(yaml)).toMatchObject({ diagram: { name: 'Order' } });
  });

  it('reads older format versions like the editor', () => {
    const v1 = 'version: 1\nnodes:\n  - { id: a, type: step, name: A }\nedges: []\n';
    expect(readSaga(v1)).toMatchObject({ diagram: { nodes: [{ type: 'state' }] } });
  });

  it("reports an invalid file with the reader's message", () => {
    expect(readSaga('version: 3\nnodes: {}')).toEqual({
      error: { kind: 'invalid', message: 'nodes must be a list' },
    });
    expect(readSaga('nodes: [')).toMatchObject({ error: { kind: 'invalid' } });
  });

  it('names a newer format version', () => {
    const { error } = readSaga('version: 9') as {
      error: { kind: string; version: number; message: string };
    };
    expect(error.kind).toBe('version');
    expect(error.version).toBe(9);
    expect(error.message).toContain('version 9');
  });
});

describe('fetchSaga', () => {
  it('fetches and reads', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(yaml)),
    );
    expect(await fetchSaga('/order.saga.yaml')).toMatchObject({ diagram: { name: 'Order' } });
  });

  it('reports a failed status and a failed request as network errors', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('no', { status: 404, statusText: 'Not Found' })),
    );
    expect(await fetchSaga('/x.saga.yaml')).toEqual({
      error: { kind: 'network', message: '/x.saga.yaml could not be loaded (404 Not Found).' },
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Promise.reject(new TypeError('Failed to fetch'))),
    );
    expect(await fetchSaga('/x.saga.yaml')).toMatchObject({
      error: { kind: 'network', message: expect.stringContaining('Failed to fetch') },
    });
  });

  it('reads an invalid file behind a good response as invalid', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('hello: world')),
    );
    expect(await fetchSaga('/x')).toMatchObject({ error: { kind: 'invalid' } });
  });

  it('lets an abort through', async () => {
    const abort = new AbortController();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Promise.reject(new DOMException('x', 'AbortError'))),
    );
    abort.abort();
    await expect(fetchSaga('/x', abort.signal)).rejects.toThrow();
  });
});
