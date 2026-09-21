# SG Goals MCP

SG Goals MCP is a read-only Model Context Protocol interface over the existing SG Goals task and activity data. It returns concise structured records so an MCP client can perform its own analysis and coaching. It does not call an LLM, create a second database, or change task completion, rollover, points, or scoring behavior.

## Architecture

The local Streamable HTTP server in `scripts/mcp-server.ts` authenticates requests and connects the official MCP TypeScript SDK to the tool definitions in `lib/mcp/server.ts`. The tools call `SgGoalsMcpService`, which reads the existing Prisma `GoalTask` and `GoalActivity` models and reuses the existing reporting-day, points, category-score, focus-correction, AI-context, and deterministic next-action logic.

Historical task details come from recorded activity events. The current database schema does not keep full task snapshots for every past day, so an old report cannot reconstruct fields that were never written to `GoalActivity`. Responses expose `taskSource` so clients can distinguish current task state from activity-derived history.

## Environment variables

Copy the entries from `.env.example` into `.env.local` or provide them in the process environment:

- `DATABASE_URL`: existing SG Goals PostgreSQL connection.
- `DIRECT_URL`: existing direct PostgreSQL connection used by Prisma.
- `SG_GOALS_MCP_TOKEN`: required bearer token, at least 16 characters.
- `SG_GOALS_MCP_HOST`: optional bind address; defaults to `127.0.0.1`.
- `SG_GOALS_MCP_PORT`: optional port; defaults to `3333`.

Generate a token in PowerShell:

```powershell
[Convert]::ToHexString([Security.Cryptography.RandomNumberGenerator]::GetBytes(32)).ToLower()
```

Never commit the generated token. Every request to `/mcp` must send `Authorization: Bearer <token>`. Token comparison is timing-safe, and failures return a controlled `UNAUTHORIZED` response.

## Local setup

```powershell
cd D:\TalkFluent
npm.cmd install
Copy-Item .env.example .env.local
```

Set the real database values and a random `SG_GOALS_MCP_TOKEN`, then load the environment in the shell used to start the server. The MCP process reads environment variables directly; it does not send them to clients.

## Run and test

Start the local server:

```powershell
cd D:\TalkFluent
npm.cmd run mcp:start
```

The endpoint is `http://127.0.0.1:3333/mcp` by default. Configure an MCP client for Streamable HTTP and add the bearer-token authorization header.

## Connect SG Goals to ChatGPT privately

Use OpenAI Secure MCP Tunnel for the ChatGPT connection. The tunnel makes an outbound connection from this computer, so the SG Goals database and MCP server do not need a public URL or an inbound firewall rule. ChatGPT calls the tools only when a conversation needs current SG Goals data; the application does not continuously upload the database.

The tunnel uses the stdio entry point below. It exposes the same read-only tools and service layer as the local HTTP server, without putting `SG_GOALS_MCP_TOKEN` into ChatGPT:

```powershell
cd D:\TalkFluent
npm.cmd run mcp:stdio
```

The stdio entry point reads the deployed website's existing read-only `/api/goals` and `/api/goals/activities` endpoints, so ChatGPT sees the same live data as `https://sg-goals.vercel.app`. Override `SG_GOALS_MCP_DATA_URL` only when testing another SG Goals deployment. No database credentials are sent to ChatGPT.

For the one-time connection:

1. Sign in at `https://platform.openai.com/settings/organization/tunnels` with the same OpenAI account used for ChatGPT.
2. Create a tunnel associated with the personal ChatGPT workspace and create its runtime API key.
3. Download the latest official `tunnel-client` from the tunnel settings page.
4. Initialize a profile named `sg-goals` with the tunnel ID and this stdio command:

   ```powershell
   tunnel-client init --profile sg-goals --tunnel-id tunnel_your_id --mcp-command "npm.cmd --prefix D:\TalkFluent run mcp:stdio"
   tunnel-client doctor --profile sg-goals --explain
   tunnel-client run --profile sg-goals
   ```

5. In `https://chatgpt.com/plugins`, choose **Create app**, name it **SG Goals**, select **Tunnel**, select the new tunnel, review the seven discovered tools, acknowledge the developer-mode warning, and create the app.

Keep `tunnel-client run --profile sg-goals` running whenever ChatGPT should have live access. If this computer or the tunnel client is offline, ChatGPT cannot read SG Goals. The connection remains read-only and does not modify database records.

Run the MCP regression tests:

```powershell
cd D:\TalkFluent
npm.cmd run test:mcp
```

The tests cover token authentication, 2:59/3:00/3:01 AM IST boundaries, today status, invalid daily dates, weekly aggregation, empty data, complete/undo chronology, and invalid inputs.

## Phase 1 tools

### `get_today_status`

No input. Returns the current SG Goals reporting date, current task completion and weighted points, recorded misses and focus time, target streaks, and seven-day category scores.

### `get_daily_report`

```json
{ "date": "2026-09-22" }
```

Returns the current task snapshot when requesting today and activity-derived task events for past dates, plus points, misses, time, and notes. Historical strike counts are returned as `null` because the schema does not persist them as daily snapshots.

### `get_weekly_summary`

```json
{ "startDate": "2026-09-20", "endDate": "2026-09-26" }
```

Both dates may be omitted to use the current Sunday-through-Saturday SG Goals week. The range cannot exceed 365 days.

### `get_missed_tasks`

```json
{ "days": 7, "limit": 20 }
```

Returns recorded failures by recency with frequency in the selected window. `days` is capped at 365 and `limit` at 100.

### `get_next_action`

No input. Reuses the deterministic service behind `/api/goals/next-action`; no paid AI service is required.

### `get_goal_progress`

```json
{ "category": "career", "days": 30 }
```

Supported categories match SG Goals: `health`, `career`, `communication`, `looks`, and `other`. Returns recorded completion, points, focus time, category score, daily trend, and frequent misses.

### `get_priority_review`

```json
{ "period": "week", "date": "2026-09-22" }
```

`period` supports `day`, `week`, and `month`; `date` is optional and defaults to the current SG Goals reporting date. The result combines recorded progress, misses, focus time, category performance, an equal-length previous-period comparison, the current yearly-to-daily goal hierarchy, notes, and the deterministic next action. ChatGPT can use this evidence for an on-demand review at any time; it does not create or modify SG Goals records.

## 3:00 AM IST boundary

All tools use the existing shared `istFocusDateKey` helper. A timestamp at 2:59 AM Asia/Kolkata belongs to the previous SG Goals day. At exactly 3:00 AM, the new reporting day begins. Database queries use the same shared `reportingDayBounds` helper.

## Errors and limits

Inputs are validated with Zod before a tool runs. Tool failures return controlled error objects and never expose stack traces or raw database errors. Historical queries are bounded, with a maximum range of 365 days and at most 100 returned missed-task records.

## Phase 2 write tools

`update_next_action`, `create_task`, and `mark_task_complete` are intentionally not registered. Before adding them, SG Goals needs explicit authorization rules around its single `ownerKey`, idempotency rules, and reuse of the existing activity/points write path. Arbitrary database mutation must remain unavailable.
