-- A pilot's default storage limit starts at 512 MiB rather than 2 GiB: the
-- server's whole disk is about 40 GB, and 512 MiB holds a hundred-odd photos
-- or thousands of radio logs. The Admin page changes it from there.
ALTER TABLE "app_settings" ALTER COLUMN "default_storage_quota_bytes" SET DEFAULT 536870912;

-- The settings row may already exist with the old starting value, written by
-- the migration that added the column, not chosen by an admin (that migration
-- shipped in the same release as this one). Any other value was chosen and
-- stays.
UPDATE "app_settings"
SET "default_storage_quota_bytes" = 536870912
WHERE "default_storage_quota_bytes" = 2147483648;
