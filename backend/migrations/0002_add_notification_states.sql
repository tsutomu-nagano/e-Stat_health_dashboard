-- Migration number: 0002
CREATE TABLE IF NOT EXISTS notification_states (
  target TEXT PRIMARY KEY,
  consecutiveFailures INTEGER NOT NULL DEFAULT 0,
  notifiedAt DATETIME,
  recoveredAt DATETIME,
  lastStatusCode INTEGER,
  lastError TEXT,
  updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
);
