import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createMcpExpressApp } from '@modelcontextprotocol/sdk/server/express.js';
import type { Request, Response } from 'express';
import { config } from 'dotenv';
import { authorizeMcpRequest, requireConfiguredMcpToken } from '../lib/mcp/auth';
import { SgGoalsMcpError } from '../lib/mcp/errors';
import { createSgGoalsMcpServer } from '../lib/mcp/server';
import { SgGoalsMcpService } from '../lib/mcp/service';

config({ path: '.env.local' });
config();

const token = requireConfiguredMcpToken();
const host = process.env.SG_GOALS_MCP_HOST || '127.0.0.1';
const port = Number(process.env.SG_GOALS_MCP_PORT || 3333);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('SG_GOALS_MCP_PORT must be a valid TCP port.');

const app = createMcpExpressApp({ host });
const service = new SgGoalsMcpService();

function authorized(request: Request, response: Response) {
  try {
    authorizeMcpRequest(request.headers.authorization, token);
    return true;
  } catch (error) {
    const message = error instanceof SgGoalsMcpError ? error.message : 'Unauthorized.';
    response.status(401).json({ error: { code: 'UNAUTHORIZED', message } });
    return false;
  }
}

app.post('/mcp', async (request: Request, response: Response) => {
  if (!authorized(request, response)) return;
  const server = createSgGoalsMcpServer(service);
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  response.on('close', () => { void transport.close(); void server.close(); });
  try {
    await server.connect(transport);
    await transport.handleRequest(request, response, request.body);
  } catch {
    if (!response.headersSent) response.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'The MCP request could not be processed.' } });
  }
});

app.get('/mcp', (request: Request, response: Response) => {
  if (!authorized(request, response)) return;
  response.status(405).json({ error: { code: 'METHOD_NOT_ALLOWED', message: 'Use POST for this stateless MCP endpoint.' } });
});

app.delete('/mcp', (request: Request, response: Response) => {
  if (!authorized(request, response)) return;
  response.status(405).json({ error: { code: 'METHOD_NOT_ALLOWED', message: 'This MCP endpoint is stateless.' } });
});

const listener = app.listen(port, host, () => {
  console.log(`SG Goals MCP listening at http://${host}:${port}/mcp`);
});

function shutdown() {
  listener.close(() => process.exit(0));
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
