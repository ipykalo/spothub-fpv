-- AlterTable
ALTER TABLE "posts" ADD COLUMN     "cover_asset_id" UUID;

-- AddForeignKey
ALTER TABLE "posts" ADD CONSTRAINT "posts_cover_asset_id_fkey" FOREIGN KEY ("cover_asset_id") REFERENCES "assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

