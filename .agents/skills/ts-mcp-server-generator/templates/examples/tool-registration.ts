```typescript
server.registerTool(
  'tool-name',
  {
    title: 'Human-Readable Title',
    description: 'What this tool does',
    inputSchema: { param: z.string().describe('Parameter description') },
  },
  async ({ param }) => {
    try {
      return { content: [{ type: 'text', text: await doWork(param) }] };
    } catch (err) {
      return { isError: true, content: [{ type: 'text', text: `Error: ${err}` }] };
    }
  }
);
```
