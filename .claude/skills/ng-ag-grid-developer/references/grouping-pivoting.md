# AG Grid — Row Grouping & Pivoting (Enterprise)

Modules: `RowGroupingModule` (grouping), `PivotModule` + `RowGroupingModule` (pivot), `RowGroupingPanelModule` (group panel), `ColumnsToolPanelModule` (side bar).

## Grouping

```typescript
columnDefs: ColDef[] = [
  { field: 'country', rowGroup: true, hide: true },   // hide: shown in the group column instead
  { field: 'athlete' },
  { field: 'gold', aggFunc: 'sum' },
];
gridOptions: GridOptions = { groupDisplayType: 'singleColumn', groupDefaultExpanded: 1 };
```

- `aggFunc`: `'sum' | 'min' | 'max' | 'count' | 'avg' | 'first' | 'last'`, or a custom name defined in `gridOptions.aggFuncs: { name: (p: IAggFuncParams) => … }`
- `groupDisplayType`: `'singleColumn'` (default) · `'multipleColumns'` · `'groupRows'` · `'custom'` (you supply group columns)
- `autoGroupColumnDef: { headerName, minWidth, cellRendererParams: { suppressCount, checkbox } }` customizes the generated group column
- `groupDefaultExpanded: -1` expands all levels; `rowGroupPanelShow: 'always' | 'onlyWhenGrouping' | 'never'` shows the drag-to-group panel
- Programmatic: `api.expandAll()`, `api.collapseAll()`, `api.getRowNode(id)?.setExpanded(true)`

## Pivoting

Needs all of: `pivotMode: true`, ≥1 column `rowGroup: true`, ≥1 column with `aggFunc`, ≥1 column `pivot: true`. **Every value column needs an `aggFunc`** — pivot mode only shows aggregated rows.

```typescript
columnDefs: ColDef[] = [
  { field: 'country', rowGroup: true, hide: true },
  { field: 'sport', pivot: true, enablePivot: true },  // enablePivot lets users pivot via UI
  { field: 'gold', aggFunc: 'sum' },
];
// template: [pivotMode]="true" [sideBar]="'columns'"
```

- `pivotMode: true` with no `pivot` column strips non-group/value columns and produces no pivot labels
- UI control: `sideBar: 'columns'` (users drag into Row Groups / Values / Labels) or `pivotPanelShow: 'always' | 'onlyWhenPivoting' | 'never'`
- Runtime: `api.setGridOption('pivotMode', true)`, `api.applyColumnState({ state: [{ colId: 'sport', pivot: true }] })`, `api.getPivotResultColumns()`
- With SSRM the server gets `pivotCols`, `pivotMode`, `rowGroupCols`, `valueCols` in `params.request` and must compute the pivot result and its columns
