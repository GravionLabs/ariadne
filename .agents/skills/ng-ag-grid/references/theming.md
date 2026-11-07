# AG Grid — Theming & Layout

## Themes

Built-in: Quartz (recommended for new projects), Alpine, Balham, Material. Two mechanisms, depending on AG Grid version — check `npm ls ag-grid-community` first:

- **CSS class** (legacy): `class="ag-theme-quartz"` on `<ag-grid-angular>` plus the theme CSS (`"styles": ["ag-grid-community/styles/ag-theme-quartz.css"]`). On newer versions set `theme: 'legacy'` in grid options / `provideGlobalGridOptions`.
- **Theming API** (newer): the `theme` grid option with a theme object.

Customize via CSS variables on the theme class: `--ag-foreground-color`, `--ag-background-color`, `--ag-header-background-color`, `--ag-row-hover-color`, `--ag-selected-row-background-color`, `--ag-font-size`, `--ag-grid-size` (scales row height and padding).

## App-wide defaults (call once in main.ts)

```typescript
provideGlobalGridOptions({ defaultColDef: { filter: true }, rowSelection: { mode: 'multiRow' } });
```

## `domLayout`

| Value                | Behavior                                                                            |
| -------------------- | ----------------------------------------------------------------------------------- |
| `'normal'` (default) | Needs explicit CSS height (`style="height: 400px"`); scrolls internally             |
| `'autoHeight'`       | Grows with data; **never for > 1 000 rows** (renders all rows, freezes the browser) |
| `'print'`            | All rows, no scrollbars; printing/PDF only                                          |

## Row height

`rowHeight`, `headerHeight`, `groupHeaderHeight`; dynamic `getRowHeight: (p: RowHeightParams) => …` (impacts performance) — call `api.resetRowHeights()` after changing it dynamically.

To fill a container: `host: { style: 'display: block; height: 100%' }` on the component and `style="height: 100%"` on the grid.
