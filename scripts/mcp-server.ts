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
const statusPage = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>SG Goals MCP</title>
  <style>
    :root { color-scheme: dark; font-family: Inter, ui-sans-serif, system-ui, sans-serif; }
    body { min-height: 100vh; margin: 0; display: grid; place-items: center; background: #07070f; color: #e8e8f5; }
    main { width: min(680px, calc(100% - 40px)); border: 1px solid #24243e; border-radius: 18px; padding: 28px; background: #0f0f1d; box-shadow: 0 24px 70px #0008; }
    .status { display: inline-flex; align-items: center; gap: 8px; color: #00d97e; font-size: 13px; font-weight: 700; }
    .dot { width: 9px; height: 9px; border-radius: 999px; background: #00d97e; box-shadow: 0 0 18px #00d97e; }
    h1 { margin: 14px 0 8px; font-size: clamp(28px, 6vw, 44px); }
    p { color: #a7a7c7; line-height: 1.6; }
    code { color: #8db7ff; background: #15152a; border: 1px solid #24243e; border-radius: 7px; padding: 3px 7px; }
    ul { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 8px; padding: 0; list-style: none; }
    li { border: 1px solid #24243e; border-radius: 9px; padding: 9px 11px; color: #c8c8df; background: #131326; font-size: 13px; }
  </style>
</head>
<body><main>
  <div class="status"><span class="dot"></span>Server running</div>
  <h1>SG Goals MCP</h1>
  <p>The read-only MCP endpoint is available at <code>POST /mcp</code>. MCP clients must send the configured bearer token. This browser page exposes no SG Goals data.</p>
  <ul><li>get_today_status</li><li>get_daily_report</li><li>get_weekly_summary</li><li>get_missed_tasks</li><li>get_next_action</li><li>get_goal_progress</li><li>get_priority_review</li></ul>
</main></body>
</html>`;

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
  if (request.accepts('html')) {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'");
    response.status(200).type('html').send(statusPage);
    return;
  }
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
