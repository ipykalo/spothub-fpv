-- A display-size version of every image, beside the thumbnail: what a
-- gallery, a viewer and a post body show instead of the original.
-- Written by hand; it is exactly what Prisma would generate.

-- AlterEnum
ALTER TYPE "AssetKind" ADD VALUE 'DISPLAY';

-- AlterTable
ALTER TABLE "assets" ADD COLUMN "display_id" UUID;

-- CreateIndex
CREATE UNIQUE INDEX "assets_display_id_key" ON "assets"("display_id");

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "assets_display_id_fkey" FOREIGN KEY ("display_id") REFERENCES "assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;
