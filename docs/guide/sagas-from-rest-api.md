# Sagas from a REST API

An admin frontend usually does not serve `.saga.yaml` files. Its backends return the sagas they run, as JSON, from a
REST API, and the frontend draws what comes back. This page shows how, with the viewer
([`@ariadne/viewer`](viewer.md)), and how to keep a response as a checked-in YAML file.

## The JSON form

A saga is the same document in JSON as in YAML: the same fields, the same `version`. The order saga of the guide as
JSON is [`order.saga.json`](../examples/order.saga.json), next to [its YAML](../examples/order.saga.yaml). It
begins:

```json
{
  "version": 3,
  "name": "OrderSaga",
  "direction": "top-bottom",
  "nodes": [
    {
      "id": "start-1",
      "type": "start",
      "name": "Initial"
    },
```

The samples and the files in your repository stay YAML, which diffs well. JSON is for the wire. The viewer and the
tools tell the two apart by the content, not by the file name or the media type.

## The REST shape

The shape that the viewer reads, and that [the .NET library](https://github.com/GravionLabs/ariadne/issues/502)
is meant to produce in a MassTransit backend once it exists, is defined in
[the format specification](../specs/diagram-format.md#rest-shape):

- `GET /sagas/{name}` returns one saga: the document above, with no envelope.
- `GET /sagas` returns a list of `{ "name", "title", "link" }`, where `link` is the URL of the saga. The list carries
  no diagram; follow `link`.
- A failure is an HTTP status (404 for an unknown saga); no body is needed.

```json
[
  { "name": "order", "title": "Order Saga", "link": "/sagas/order" },
  { "name": "travel-booking", "title": "Travel booking", "link": "/sagas/travel-booking" }
]
```

## Draw it with `src`

Give the element the URL of the saga. It fetches it, asking for JSON first, and draws it.

```js
api.src = sagaLink; // fetched by the element: JSON, decided by the content
```

In Angular, `AriadneSaga` loads the URL with your `HttpClient`, so your interceptors and base URLs apply:

<!-- prettier-ignore -->
```html
<ariadne-saga
  url="order.saga.json"
  credentials="same-origin"
  [headers]="{ 'X-Demo': 'viewer' }"
/>
```

## Draw it with `diagram`

If your app has the response already (from its own client, a store, a resolver), hand over the parsed object. It is
validated like a file and wins over `source` and `src`:

```js
element.diagram = JSON.parse(jsonText);
```

## Authentication

Backends of an admin tool sit behind a login. Two ways reach the element:

- **A token**: set `headers`, for example `Authorization`. For a token that expires, give a `fetcher`, your own
  `fetch` that the element calls with the URL and the request.
- **Cookies**: set `credentials` (`omit`, `same-origin` or `include`, which sends cookies across origins).

```js
api.headers = { Authorization: 'Bearer demo-token' };
api.fetcher = mockFetch;
```

In Angular use the `headers` and `credentials` inputs above, and an interceptor in place of `fetcher`.

A failed status, 401 and 403 among them, shows a message in the element and fires `error` with
`kind: 'network'` and the `status`. A response that is not a saga fires `error` with `kind: 'invalid'` and, for JSON
text, the `line` and `column`; for an object given as `diagram` there is no position.

## The path of a running instance

A backend that returns the history of a saga instance gives the frontend what the viewer needs to draw where the
instance is. The demo page does this with a mock API: the instance names its saga and lists its steps, and the page
sets `path` when the instance belongs to the saga on screen.

```js
'/instances/o-1': { saga: '/sagas/order', path: [{ event: 'Step1' }, { event: 'Step2' }] },
const instance = await get(instanceLink);
if (instance.saga === sagaLink) api.path = instance.path;
```

The viewer resolves the steps against the diagram, emphasises the states visited and marks the current one. How the
steps are resolved, and the timeline view, are in [Show a saga in your own app](viewer.md) and the
[viewer README](../../packages/viewer/README.md). The whole flow runs on the demo page
(`packages/viewer/demo/index.html`, section "A JSON endpoint").

## Keep a response as a YAML file

A response is a good start for a saga that you want in git, next to the code. `ariadne convert` turns JSON into YAML
(and back); the command also reads the standard input:

```sh
curl https://host/sagas/order | ariadne convert - --to yaml -o docs/order.saga.yaml
```

To write the YAML for a JSON file, and to keep what a person added to the YAML (descriptions, colours, event
sources) when the JSON changes:

```sh
ariadne convert docs/order.saga.yaml --to json       # writes docs/order.saga.json, keeps the source
ariadne convert order.saga.json --to yaml --merge    # keep descriptions, colors, eventSource, ... in order.saga.yaml
```

`convert` does not overwrite a file without `--force`; `--merge` writes over it and lists on the standard error the
elements that are gone. Every other command (`lint`, `export`, `diff`, ...) reads `*.saga.json` too. The CLI is
described in its [README](../../apps/cli/README.md).

## See also

- [Show a saga in your own app](viewer.md): the element, its extras and theming.
- [The format specification](../specs/diagram-format.md): the JSON form, the schemas and the REST shape.
- [The .NET library, issue #502](https://github.com/GravionLabs/ariadne/issues/502): serving the JSON from a
  MassTransit backend (not released yet).
