-- Migration number: 0007
CREATE TABLE IF NOT EXISTS latest (
  target TEXT PRIMARY KEY,
  status TEXT NOT NULL,
  statusCode INTEGER,
  responseTimeMs INTEGER,
  error TEXT,
  createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 既存の履歴から、各サービスの最新状態を初期投入する。
INSERT OR REPLACE INTO latest (target, status, statusCode, responseTimeMs, error, createdAt)
SELECT logs.target, logs.status, logs.statusCode, logs.responseTimeMs, logs.error, logs.createdAt
FROM logs
INNER JOIN (
  SELECT target, MAX(id) AS latestId
  FROM logs
  GROUP BY target
) AS current ON logs.id = current.latestId;
