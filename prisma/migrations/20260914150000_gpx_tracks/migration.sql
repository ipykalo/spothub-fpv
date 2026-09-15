-- AlterEnum
ALTER TYPE "LogFormat" ADD VALUE 'GPX';

-- AlterTable
ALTER TABLE "flights" ADD COLUMN     "track_log_file_id" UUID;

-- CreateIndex
CREATE INDEX "flights_track_log_file_id_idx" ON "flights"("track_log_file_id");

-- AddForeignKey
ALTER TABLE "flights" ADD CONSTRAINT "flights_track_log_file_id_fkey" FOREIGN KEY ("track_log_file_id") REFERENCES "log_files"("id") ON DELETE SET NULL ON UPDATE CASCADE;

