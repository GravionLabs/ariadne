# AG Grid — Column Definitions & Generics

Type everything with the row type: `GridOptions<T>`, `ColDef<T>`, `ColGroupDef<T>` — `field` is then checked against `T`, and `p.data` is `T | undefined`.

```typescript
const columnDefs: (ColDef<Product> | ColGroupDef<Product>)[] = [
  { headerName: 'Info', children: [{ field: 'name' }, { field: 'category', filter: 'agSetColumnFilter' }] }, // Set filter: Enterprise
  { field: 'price', type: 'currency', pinned: 'right' },
];
const defaultColDef: ColDef = { flex: 1, minWidth: 100, filter: true };
```

## Column types (reusable presets)

```typescript
const columnTypes: Record<string, ColTypeDef> = {
  currency: { filter: 'agNumberColumnFilter', valueFormatter: p => p.value != null ? `€${p.value.toFixed(2)}` : '' },
};
```
Bind with `[columnTypes]` and `type: 'currency'` on the ColDef.

## Value hooks

| Hook | Purpose |
|---|---|
| `valueGetter` | Computed value, not stored in data |
| `valueFormatter` | Display only |
| `valueParser` | Parse user input to a typed value |
| `valueSetter` | Write edit back to data — required when `valueGetter` is used; return `true` if changed |

`cellDataType`: `'text' | 'number' | 'boolean' | 'date' | 'dateString' | 'object'` (inferred automatically; override when needed). `pinned: 'left' | 'right'`.

## Updating columns at runtime

```typescript
api.setGridOption('columnDefs', newColDefs);
api.applyColumnState({ state: [{ colId: 'price', sort: 'desc', hide: false }], applyOrder: true });
```

## Typed events and row identity

```typescript
onGridReady(e: GridReadyEvent<Product>) { this.#api = e.api; }
onCellValueChanged(e: CellValueChangedEvent<Product>) { this.#service.save(e.data); }
getRowId = (p: GetRowIdParams<Product>) => String(p.data.id);
```
`getRowId` is required for `applyTransaction`, SSRM row refresh and selection that survives data updates.

`@ViewChild('grid') grid!: AgGridAngular<Product>` gives a typed `grid.api`.

Custom renderer params: extend `ICellRendererParams<T>` and pass `cellRendererParams: {...} satisfies Partial<MyParams>`.
