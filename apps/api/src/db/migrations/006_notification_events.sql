CREATE TABLE notification_events (
  id                   TEXT PRIMARY KEY,
  test_id              TEXT NOT NULL REFERENCES tests(id) ON DELETE CASCADE,
  channel_id           TEXT REFERENCES notification_channels(id) ON DELETE SET NULL,
  event                TEXT NOT NULL CHECK (event IN ('fail', 'recovery')),
  phase                TEXT NOT NULL CHECK (phase IN ('evaluated', 'skipped', 'attempted', 'sent', 'failed')),
  reason               TEXT,
  consecutive_failures INTEGER NOT NULL,
  failure_threshold    INTEGER NOT NULL,
  cooldown_ms          INTEGER NOT NULL,
  http_status          INTEGER,
  error_message        TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_notification_events_test_created
  ON notification_events (test_id, created_at DESC);

CREATE INDEX idx_notification_events_phase_created
  ON notification_events (phase, created_at DESC);
