-- Snapshot of match detail state (board, players, categories) captured at save time.
-- Allows match history detail to survive after the in-memory game session (Redis, 24h TTL) expires.
-- Used primarily for local 2-player matches; other modes continue to source from their dedicated tables.
alter table public.match_history
  add column if not exists detail_snapshot jsonb;
