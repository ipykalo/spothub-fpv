-- AlterTable
ALTER TABLE "spots" ADD COLUMN     "cover_storage_key" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "spots_cover_storage_key_key" ON "spots"("cover_storage_key");
