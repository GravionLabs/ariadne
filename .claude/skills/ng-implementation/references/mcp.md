# Angular CLI MCP Server

Run with `npx -y @angular/cli mcp`. Gives the assistant docs search, best-practice guides and project tooling.

## Setup

Add to the client's MCP config (`.vscode/mcp.json` uses `servers`; Cursor `.cursor/mcp.json`, Gemini `.gemini/settings.json` and others use `mcpServers`):

```json
{
  "mcpServers": {
    "angular-cli": { "command": "npx", "args": ["-y", "@angular/cli", "mcp"] }
  }
}
```

If the file exists, merge — do not overwrite other servers.

## Default tools

| Tool | Use |
|---|---|
| `search_documentation` | Search angular.dev |
| `find_examples` | Best-practice examples for modern features |
| `get_best_practices` | Angular Best Practices Guide |
| `list_projects` | Apps and libraries from `angular.json` |
| `onpush_zoneless_migration` | Plan for migrating to OnPush (prerequisite for zoneless) |
| `ai_tutor` | Interactive tutor |

## Experimental tools (enable with `-E <name>`)

`build`, `test`, `e2e`, `modernize`, `devserver.start`, `devserver.stop`, `devserver.wait_for_build`

## Options

- `--read-only` — only tools that do not modify the project
- `--local-only` — only tools that work offline
- `-E <tool>` — enable an experimental tool, e.g. `"args": ["-y", "@angular/cli", "mcp", "--read-only", "-E", "build"]`
