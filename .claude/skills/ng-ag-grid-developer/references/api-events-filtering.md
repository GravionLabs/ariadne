# AG Grid — Grid API & Events

## Getting the API

Prefer `(gridReady)="onGridReady($event)"` and store `event.api` (`GridApi`). Alternative: `@ViewChild('myGrid') grid!: AgGridAngular` then `this.grid.api` (less reliable in lifecycle hooks).

## Updating options

```typescript
api.setGridOption('rowData', newData);
api.updateGridOptions({ rowData: newData, defaultColDef: { flex: 2 } }); // atomic
```
Options marked `[Initial]` (e.g. `rowModelType`, `treeData`, `masterDetail`) cannot be updated — re-create the grid.

## Events

Bind on `<ag-grid-angular>`: `(cellValueChanged)`, `(selectionChanged)`, `(rowDataUpdated)`, `(sortChanged)`, `(filterChanged)`, `(firstDataRendered)`. Handlers get typed events, e.g. `CellValueChangedEvent<T>` with `colDef`, `oldValue`, `newValue`; `SelectionChangedEvent` → `event.api.getSelectedRows()`.

## Refresh, selection, scrolling

| Task | Call |
|---|---|
| Re-render cells / re-run valueGetters | `api.refreshCells({ rowNodes: [node], force: true })` |
| Rebuild row DOM (sparingly) | `api.redrawRows({ rowNodes: [node] })` |
| Selected rows / nodes (nodes for SSRM) | `api.getSelectedRows()` / `api.getSelectedNodes()` |
| Select / clear | `api.selectAll()` / `api.deselectAll()` |
| Scroll | `api.ensureIndexVisible(50, 'middle')`, `api.ensureColumnVisible('price')` |
| Sort | `api.applyColumnState({ state: [{ colId: 'price', sort: 'desc' }], defaultState: { sort: null } })` |

# Filtering

## Column filters (`ColDef.filter`)

| Value | Edition |
|---|---|
| `'agTextColumnFilter'`, `'agNumberColumnFilter'`, `'agDateColumnFilter'` | Community |
| `'agSetColumnFilter'`, `'agMultiColumnFilter'` | Enterprise (`SetFilterModule`, `MultiFilterModule`) |

`filterParams: { filterOptions: ['greaterThan', 'lessThan', 'inRange'], defaultOption: 'greaterThan' }`

## Quick filter

`api.setGridOption('quickFilterText', value)` from a search input.

## External filter

```typescript
gridOptions: GridOptions = {
  isExternalFilterPresent: () => this.activeCategory !== 'All',
  doesExternalFilterPass: (node) => node.data.category === this.activeCategory,
};
// after changing external state:
this.#api.onFilterChanged();
```

## Advanced filter (Enterprise, `AdvancedFilterModule`)

`enableAdvancedFilter: true`; programmatic: `api.setAdvancedFilterModel({ filterType: 'join', type: 'AND', conditions: [{ filterType: 'text', colId: 'name', type: 'contains', filter: 'AG' }] })`, `null` clears.

## Filter model API

`api.setFilterModel({ price: { filterType: 'number', type: 'inRange', filter: 100, filterTo: 500 } })`, `api.getFilterModel()`, `api.setFilterModel(null)` clears.
