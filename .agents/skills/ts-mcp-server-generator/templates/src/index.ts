import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const server = new McpServer({ name: 'my-mcp-server', version: '1.0.0' });

server.registerTool(
  'example-tool',
  {
    title: 'Example Tool',
    description: 'An example tool — replace with your implementation',
    inputSchema: { message: z.string().describe('Input message') },
  },
  async ({ message }) => {
    return { content: [{ type: 'text', text: `Echo: ${message}` }] };
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
