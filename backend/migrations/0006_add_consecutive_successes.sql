-- Migration number: 0006
ALTER TABLE notification_states
ADD COLUMN consecutiveSuccesses INTEGER NOT NULL DEFAULT 0;
