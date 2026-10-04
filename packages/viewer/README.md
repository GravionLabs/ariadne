# @ariadne/viewer

A read-only viewer for [Ariadne](https://github.com/GravionLabs/ariadne) saga diagrams, to embed in admin tools
and documentation: the `<ariadne-saga>` custom element, with zoom and pan, a walkthrough, the message catalog,
problem markers and the path a saga instance took. Angular apps get a wrapper with signal inputs and outputs.
It draws what the editor, the exports and the VS Code preview draw, from the same `.saga.yaml` files.

```html
<ariadne-saga src="/api/sagas/order.saga.yaml"></ariadne-saga>
```

## Install

```sh
pnpm add @ariadne/viewer
```

The package has no dependencies: the saga reader and the renderer are bundled. For a page without a build step,
load one file; it registers the element:

```html
<script type="module" src="https://unpkg.com/@ariadne/viewer/dist/ariadne-viewer.js"></script>
```

## The custom element

With a bundler, register the element once:

```ts
import { defineAriadneSaga } from '@ariadne/viewer';

defineAriadneSaga(); // <ariadne-saga>; pass another tag name if you like
```

Importing the package does nothing on a server (no DOM needed), so it is safe in server-side rendering.

Give it a saga in one of two ways:

```html
<!-- Fetched by the element -->
<ariadne-saga src="/api/sagas/order.saga.yaml"></ariadne-saga>

<!-- Or the YAML text, if your app has it already (wins over src) -->
<ariadne-saga id="saga"></ariadne-saga>
<script>
  document.getElementById('saga').source = yamlText;
</script>
```

Give the element a height (`ariadne-saga { height: 480px }`); it fills it.

| Attribute / property | Meaning                                                                                                                 |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `src`                | URL of a `.saga.yaml`, fetched with `fetch`.                                                                            |
| `source`             | The saga as YAML text. Wins over `src`.                                                                                 |
| `direction`          | `top-bottom` or `left-right`, overriding the file's.                                                                    |
| `theme`              | `light`, `dark` or `auto` (the default: follows `prefers-color-scheme`).                                                |
| `features`           | Opt-in extras, space separated: `walkthrough`, `messages`, `problems`. Each adds a button and a read-only panel.        |
| `emphasis` †         | `{ nodes: ['Reserving stock'], edges: ['edge-2'] }`: states (id or name) and transitions (id) to pick out from outside. |
| `selection` †        | `{ kind: 'node' \| 'edge', id }`: the picked state or transition. Setting it fires no `select`.                         |
| `path` †             | The steps a saga instance took (below). Set it again as the instance moves on and the view follows.                     |
| `show-untaken`       | With a `path`, keep what the instance did not take at full strength instead of fading it.                               |

† A property, not an attribute.

### Events

All of them bubble and cross the shadow boundary; the data is in `event.detail`.

| Event          | Detail                                                                                                        |
| -------------- | ------------------------------------------------------------------------------------------------------------- |
| `load`         | `{ diagram }`: the saga was read and drawn.                                                                   |
| `error`        | `{ kind: 'network' \| 'invalid' \| 'version', message, version? }`: nothing is shown.                         |
| `select`       | `{ selection }`: the state or transition the user picked (with its `node` or `edge`), or `null` when cleared. |
| `walkthrough`  | `{ steps, path }`: the transitions (ids) and states (ids) of the walkthrough, after each step.                |
| `pathresolved` | The resolved `path`: `{ transitions, problems, current, finished, stepNumbers, visits, nodes }`.              |

### Loading and errors

While a file loads the element says so. A failed request, a file that is not a saga (the reader's message is
shown), and a file in a newer format version than the viewer reads (the version is named; update the viewer) each
show their message in the element and fire `error`.

The viewer reads format **version 3 and older** files, like the editor: older ones are brought up to date as they
are read. Its documentation is [the file format](https://github.com/GravionLabs/ariadne/blob/main/docs/specs/diagram-format.md).

### The path of an instance

```js
saga.path = [
  { event: 'OrderSubmitted', at: '10:00' },
  { event: 'StockReserved', note: 'in stock' },
  { event: 'PaymentFailed', to: 'Reserving stock' }, // `to` tells transitions on one event apart
];
```

Each step is the event the saga received (or `{ state: 'Charging payment' }`), resolved against the diagram from
the initial state on, with the same rules as the walkthrough. The states visited and the transitions taken are
emphasised, the rest fades; transitions carry their step numbers (a loop taken twice reads `2, 4`), states how often
they were visited; the last state is marked as the current one, or as finished in a final state. `at` and `note`
show in a tooltip. A step that cannot be resolved (no transition reacts to that event) or that does not say which of
several transitions is meant is listed in the element and marked at the last good state; the path is not drawn past
it, and the viewer never guesses. `pathresolved` reports the same to your app.

### Theming

The element reads CSS custom properties; set them on the element or on any ancestor. Without them it looks like the
editor, in the light or the dark theme.

```css
ariadne-saga {
  --ariadne-bg: #fffbeb;
  --ariadne-step: #b45309;
}
```

| Property                                                                                                                                                                 | Colours                        |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------ |
| `--ariadne-bg`                                                                                                                                                           | The canvas behind the diagram. |
| `--ariadne-surface`, `--ariadne-border`, `--ariadne-line`, `--ariadne-text`, `--ariadne-text-subtle`                                                                     | Cards, lines and text.         |
| `--ariadne-start`, `--ariadne-step`, `--ariadne-decision`, `--ariadne-any`, `--ariadne-join`, `--ariadne-end`                                                            | The kinds of state.            |
| `--ariadne-command`, `--ariadne-event`, `--ariadne-external`, `--ariadne-timeout`, `--ariadne-reply`, `--ariadne-fault`, `--ariadne-compensation`, `--ariadne-composite` | Messages and transitions.      |
| `--ariadne-palette-red` … `--ariadne-palette-pink`                                                                                                                       | The accent colours of a state. |
| `--ariadne-focus`, `--ariadne-emphasis`, `--ariadne-path`, `--ariadne-on-path`                                                                                           | Focus, emphasis and the path.  |

A dark theme set on the element wins over properties inherited from an ancestor; set the property on the element
itself (`ariadne-saga[theme='dark'] { ... }`) for that. The parts `frame`, `header`, `viewport`, `diagram`, `tabs`,
`panels`, `panel`, `toolbar`, `button`, `status` and `path-info` can be styled with `::part()`.

### Accessibility

The diagram has a label with the saga's name; states and transitions can be reached with Tab and are announced
(`State: Reserving stock`, `Transition on StockReserved from … to …`). Drag or the arrow keys pan, the wheel and
`+` / `-` zoom, `0` fits the diagram, Enter or Space picks the focused item. The extras are plain buttons and lists.

## Angular

```ts
// app.config.ts
import { provideHttpClient } from '@angular/common/http';
import { provideAriadneViewer } from '@ariadne/viewer/angular';

export const appConfig: ApplicationConfig = {
  providers: [provideHttpClient(), provideAriadneViewer()],
};
```

```ts
import { AriadneSaga } from '@ariadne/viewer/angular';

@Component({
  imports: [AriadneSaga],
  template: `
    <ariadne-saga
      url="/api/sagas/order.saga.yaml"
      [features]="['walkthrough', 'messages']"
      [path]="instance.history"
      (selected)="open($event.selection)"
    />
  `,
})
export class SagaPage {}
```

`provideAriadneViewer()` registers the element once. `url` is loaded with your app's `HttpClient`, so interceptors,
authentication and base URLs apply (it does not use `fetch`); `source` takes the YAML text. The component works with
zoneless change detection, renders nothing on the server, and fills in after hydration. Angular 21 and 22 are
supported (`@angular/core` and `@angular/common` are peer dependencies, as is `rxjs`).

| Input                                                                                             | Output               | Data                          |
| ------------------------------------------------------------------------------------------------- | -------------------- | ----------------------------- |
| `url`, `source`, `direction`, `theme`, `features`, `emphasis`, `selection`, `path`, `showUntaken` | `loaded`             | `{ diagram }`                 |
|                                                                                                   | `failed`             | `{ kind, message, version? }` |
|                                                                                                   | `selected`           | `{ selection }`               |
|                                                                                                   | `walkthroughChanged` | `{ steps, path }`             |
|                                                                                                   | `pathResolved`       | the resolved path             |

## Demos

In the repository:

- **Plain HTML:** `pnpm --filter @ariadne/viewer build`, then serve `packages/viewer/dist` with any static server and
  open `/demo/` (the page fetches the sample saga, which `file://` does not allow).
- **Angular:** `pnpm --filter @ariadne/viewer-demo start` ([apps/viewer-demo](../../apps/viewer-demo)).

## License

MIT
