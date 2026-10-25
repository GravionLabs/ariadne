```typescript
import { ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';

server.registerResource(
  'name',
  new ResourceTemplate('resource://{id}', { list: undefined }),
  { title: 'Title', description: '...' },
  async (uri, { id }) => ({
    contents: [{ uri: uri.href, text: await fetchData(id) }]
  })
);

server.registerPrompt(
  'prompt-name',
  { title: 'Title', description: '...', argsSchema: { topic: z.string() } },
  ({ topic }) => ({
    messages: [{ role: 'user', content: { type: 'text', text: `About: ${topic}` } }]
  })
);
```
