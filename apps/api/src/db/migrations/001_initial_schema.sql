-- Migration: 001_initial_schema
-- Creates all core domain tables for Sentinel.

-- Runner bookkeeping table (created here so subsequent migrations can reference it)
CREATE TABLE IF NOT EXISTS schema_migrations (
  filename   TEXT        PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- tests
-- The central entity representing a user-defined monitoring check.
-- ---------------------------------------------------------------------------
CREATE TABLE tests (
  id           TEXT        PRIMARY KEY,
  name         TEXT        NOT NULL,
  code         TEXT        NOT NULL,
  schedule_ms  INTEGER     NOT NULL CHECK (schedule_ms >= 30000),
  timeout_ms   INTEGER     NOT NULL CHECK (timeout_ms <= 10000),
  retries      SMALLINT    NOT NULL DEFAULT 0,
  uses_browser BOOLEAN     NOT NULL DEFAULT FALSE,
  enabled      BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- test_runs  (time-partitioned by started_at, monthly)
-- PK must include the partition key per Postgres constraint.
-- ---------------------------------------------------------------------------
CREATE TABLE test_runs (
  id            TEXT        NOT NULL,
  test_id       TEXT        NOT NULL REFERENCES tests(id) ON DELETE CASCADE,
  started_at    TIMESTAMPTZ NOT NULL,
  finished_at   TIMESTAMPTZ NOT NULL,
  status        TEXT        NOT NULL CHECK (status IN ('success', 'fail', 'timeout')),
  duration_ms   INTEGER     NOT NULL,
  error_message TEXT,
  PRIMARY KEY (id, started_at)
) PARTITION BY RANGE (started_at);

CREATE INDEX test_runs_test_id_idx ON test_runs (test_id, started_at);

-- Create monthly partitions for the current month and the next 2 months.
-- Runs at apply-time so partition names always reflect the actual calendar.
DO $$
DECLARE
  i          INT;
  start_date DATE;
  end_date   DATE;
  y          INT;
  m          INT;
BEGIN
  FOR i IN 0..2 LOOP
    start_date := date_trunc('month', NOW() + (i || ' months')::INTERVAL)::DATE;
    end_date   := (start_date + INTERVAL '1 month')::DATE;
    y          := EXTRACT(YEAR  FROM start_date);
    m          := EXTRACT(MONTH FROM start_date);
    EXECUTE format(
      'CREATE TABLE IF NOT EXISTS test_runs_%s_%s
       PARTITION OF test_runs
       FOR VALUES FROM (%L) TO (%L)',
      y, lpad(m::TEXT, 2, '0'), start_date, end_date
    );
  END LOOP;
END;
$$;

-- ---------------------------------------------------------------------------
-- assertion_results
-- Named assertions recorded when user code calls ctx.assert().
-- Logical FK to test_runs only — a hard constraint is not possible across
-- a partitioned table without including started_at in this table's PK.
-- ---------------------------------------------------------------------------
CREATE TABLE assertion_results (
  id          TEXT    PRIMARY KEY,
  test_run_id TEXT    NOT NULL,
  name        TEXT    NOT NULL,
  passed      BOOLEAN NOT NULL,
  message     TEXT
);

CREATE INDEX assertion_results_test_run_id_idx ON assertion_results (test_run_id);

-- ---------------------------------------------------------------------------
-- uptime_daily
-- Pre-aggregated daily statistics per test. The only table queried by public
-- dashboards and status pages.
-- ---------------------------------------------------------------------------
CREATE TABLE uptime_daily (
  test_id         TEXT           NOT NULL REFERENCES tests(id) ON DELETE CASCADE,
  date            DATE           NOT NULL,
  success_count   INTEGER        NOT NULL DEFAULT 0,
  failure_count   INTEGER        NOT NULL DEFAULT 0,
  avg_latency_ms  NUMERIC(10,2)  NOT NULL DEFAULT 0,
  PRIMARY KEY (test_id, date)
);

-- ---------------------------------------------------------------------------
-- notification_channels
-- Delivery targets (Discord / Slack / webhook) attached to a test.
-- ---------------------------------------------------------------------------
CREATE TABLE notification_channels (
  id          TEXT    PRIMARY KEY,
  test_id     TEXT    NOT NULL REFERENCES tests(id) ON DELETE CASCADE,
  type        TEXT    NOT NULL CHECK (type IN ('discord', 'slack', 'webhook')),
  webhook_url TEXT    NOT NULL,
  enabled     BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE INDEX notification_channels_test_id_idx ON notification_channels (test_id);

-- ---------------------------------------------------------------------------
-- test_state
-- Runtime alert state for each test. 1:1 with tests, upserted after every run.
-- ---------------------------------------------------------------------------
CREATE TABLE test_state (
  test_id              TEXT        PRIMARY KEY REFERENCES tests(id) ON DELETE CASCADE,
  last_status          TEXT        CHECK (last_status IN ('success', 'fail', 'timeout')),
  consecutive_failures INTEGER     NOT NULL DEFAULT 0,
  last_notification_at TIMESTAMPTZ,
  last_run_at          TIMESTAMPTZ
);
