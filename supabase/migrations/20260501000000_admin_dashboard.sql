-- Enable trigram extension for fuzzy search indexes
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Error logs table
CREATE TABLE admin_error_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  level TEXT NOT NULL CHECK (level IN ('error', 'warn')),
  context TEXT,
  message TEXT NOT NULL,
  stack TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_admin_error_logs_created ON admin_error_logs (created_at DESC);
CREATE INDEX idx_admin_error_logs_level_created ON admin_error_logs (level, created_at DESC);
CREATE INDEX idx_admin_error_logs_message_gin ON admin_error_logs USING gin (message gin_trgm_ops);

-- Audit log table
CREATE TABLE admin_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action TEXT NOT NULL,
  target_user_id UUID,
  details JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_admin_audit_log_created ON admin_audit_log (created_at DESC);

-- User search index
CREATE INDEX idx_profiles_username_trgm ON profiles USING gin (username gin_trgm_ops);
