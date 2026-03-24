ALTER TABLE tests
  ADD COLUMN failure_threshold INTEGER NOT NULL DEFAULT 3
                               CHECK (failure_threshold >= 1),
  ADD COLUMN cooldown_ms       INTEGER NOT NULL DEFAULT 300000
                               CHECK (cooldown_ms >= 0);
