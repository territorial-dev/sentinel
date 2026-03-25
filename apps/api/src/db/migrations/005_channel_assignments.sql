CREATE TABLE channel_assignments (
  channel_id   TEXT NOT NULL REFERENCES notification_channels(id) ON DELETE CASCADE,
  scope_type   TEXT NOT NULL CHECK (scope_type IN ('test', 'tag')),
  scope_value  TEXT NOT NULL,
  PRIMARY KEY (channel_id, scope_type, scope_value)
);

CREATE INDEX idx_ca_scope ON channel_assignments (scope_type, scope_value);
