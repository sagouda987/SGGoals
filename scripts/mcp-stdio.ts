import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { config } from 'dotenv';
import path from 'node:path';
import { createSgGoalsMcpServer } from '../lib/mcp/server';
import { HttpSgGoalsMcpDataSource, SgGoalsMcpService } from '../lib/mcp/service';

const projectRoot = path.resolve(__dirname, '..');

config({ path: path.join(projectRoot, '.env.local') });
config({ path: path.join(projectRoot, '.env') });

const dataUrl = process.env.SG_GOALS_MCP_DATA_URL?.trim() || 'https://sg-goals.vercel.app';
const server = createSgGoalsMcpServer(new SgGoalsMcpService(new HttpSgGoalsMcpDataSource(dataUrl)));
const transport = new StdioServerTransport();

async function main() {
  await server.connect(transport);
}

async function shutdown() {
  await transport.close();
  await server.close();
  process.exit(0);
}

process.on('SIGINT', () => { void shutdown(); });
process.on('SIGTERM', () => { void shutdown(); });

void main().catch((error) => {
  console.error('SG Goals MCP stdio server failed to start.', error);
  process.exit(1);
});
