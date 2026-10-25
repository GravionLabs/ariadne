# AG Grid — Master / Detail (Enterprise)

Module: `MasterDetailModule`. Master grid uses the client-side or server-side row model; the detail grid can use any (incl. its own SSRM datasource). `masterDetail` is an `[Initial]` option.

```typescript
columnDefs: ColDef<Account>[] = [
  { field: 'name', cellRenderer: 'agGroupCellRenderer' },   // expand/collapse control
  { field: 'accountId' },
];
detailCellRendererParams: IDetailCellRendererParams<Account, CallRecord> = {
  detailGridOptions: { columnDefs: [{ field: 'callId' }, { field: 'duration' }], defaultColDef: { flex: 1 } },
  getDetailRowData: p => p.successCallback(p.data.callRecords),
};
// template: [masterDetail]="true" [detailCellRendererParams]="detailCellRendererParams"
```

## Options

| Option | Effect |
|---|---|
| `isRowMaster: (data) => data.callRecords?.length > 0` | Only some rows expandable |
| `detailRowHeight: 300` | Fixed detail height |
| `detailRowAutoHeight: true` | Fit content (`[Initial]`) |
| `keepDetailRows: true`, `keepDetailRowsCount: 5` | Keep collapsed detail grids in memory (default: destroyed on collapse) |
| `detailCellRenderer: MyComponent` | Replace the detail grid with an Angular component implementing `IDetailCellRenderer` (`agInit(params)`, `refresh(): false` recreates) |

Detail API: `api.getRowNode(id)?.detailNode?.detailGridInfo?.api`.
