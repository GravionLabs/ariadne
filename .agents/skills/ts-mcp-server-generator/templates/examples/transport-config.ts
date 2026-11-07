```typescript
// stdio (local/CLI)
await server.connect(new StdioServerTransport());

// HTTP (remote) — use StreamableHTTPServerTransport with Express
// Expose POST /mcp endpoint

// Validate env vars at startup
const env = z.object({ API_KEY: z.string() }).parse(process.env);
```
