---
name: ts-mcp-server-generator
description: 'Generate MCP server in TypeScript with tools, resources, prompts. @modelcontextprotocol/sdk + zod.'
disable-model-invocation: true
metadata:
  opencode/autoinvoke: 'false'
---

Generate an MCP server in TypeScript. Paths to `scripts/` and `templates/` are relative to this skill's directory.

## Stack
- `@modelcontextprotocol/sdk` — McpServer, transports
- `zod` — schema validation
- Node.js 22 LTS, `tsx` for dev

## Steps

### Phase 1 — Scaffold

```powershell
pwsh scripts/New-McpServer.ps1 -ServerName my-mcp-server
```

The script copies `templates/package.json`, `templates/tsconfig.json` and `templates/src/index.ts`, then installs dependencies.

### Phase 2 — Implement

See `templates/examples/tool-registration.ts` for tool pattern.
See `templates/examples/resource-prompt-registration.ts` for resources + prompts.

### Phase 3 — Configure & Test

See `templates/examples/transport-config.ts` for transport + env validation.

Test with MCP Inspector:
```powershell
npx @modelcontextprotocol/inspector node dist/index.js
```

## Conventions

- Always provide `title` for tools/resources/prompts
- Return `isError: true` on failure — never throw
- Import from specific SDK paths: `@modelcontextprotocol/sdk/server/mcp.js`
- ESM only: `"type": "module"` in package.json

## Gotchas

- Don't throw from tool handlers — return `isError: true`
- MCP Inspector works only with stdio (HTTP needs external client)
- Resource URIs must be valid
- Env validation before server start, not in tools
