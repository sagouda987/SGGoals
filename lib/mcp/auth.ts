import { timingSafeEqual } from 'node:crypto';
import { SgGoalsMcpError } from '@/lib/mcp/errors';

export function requireConfiguredMcpToken(value = process.env.SG_GOALS_MCP_TOKEN) {
  if (!value || value.length < 16) {
    throw new Error('SG_GOALS_MCP_TOKEN must be configured with at least 16 characters.');
  }
  return value;
}

export function authorizeMcpRequest(authorization: string | undefined, expectedToken: string) {
  const prefix = 'Bearer ';
  if (!authorization?.startsWith(prefix)) throw new SgGoalsMcpError('UNAUTHORIZED', 'A bearer token is required.');
  const provided = Buffer.from(authorization.slice(prefix.length), 'utf8');
  const expected = Buffer.from(expectedToken, 'utf8');
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
    throw new SgGoalsMcpError('UNAUTHORIZED', 'The bearer token is invalid.');
  }
}
