# AG Grid — Excel Export (Enterprise)

Module: `ExcelExportModule`. `api.exportDataAsExcel()` mirrors current grid state (sort, filter, grouping, visible columns).

```typescript
api.exportDataAsExcel({
  fileName: 'my-report.xlsx',
  sheetName: 'Data',
  columnKeys: ['name', 'price'], // only these columns
  onlySelected: false,
  shouldRowBeSkipped: (p) => p.node.data?.status === 'archived',
  columnWidth: (p) => (p.column?.getId() === 'name' ? 200 : 100),
  prependContent: [[{ data: { value: 'Report Title', type: 'String' }, mergeAcross: 3 }]],
  appendContent: [[{ data: { value: 'End of Report', type: 'String' } }]],
});
```

## Styles

Define `gridOptions.excelStyles: ExcelStyle[]` (`{ id: 'highlight', interior: { color: '#FFFF00', pattern: 'Solid' }, font: { bold: true } }`) and reference the `id` from `ColDef.cellClass` — styles are not exported otherwise.

## Multiple sheets

```typescript
const s1 = api.getSheetDataForExcel({ sheetName: 'Summary' });
const s2 = otherApi.getSheetDataForExcel({ sheetName: 'Detail' });
if (s1 && s2) {
  const data = getMultipleSheetsAsExcel({ data: [s1, s2] }); /* Blob + <a download> */
}
```

## Gotchas

- Cell renderer output is **not** exported — raw values or `valueFormatter` output are; use `valueFormatter` for formatted export values
