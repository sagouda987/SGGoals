import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { config } from 'dotenv';
import path from 'node:path';
import { createSgGoalsMcpServer } from '../lib/mcp/server';
import { HttpSgGoalsMcpDataSource, SgGoalsMcpService } from '../lib/mcp/service';
import { readFileSync } from 'node:fs';
import { sign } from 'node:crypto';

const projectRoot = path.resolve(__dirname, '..');

config({ path: path.join(projectRoot, '.env.local') });
config({ path: path.join(projectRoot, '.env') });

const dataUrl = process.env.SG_GOALS_MCP_DATA_URL?.trim() || 'https://sg-goals.vercel.app';
async function reportConnection(event: 'heartbeat' | 'review-success' | 'review-error') {
  const key = process.env.SG_GOALS_CONNECTION_PRIVATE_KEY || readFileSync(path.join(projectRoot, '.codex/connection-private.pem'), 'utf8');
  const body = JSON.stringify({ event, at: new Date().toISOString() });
  const response = await fetch(new URL('/api/goals/connection-status', dataUrl), {
    method: 'POST', body, signal: AbortSignal.timeout(10000),
    headers: { 'Content-Type': 'application/json', 'x-sg-signature': sign(null, Buffer.from(body), key).toString('base64') }
  });
  if (!response.ok) throw new Error(`Status reporting failed (${response.status}).`);
}
const server = createSgGoalsMcpServer(new SgGoalsMcpService(new HttpSgGoalsMcpDataSource(dataUrl)), async (ok) => {
  await reportConnection(ok ? 'review-success' : 'review-error');
});
const transport = new StdioServerTransport();
let heartbeat: ReturnType<typeof setInterval> | undefined;
let reporting = false;
async function reportHeartbeat() {
  if (reporting) return;
  reporting = true;
  try { await reportConnection('heartbeat'); }
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
