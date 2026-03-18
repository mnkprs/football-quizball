-- Thin wrappers so Supabase JS RPC can call pg advisory locks.
-- Used by QuestionPoolService to prevent concurrent pool refills across replicas.
CREATE OR REPLACE FUNCTION try_advisory_lock(lock_key bigint) RETURNS boolean
LANGUAGE sql SECURITY DEFINER AS $$
  SELECT pg_try_advisory_lock(lock_key);
$$;

CREATE OR REPLACE FUNCTION advisory_unlock(lock_key bigint) RETURNS void
LANGUAGE sql SECURITY DEFINER AS $$
  SELECT pg_advisory_unlock(lock_key);
$$;
