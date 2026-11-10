-- AlterTable
ALTER TABLE "app_settings" ADD COLUMN     "default_storage_quota_bytes" BIGINT NOT NULL DEFAULT 2147483648;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "storage_quota_bytes" BIGINT;
