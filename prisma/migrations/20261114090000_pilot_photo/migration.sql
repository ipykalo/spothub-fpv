-- AlterTable
ALTER TABLE "users" ADD COLUMN "photo_asset_id" UUID;

-- CreateIndex
CREATE UNIQUE INDEX "users_photo_asset_id_key" ON "users"("photo_asset_id");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_photo_asset_id_fkey" FOREIGN KEY ("photo_asset_id") REFERENCES "assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;
