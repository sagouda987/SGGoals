import { NextResponse } from 'next/server';
export const dynamic = 'force-dynamic';
const username = 'santoshgouda';
const istDate = (d: Date) => new Date(d.getTime() + 330 * 60000).toISOString().slice(0, 10);
export async function GET() {
  try {
    const now = new Date();
    const today = istDate(now);
    // Include the previous UTC month around the IST month boundary.
    const months = [...new Set([now, new Date(now.getTime() - 86400000)].map(d => d.toISOString().slice(0, 7).replace('-', '/')))];
    const read = async (path: string) => {
      const r = await fetch(`https://api.chess.com/pub/player/${username}/${path}`, {
        headers: { 'User-Agent': 'SGGoals/1.0 (personal chess training dashboard; github.com/sagouda987/SGGoals)' },
        next: { revalidate: 60 }, signal: AbortSignal.timeout(12000)
      });
      if (!r.ok) throw new Error(`Chess.com returned ${r.status}`);
      return r.json();
    };
    const [stats, ...archives] = await Promise.all([read('stats'), ...months.map(m => read(`games/${m}`))]);
    const games = archives.flatMap(a => a.games || []).filter(g => istDate(new Date(g.end_time * 1000)) === today).map(g => {
      const side = g.white.username.toLowerCase() === username ? g.white : g.black;
      return { url: g.url, timeClass: g.time_class, result: side.result, endTime: g.end_time };
    });
    const draws = new Set(['agreed', 'repetition', 'stalemate', 'insufficient', '50move', 'timevsinsufficient']);
    return NextResponse.json({ username, date: today, timezone: 'Asia/Kolkata', blitz: stats.chess_blitz?.last?.rating ?? null,
      rapid: stats.chess_rapid?.last?.rating ?? null, tactics: stats.tactics?.highest?.rating ?? null,
      puzzleRush: stats.puzzle_rush?.best?.score ?? null, games,
      results: { wins: games.filter(g => g.result === 'win').length, draws: games.filter(g => draws.has(g.result)).length,
        losses: games.filter(g => g.result !== 'win' && !draws.has(g.result)).length }, updatedAt: now.toISOString() });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Chess.com unavailable' }, { status: 502 });
  }
}
