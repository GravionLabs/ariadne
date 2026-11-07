# AG Grid Enterprise — Setup & Modules

## Install

`ag-grid-angular` and `ag-grid-enterprise` must be the same version (`npm ls ag-grid-angular ag-grid-enterprise`).

## Registration (main.ts or app.config.ts, before any grid renders)

```typescript
import { ModuleRegistry } from 'ag-grid-community';
import { AllEnterpriseModule, LicenseManager } from 'ag-grid-enterprise';

LicenseManager.setLicenseKey('YOUR_LICENSE_KEY'); // BEFORE registerModules
ModuleRegistry.registerModules([AllEnterpriseModule]);
```

Without a key the grid works but shows a watermark and console warning.

## Bundles vs cherry-picking

- `AllCommunityModule` — all Community features; `AllEnterpriseModule` — Community + all Enterprise (includes `ValidationModule`)
- Production: cherry-pick modules to cut bundle size. Always include `ClientSideRowModelModule` (or `ServerSideRowModelModule`) explicitly.
- Register `ValidationModule` only outside production (`process.env['NODE_ENV'] !== 'production'`)
- Charts: `AllEnterpriseModule.with(AgChartsEnterpriseModule)` (from `ag-charts-enterprise`)
- Check a module at runtime: `api.isModuleRegistered('SetFilterModule')`

| Module                                                       | Feature                                 |
| ------------------------------------------------------------ | --------------------------------------- |
| `RowGroupingModule`                                          | Row grouping & aggregation              |
| `PivotModule`                                                | Pivoting                                |
| `ExcelExportModule`                                          | Excel export                            |
| `MasterDetailModule`                                         | Master/Detail                           |
| `SetFilterModule` / `MultiFilterModule`                      | Set / Multi filter                      |
| `AdvancedFilterModule`                                       | Advanced Filter bar                     |
| `ColumnsToolPanelModule` / `FiltersToolPanelModule`          | Side panels                             |
| `ServerSideRowModelModule`                                   | SSRM                                    |
| `ClipboardModule`, `RangeSelectionModule`, `StatusBarModule` | Copy/paste, range selection, status bar |

## Per-grid modules

Pass `[modules]="modules"` on `<ag-grid-angular>` (type `Module[]`) when grids need different feature sets.

## Component

```typescript
@Component({
  standalone: true,
  imports: [AgGridAngular],
  template: `<ag-grid-angular style="height: 500px" [rowData]="rowData" [columnDefs]="columnDefs" [defaultColDef]="defaultColDef" />`,
})
```

## AG Grid MCP server (`ag-mcp`)

`npx ag-mcp` gives the assistant version-specific AG Grid docs, examples and API refs. Node 22 LTS; no install, no `devDependencies` entry (npx fetches the latest CLI).

Client config files and the server block: the MCP reference of `ng-implementation` (skill name, not a path). Command: `npx ag-mcp`.

Restart the client, then verify: VS Code chat `@ag-mcp`; Claude Code `claude mcp list`. Prompts: `/ag-mcp:quick-start` (scaffold a grid), `/ag-mcp:upgrade-grid` (migration plan); tool `search_docs`.

- The server auto-detects the AG Grid version from `package.json`; in monorepos call the `set_version` tool if it picks the wrong package.
