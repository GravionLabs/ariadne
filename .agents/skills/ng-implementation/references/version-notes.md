# Version-sensitive Angular APIs

<!-- Derived from Google's Angular skill. Copyright 2026 Google LLC, MIT License. -->

Non-obvious or experimental APIs. For anything else, use the Angular MCP server or angular.dev.

## `linkedSignal` vs `computed` vs `effect`

- `computed`: strictly derived, read-only
- `linkedSignal`: derived default, but user can `.set()` it; resets when the source changes
- Never use `effect` to copy one state into another — use `computed` or `linkedSignal`
- Keep a still-valid selection on source change: `linkedSignal({ source, computation: (next, previous) => ... })`

## `resource` (experimental)

- `resource({ params: () => ({...}), loader: async ({ params, abortSignal }) => ... })` — the option is `params`, not `request`
- Always pass `abortSignal` to `fetch`
- Signals: `value()`, `hasValue()`, `isLoading()`, `error()`, `status()` (`idle|loading|resolved|error|reloading|local`); `.reload()` re-runs; `value.set()` makes status `local`
- With `HttpClient` (and interceptors) prefer `httpResource`

## Signal Forms (opt-in, `@angular/forms/signals`)

- Never import `FormControl`/`FormGroup`/`FormBuilder` alongside it; there is no builder
- Initial values must not be `null`/`undefined` (`''`, `0`)
- A field is a function: call it for state — `form.field().valid()`, `form().invalid()`. Exception: `form.items.length` (no parentheses)
- Rule callbacks take a context: `({ value }) => ...`, `({ state }) => state.touched()`; `applyWhen(path, condition, schemaFn)` needs 3 args; `applyEach(path, (item) => ...)` takes one
- No `[value]`, `min`, `max`, `readonly` attributes with `[formField]` — use `min()`, `max()`, `readonly()` rules
- `submit(form, async () => ...)` — the callback must be async
- `validateAsync` requires `onError`; its `params` is `({ value }) => value()`
- Checkboxes bind to `boolean` only; there is no `FormState` — use `FieldState`
- Nested `@for`: no `$parent.$index`, use `let outerIndex = $index`

## Angular Aria (`@angular/aria`)

- Install first: `npm install @angular/aria`
- Headless: you supply HTML and CSS; style via `[aria-expanded]`, `[aria-selected]`, `[aria-disabled]`, `[aria-current="page"]`
- Entry points: `@angular/aria/accordion|listbox|combobox|menu|tabs|toolbar|tree` (Grid also supported)
- Use the `ng*` directives instead of native `<select>` for these patterns
- Lazy-render heavy panels with `ngAccordionContent` / `ngTabContent` inside `ng-template`

## Functional route guards

- `CanActivateFn`, `CanActivateChildFn`, `CanDeactivateFn`, `CanMatchFn`; use `inject()` inside
- Return `boolean`, `UrlTree` or `RedirectCommand` (or Observable/Promise of those); `canMatch: false` lets the router try other routes
- Client guards are not security — verify on the server

## Testing (Vitest, v21+)

- `ng new` configures Vitest; Jest is for v20 and earlier
- Standalone component: `TestBed.configureTestingModule({ imports: [MyComponent] })`
- Signal effects need `TestBed.flushEffects()`; code that calls `inject()` needs `TestBed.runInInjectionContext`
