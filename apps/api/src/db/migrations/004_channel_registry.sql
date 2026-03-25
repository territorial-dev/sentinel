-- F-21: Refactor notification_channels into a global named-channel registry.
-- Drops test_id (and its FK/index), adds a name column.

ALTER TABLE notification_channels ADD COLUMN name TEXT;
UPDATE notification_channels SET name = 'channel-' || id;
ALTER TABLE notification_channels ALTER COLUMN name SET NOT NULL;

DROP INDEX IF EXISTS notification_channels_test_id_idx;
ALTER TABLE notification_channels DROP COLUMN test_id;
