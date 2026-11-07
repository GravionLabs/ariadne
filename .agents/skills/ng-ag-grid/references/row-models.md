# AG Grid — Row Models

| Model                    | Use when                                                               | Module                     |
| ------------------------ | ---------------------------------------------------------------------- | -------------------------- |
| Client-side (default)    | Data fits in browser (< ~100k rows); full sort/filter/group/pivot/tree | `ClientSideRowModelModule` |
| Server-side (Enterprise) | Large data, server-side grouping/pivoting, lazy loading                | `ServerSideRowModelModule` |
| Viewport (Enterprise)    | Real-time views of visible rows only; implement `IViewportDatasource`  | `ViewportRowModelModule`   |

For large or server-backed data prefer SSRM over the Infinite Row Model.

## Client-side updates

```typescript
api.setGridOption('rowData', newRows); // replace all
api.applyTransaction({ add: [], update: [], remove: [] }); // partial (needs getRowId)
```

## SSRM

`rowModelType` is an `[Initial]` option — changing it requires destroying and re-creating the grid.

```typescript
gridOptions: GridOptions = { rowModelType: 'serverSide', serverSideInitialRowCount: 100 };

class MyDatasource implements IServerSideDatasource {
  getRows(params: IServerSideGetRowsParams): void {
    const { startRow, endRow, sortModel, filterModel } = params.request;
    api.getRows({ startRow, endRow, sortModel, filterModel }).subscribe({
      next: (r) => params.success({ rowData: r.rows, rowCount: r.total }),
      error: () => params.fail(),
    });
  }
}
// after gridReady:
api.setGridOption('serverSideDatasource', new MyDatasource());
```

Server-side grouping/pivoting: `params.request` also carries `rowGroupCols`, `groupKeys`, `pivotCols`; the server applies them. Set `serverSideEnableClientSideSort: false` to let the server sort.
