# Angular CLI MCP Server

Run with `npx -y @angular/cli mcp`. Gives the assistant docs search, best-practice guides and project tooling.

## Setup

Add the server block to the client's MCP config. If the file exists, merge: never overwrite other servers.

```json
{
  "mcpServers": {
    "angular-cli": { "command": "npx", "args": ["-y", "@angular/cli", "mcp"] }
  }
}
```

## Client config files

One table for every MCP server of this package (Angular CLI above, `ag-mcp` below).

| Client            | File                        | Root key                          |
| ----------------- | --------------------------- | --------------------------------- |
| VS Code + Copilot | `.vscode/mcp.json`          | `servers` (add `"type": "stdio"`) |
| Claude Code       | `.mcp.json` in project root | `mcpServers`                      |
| Cursor            | `.cursor/mcp.json`          | `mcpServers`                      |
| Gemini            | `.gemini/settings.json`     | `mcpServers`                      |

## AG Grid server (`ag-mcp`)

Block for the same files, with the root key of the table: `{ "mcpServers": { "ag-mcp": { "command": "npx", "args": ["ag-mcp"] } } }`. Usage and prompts: skill `ng-ag-grid`.

## Default tools

| Tool                        | Use                                                      |
| --------------------------- | -------------------------------------------------------- |
| `search_documentation`      | Search angular.dev                                       |
| `find_examples`             | Best-practice examples for modern features               |
| `get_best_practices`        | Angular Best Practices Guide                             |
| `list_projects`             | Apps and libraries from `angular.json`                   |
| `onpush_zoneless_migration` | Plan for migrating to OnPush (prerequisite for zoneless) |
| `ai_tutor`                  | Interactive tutor                                        |

## Experimental tools (enable with `-E <name>`)

`build`, `test`, `e2e`, `modernize`, `devserver.start`, `devserver.stop`, `devserver.wait_for_build`

## Options

- `--read-only` — only tools that do not modify the project
- `--local-only` — only tools that work offline
- `-E <tool>` — enable an experimental tool, e.g. `"args": ["-y", "@angular/cli", "mcp", "--read-only", "-E", "build"]`
