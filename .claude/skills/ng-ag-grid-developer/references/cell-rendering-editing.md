# AG Grid — Cell Rendering & Editing (Angular)

## Renderers

- Simple, stateless: `cellRenderer: (p: ICellRendererParams) => '<span class="badge">…</span>'` (returns HTML string)
- Stateful/interactive: implement `ICellRendererAngularComp` in a standalone component

```typescript
export class StatusCellRenderer implements ICellRendererAngularComp {
  agInit(params: ICellRendererParams): void { /* read params.value, params.data */ }
  refresh(params: ICellRendererParams): boolean { /* update state */ return true; } // false → grid recreates the component
}
// ColDef: { field: 'status', cellRenderer: StatusCellRenderer, cellRendererParams: { currency: 'EUR' } }
```
Custom params arrive on `params` in `agInit` (type them by extending `ICellRendererParams`).

Per-row choice: `cellRendererSelector: p => p.node.group ? undefined : { component: X, params: {...} }` — return `undefined` for default rendering; skip group nodes.

Provided renderers: `agGroupCellRenderer` (expand/collapse for groups and master/detail), `agAnimateShowChangeCellRenderer`, `agAnimateSlideCellRenderer`, `agCheckboxCellRenderer`.

## Editing

`editable: true` or callback `editable: (p: EditableCallbackParams) => p.data.status === 'draft'`.

| Editor | Value | Notes |
|---|---|---|
| Text (default) / Large text | `agTextCellEditor` / `agLargeTextCellEditor` | |
| Select / Rich select | `agSelectCellEditor` / `agRichSelectCellEditor` | Rich select: Enterprise, `cellEditorParams: { values, searchType: 'fuzzy' }` |
| Number / Date / Checkbox | `agNumberCellEditor` / `agDateCellEditor` / `agCheckboxCellEditor` | |

Custom editor: implement `ICellEditorAngularComp` with `agInit(params: ICellEditorParams)`, `getValue()` (final value) and optional `isPopup()`; use as `cellEditor: MyEditor`. Per-row: `cellEditorSelector: p => ({ component: 'agRichSelectCellEditor', params: { values: p.data.options } })`.

Events: `(cellValueChanged)` — persist `event.data`; `(cellEditingStarted)`, `(cellEditingStopped)` — check `event.valueChanged`.

Programmatic: `api.startEditingCell({ rowIndex, colKey })`, `api.stopEditing(false)` commit, `api.stopEditing(true)` cancel.
