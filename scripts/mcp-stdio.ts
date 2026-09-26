import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { config } from 'dotenv';
import path from 'node:path';
import { createSgGoalsMcpServer } from '../lib/mcp/server';
import { HttpSgGoalsMcpDataSource, SgGoalsMcpService } from '../lib/mcp/service';
import { recordConnection } from '../lib/mcp/connection-store';

const projectRoot = path.resolve(__dirname, '..');

config({ path: path.join(projectRoot, '.env.local') });
config({ path: path.join(projectRoot, '.env') });

const dataUrl = process.env.SG_GOALS_MCP_DATA_URL?.trim() || 'https://sg-goals.vercel.app';
const server = createSgGoalsMcpServer(new SgGoalsMcpService(new HttpSgGoalsMcpDataSource(dataUrl)), async (ok) => {
  await recordConnection(ok
    ? { lastSuccessfulReviewAt: new Date().toISOString(), lastError: '' }
    : { lastReviewErrorAt: new Date().toISOString(), lastError: 'The connector could not prepare review data. Try Review again; if it persists, check the host connection.' });
});
const transport = new StdioServerTransport();
let heartbeat: ReturnType<typeof setInterval> | undefined;
let reporting = false;
async function reportHeartbeat() {
  if (reporting) return;
  reporting = true;
  try { await recordConnection({ heartbeatAt: new Date().toISOString() }); }
  catch { console.error('Unable to record SG Goals connector heartbeat.'); }
  finally { reporting = false; }
}

async function main() {
  await server.connect(transport);
  void reportHeartbeat();
  heartbeat = setInterval(() => void reportHeartbeat(), 30000);
}

async function shutdown() {
  clearInterval(heartbeat);
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
