-- Migration number: 0005 	2026-09-02T00:00:00.000Z
CREATE INDEX IF NOT EXISTS idx_logs_created_at_target_id ON logs(createdAt, target, id DESC);
