import assert from 'node:assert/strict';
import { chessTaskText } from '../lib/goals/chess-migration';
import { mustFocusTargets, MUST_FOCUS_TARGET_CODES } from '../lib/must-focus-targets';
import { GET } from '../app/api/chess/route';
async function main() {
  for (const text of ['Study', 'Study for 4 hours', 'Study for 1 hour', 'Study 2 hour', 'Chess study: 4 hours (puzzles, games review, openings, endgames)']) {
    assert.equal(chessTaskText(text), 'Chess');
    assert.equal(chessTaskText(chessTaskText(text)), 'Chess');
    const task = { id: 'original', done: true, investedMinutes: 70, note: 'keep', text };
    assert.deepEqual({ ...task, text: chessTaskText(task.text) }, { ...task, text: 'Chess' });
  }
  for (const text of ['Office work', 'Gym', 'Book reading', 'This week']) assert.equal(chessTaskText(text), text);
  assert.equal(mustFocusTargets('2026-11-06').minutes.STUDY2, 300);
  assert.equal(mustFocusTargets('2026-11-07').minutes.STUDY2, 420);
  assert.equal(mustFocusTargets('2026-11-08').minutes.GYM, 0);
  assert.ok(!(MUST_FOCUS_TARGET_CODES as readonly string[]).includes('GYM'));
  const originalFetch = global.fetch;
  const seen: string[] = [];
  global.fetch = (async (url: string, init: RequestInit) => {
    seen.push(url);
    assert.ok((init.headers as Record<string, string>)['User-Agent'].includes('SGGoals'));
    const now = Math.floor(Date.now() / 1000);
    return Response.json(url.endsWith('/stats') ? { chess_blitz: { last: { rating: 1621 } }, chess_rapid: { last: { rating: 1779 } }, puzzle_rush: { best: { score: 23 } } } : { games: [
      { url: 'https://chess.com/game/1', end_time: now, time_class: 'blitz', white: { username: 'santoshgouda', result: 'win' }, black: { username: 'other', result: 'checkmated' } },
      { url: 'https://chess.com/game/2', end_time: now - 3 * 86400, white: { username: 'other', result: 'win' }, black: { username: 'santoshgouda', result: 'resigned' } }
    ] });
  }) as typeof fetch;
  const response = await GET(); const data = await response.json();
  assert.equal(response.status, 200); assert.equal(data.blitz, 1621); assert.equal(data.rapid, 1779);
  assert.equal(data.puzzleRush, 23); assert.equal(data.tactics, null); assert.equal(data.results.wins, 1); assert.equal(data.games.length, 1);
  assert.ok(seen.some(url => /\/games\/\d{4}\/\d{2}$/.test(url)));
  global.fetch = (async () => new Response('', { status: 429 })) as typeof fetch;
  assert.equal((await GET()).status, 502);
  global.fetch = originalFetch;
  console.log('Chess migration, weekday/weekend targets, User-Agent, live rating, IST games and upstream failure tests passed');
}
void main();
