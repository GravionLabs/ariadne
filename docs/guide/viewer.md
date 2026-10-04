# Show a saga in your own app

The editor is for drawing. To **show** a saga in an admin tool or in documentation, embed it with the viewer,
`@ariadne/viewer`: a read-only `<ariadne-saga>` element that loads a `.saga.yaml` from your API or repository.

```html
<ariadne-saga src="/api/sagas/order.saga.yaml" features="walkthrough messages"></ariadne-saga>
```

It zooms and pans, can step through the saga (**Walkthrough**), list its commands and events (**Messages**), mark
problems (**Problems**), and draw **the path a saga instance took** from the history your app already has:

```js
saga.path = [{ event: 'OrderSubmitted' }, { event: 'StockReserved' }];
```

Your app hears about what the user picks and about the path (`select`, `walkthrough`, `pathresolved`), and can pick
out states from outside, for example the one a running instance is in. Angular apps use `AriadneSagaComponent`, which
loads the file with their own `HttpClient`.

Everything is in the package's [README](../../packages/viewer/README.md): install, the element and the Angular
wrapper, theming with CSS custom properties, events and outputs.

## Try it

- A plain HTML page: run `pnpm --filter @ariadne/viewer build`, serve `packages/viewer/dist` with any static server and
  open `/demo/`.
- An Angular app: `pnpm --filter @ariadne/viewer-demo start` ([apps/viewer-demo](../../apps/viewer-demo)).
- In the editor, **Path** shows the same view for a path you paste (a JSON or YAML list of the events), to try it or to
  attach a trace to a review.

The viewer reads files in format version 3 and older, like the editor, and shows an error naming a newer version.
