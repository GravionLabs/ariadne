import { serializeDiagram } from '@ariadne/core';
import { FetchOptions, fetchSaga, readSaga, readSagaObject } from './read-saga';

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
      error: { kind: 'invalid', message: 'nodes must be a list', line: 2, column: 8 },
    });
    expect(readSaga('nodes: [')).toMatchObject({ error: { kind: 'invalid' } });
  });

  it('refuses text over the size limit as an invalid file', () => {
    const huge = `version: 3\nname: ${'x'.repeat(5_000_000)}\n`;
    expect(readSaga(huge)).toEqual({
      error: {
        kind: 'invalid',
        message: 'The file is 5 MB; Ariadne reads diagrams up to 5 MB.',
      },
    });
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
      error: {
        kind: 'network',
        status: 404,
        message: '/x.saga.yaml could not be loaded (404 Not Found).',
      },
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

const json = JSON.stringify({
  version: 3,
  name: 'Order',
  nodes: [{ id: 'start-1', type: 'start', name: 'Initial' }],
  edges: [],
});

describe('JSON input', () => {
  it('reads JSON text like YAML', () => {
    expect(readSaga(json)).toMatchObject({ diagram: { name: 'Order' } });
  });

  it('places a JSON syntax error at line and column', () => {
    const result = readSaga('{\n  "version": 3,\n  "nodes": [,]\n}');
    expect(result).toMatchObject({ error: { kind: 'invalid', line: 3, column: 13 } });
  });

  it('places a format error of JSON text at the offending value', () => {
    const result = readSaga('{\n  "version": 3,\n  "nodes": {}\n}');
    expect(result).toEqual({
      error: { kind: 'invalid', message: 'nodes must be a list', line: 3, column: 12 },
    });
  });

  it('validates a parsed object like text, without a position', () => {
    expect(readSagaObject(JSON.parse(json))).toMatchObject({ diagram: { name: 'Order' } });
    const bad = readSagaObject({ version: 3, nodes: {} });
    expect(bad).toEqual({ error: { kind: 'invalid', message: 'nodes must be a list' } });
    expect(readSagaObject(null)).toMatchObject({ error: { kind: 'invalid' } });
    expect(readSagaObject({ version: 99, nodes: [], edges: [] })).toMatchObject({
      error: { kind: 'version', version: 99 },
    });
  });
});

describe('fetchSaga with credentials', () => {
  it('draws a JSON response whatever its content type', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(json, { headers: { 'content-type': 'text/plain' } })),
    );
    expect(await fetchSaga('/api/sagas/order')).toMatchObject({ diagram: { name: 'Order' } });
  });

  it('passes credentials mode and headers to fetch', async () => {
    const fetchMock = vi.fn(async () => new Response(json));
    vi.stubGlobal('fetch', fetchMock);
    await fetchSaga('/api', undefined, {
      credentials: 'include',
      headers: { Authorization: 'Bearer t' },
    });
    const init = (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1];
    expect(init.credentials).toBe('include');
    expect(new Headers(init.headers).get('Authorization')).toBe('Bearer t');
  });

  it('asks for JSON, unless the host chose an Accept', async () => {
    const fetchMock = vi.fn(async () => new Response(json));
    vi.stubGlobal('fetch', fetchMock);
    await fetchSaga('/api');
    await fetchSaga('/api', undefined, { headers: { Accept: 'application/yaml' } });
    const accept = (i: number) =>
      new Headers((fetchMock.mock.calls[i] as unknown as [string, RequestInit])[1].headers).get(
        'Accept',
      );
    expect(accept(0)).toMatch(/^application\/json/);
    expect(accept(1)).toBe('application/yaml');
  });

  it('uses the fetch of the host instead of the global one', async () => {
    const globalFetch = vi.fn();
    vi.stubGlobal('fetch', globalFetch);
    const own = vi.fn<NonNullable<FetchOptions['fetch']>>(async () => new Response(json));
    expect(await fetchSaga('/api', undefined, { fetch: own })).toMatchObject({
      diagram: { name: 'Order' },
    });
    expect(own).toHaveBeenCalledWith('/api', expect.any(Object));
    expect(globalFetch).not.toHaveBeenCalled();
  });

  it.each([401, 403])('reports %i as a network error with the status', async (status) => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('', { status, statusText: 'No' })),
    );
    expect(await fetchSaga('/api')).toMatchObject({ error: { kind: 'network', status } });
  });
});
