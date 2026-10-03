# ADR 0004: App state in NgRx SignalStore

- Status: accepted
- Date: 2026-10-03
- Issues: #68, #69, #70, #71, #74, #76
- Builds on: [ADR 0001](0001-flow-editor-foundations.md) (decision 1: the app owns the state in `DiagramStore`)

## Context

App state was three hand-rolled signal classes:

- `DiagramStore` held the immutable `Diagram`, `computed` selectors, one method per edit and an undo/redo
  stack (`_past` / `_future`, 100 entries).
- `Editor` held the UI state in plain fields and private signals: the selection, and the pending
  "fit" / "select after layout" work.
- `DiagramDocument` held the file ref, the last saved diagram (for `dirty`), `error` and `notice`.

That works, but each class invented its own structure, the undo logic could not be reused, and other
components could not read the selection without inputs and outputs. The importer/generator, the Tauri
shell (#36), several open diagrams and the VS Code embedded mode (#178: the host pushes diagrams in, the
webview's own history is off) all add state, so a standard shape pays off.

## Options

### 1. Keep the hand-rolled stores

No dependency, no migration. But the undo/redo stack stays welded into `DiagramStore`, and the next
store (events panel, tabs) would be a fourth style.

### 2. NgRx SignalStore (`@ngrx/signals`)

Standard `withState` / `withComputed` / `withMethods`, state changes only through `patchState`, and
`signalStoreFeature` for reusable parts. Private members (`_name`) are hidden from the store's public
type. It is built on Angular signals, so it fits the current code. Added to the initial bundle:
**+2.4 kB raw, +1.1 kB transferred** (899.78 → 902.20 kB, measured with all four stores migrated).

### 3. f-flow's own `FFlowState` (`provideFFlow(withFlowState())`)

f-flow can own nodes, connections and undo/redo itself. ADR 0001 chose the opposite on purpose: the
file format and the model must not depend on the canvas. Its records are f-flow's (positions, ports),
not our `Diagram` (the layout computes positions; the model has none). It would also cover only the
diagram, not the editor or the document. Rejected.

## Decision

1. **Adopt `@ngrx/signals`** and migrate incrementally. Each store keeps its public API, so components
   and specs change only where noted below.
2. **Three stores, one per concern:**
   - `DiagramStore` (root): `{ diagram }` + undo/redo. `nodes`, `edges`, `direction` stay as
     `computed`. The pure edit functions (append, insert on edge, bridge on remove, `withoutUndefined`)
     moved to `model/diagram-edits.ts` and are tested without a store.
   - `EditorStore` (provided by `Editor`, so one per editor): the selection, the derived `selectedNode`
     / `selectedEdge` / `hasSelection` / `inspectorOpen`, and the pending fit / select. `Inspector`
     reads the selection from it and no longer takes it as inputs.
   - `DiagramDocument` (root): `{ file, saved, error, notice }` with `name` and `dirty` computed.
3. **Undo/redo is our own `withUndoRedo(key, { limit })` feature** (`model/with-undo-redo.ts`), not the
   one in `@angular-architects/ngrx-toolkit`. Why:
   - One edit must be one undo step, however many `patchState` calls it makes. The toolkit records a
     step per state change (`watchState`) and skips changes whose JSON equals the last one, so
     grouping is not up to us. Ours records a step per `_commit(change)`, which is what the store
     methods call.
   - `load()` must reset the history and `replace()` (source text edited) must be one step. We call
     `_resetHistory()` and `_commit()` explicitly.
   - In `@angular-architects/ngrx-toolkit` 22.0.0 the stacks live in the feature's closure, not in the
     store, so they are shared by every instance of a store (several open diagrams, tests). The
     `maxStackSize` check compares the redo stack and calls `unshift()` without an argument, so the
     history limit appears not to be enforced. It also serializes the tracked state to JSON on every
     change.
   - It is about 70 lines with its own spec, and the toolkit is another dependency to keep in step with
     Angular and NgRx majors.
4. **Nodes and edges stay plain arrays inside `Diagram`; no `withEntities`.** The file format guarantees
   that nodes, edges and activities keep their order, and the writer serializes the whole `Diagram`
   (`docs/specs/diagram-format.md`, "Determinism"). `withEntities` keeps an id list plus a map, so
   order would have to be kept in sync with the diagram on every edit and rebuilt on save. Lookups by id
   are over small arrays (tens of nodes). Revisit if diagrams grow into the thousands.
5. **Async document actions stay plain `async` methods.** `FileStorage` is promise-based and each action
   is one call that the UI awaits (`open()` returns whether the user picked a file). `rxMethod` would add
   RxJS plumbing and lose the return value. Errors are caught in one place and land in `error`.
6. **`error` and `notice` are state with `setError` / `setNotice`.** They were public writable signals
   (`error.set(...)`); a store exposes read-only signals, so the call sites in the export service, the
   source sync, the editor template and one spec call the methods instead.
7. **Bundle budget: the initial warning moves from 900 kB to 920 kB.** The app was 0.2 kB under the old
   limit, so any dependency crossed it. The error limit (1 MB) stays.

## Consequences

- The same three public stores as before, in one style. A new store (events panel, tabs) copies the
  shape instead of inventing one.
- `withUndoRedo` is reusable for any immutable slice, and the VS Code embedded mode can leave it out or
  drive `load()` / `replace()` from the host.
- Selection no longer travels through inputs and outputs; the inspector, a toolbox or an events panel
  read it from `EditorStore`.
- One more runtime dependency (`@ngrx/signals`, 2.4 kB in the bundle) and its major version follows
  Angular's.
- Underscore members of a feature (`_past`, `_future`, `_commit`) are private to the store but not
  visible in the types of later features in the same `signalStore`. `withUndoRedo` therefore reads them
  through a cast; its spec covers this.
- `EditorStore` reads the diagram through `DiagramStore`, so it needs the root store; its spec provides
  both.
- The pending fit / select work is store state, but the editor's layout effect reads it with
  `untracked`: requesting it must not re-run the effect, only a relayout does.
