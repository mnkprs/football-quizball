// backend/src/bot/bot-config.ts

/** Parse an env var as integer with a default fallback. */
function envInt(key: string, fallback: number): number {
  const raw = process.env[key];
  if (!raw) return fallback;
  const parsed = parseInt(raw, 10);
  return Number.isNaN(parsed) ? fallback : parsed;
}

// ── Intervals (milliseconds) ────────────────────────────────────────────────

/** Matchmaker polling interval. */
export const BOT_MATCHMAKER_INTERVAL_MS = envInt('BOT_MATCHMAKER_INTERVAL_SEC', 5) * 1000;

/** Online game runner polling interval. */
export const BOT_ONLINE_RUNNER_INTERVAL_MS = envInt('BOT_ONLINE_RUNNER_INTERVAL_SEC', 30) * 1000;

/** Stale BR room cleanup interval (fixed 60s). */
export const BOT_STALE_CLEANUP_INTERVAL_MS = 60_000;

// ── Timeouts ────────────────────────────────────────────────────────────────

/** Seconds a game must be waiting before a bot is injected. */
export const QUEUE_TIMEOUT_SECONDS = envInt('BOT_QUEUE_TIMEOUT_SEC', 30);

// ── Battle Royale ───────────────────────────────────────────────────────────

/** Minimum bots to fill into a BR room. */
export const BR_BOT_MIN = envInt('BOT_BR_MIN_BOTS', 3);

/** Maximum bots to fill into a BR room. */
export const BR_BOT_MAX = envInt('BOT_BR_MAX_BOTS', 7);

/** Minimum number of public waiting BR rooms the matchmaker will maintain. */
export const BR_MIN_WAITING_ROOMS = envInt('BOT_BR_MIN_WAITING_ROOMS', 2);

/** Number of seed bots when creating a new bot-hosted room. */
export const BR_SEED_BOT_COUNT = 3;

/** Minutes a BR room can stay in 'waiting' before being deleted as stale. */
export const STALE_BR_ROOM_MINUTES = envInt('BOT_STALE_ROOM_MINUTES', 10);

// ── Online Game Runner ──────────────────────────────────────────────────────

/** Minimum seconds a bot waits before taking its online game turn. */
export const BOT_TURN_MIN_WAIT_SECONDS = 45;
