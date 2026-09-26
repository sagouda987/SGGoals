import { verify } from 'node:crypto';
import connectionKey from './connection-public-key.json';
import type { ConnectionRecord } from './connection-status';

// Only the connector host owns the private key. Public verification material is
// safe to deploy; an environment override supports rotation without code edits.
export function verifyConnectionReport(body: string, signature: string, now = Date.now(), key = process.env.SG_GOALS_CONNECTION_PUBLIC_KEY || connectionKey.publicKey): ConnectionRecord | null {
  try {
    if (!verify(null, Buffer.from(body), key, Buffer.from(signature, 'base64'))) return null;
    const value = JSON.parse(body);
    const timestamp = Date.parse(value.at);
    if (!Number.isFinite(timestamp) || Math.abs(now - timestamp) > 60000) return null;
    const at = new Date(timestamp).toISOString();
    if (value.event === 'heartbeat') return { heartbeatAt: at };
    if (value.event === 'review-success') return { heartbeatAt: at, lastSuccessfulReviewAt: at };
    if (value.event === 'review-error') return { heartbeatAt: at, lastReviewErrorAt: at, lastError: 'The connector could not prepare review data. Try Review again; if it persists, check the host connection.' };
    return null;
  } catch { return null; }
}
