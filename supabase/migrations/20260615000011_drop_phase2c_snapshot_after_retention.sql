-- Drop the _phase2c_id_remapping rollback snapshot once the retention period expires.
--
-- The table was created by migration 20260615000006 on 2026-04-20, snapshotting
-- the 2206 LOGO_QUIZ (pool_id → old_jsonb_id) remappings so we could roll back
-- Phase 2C if it caused user-visible issues. Retention: 30 days.
--
-- This migration self-gates by date: it's a no-op on every run before
-- 2026-05-20, and drops the table on any run at or after that date. Safe to
-- commit + deploy immediately; Postgres will hold off on the actual DROP
-- until the retention window closes.

DO $$
BEGIN
  IF now() >= '2026-05-20'::date THEN
    DROP TABLE IF EXISTS _phase2c_id_remapping;
    RAISE NOTICE '_phase2c_id_remapping dropped — Phase 2C retention window closed.';
  ELSE
    RAISE NOTICE '_phase2c_id_remapping retention active until 2026-05-20 — skipping drop.';
  END IF;
END
$$;
