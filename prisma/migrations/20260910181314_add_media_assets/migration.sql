-- CreateEnum
CREATE TYPE "AssetKind" AS ENUM ('IMAGE', 'THUMB');

-- CreateEnum
CREATE TYPE "AssetStatus" AS ENUM ('PENDING', 'READY', 'FAILED');

-- AlterTable
ALTER TABLE "builds" ADD COLUMN     "cover_asset_id" UUID;

-- CreateTable
CREATE TABLE "assets" (
    "id" UUID NOT NULL,
    "owner_id" UUID NOT NULL,
    "kind" "AssetKind" NOT NULL DEFAULT 'IMAGE',
    "status" "AssetStatus" NOT NULL DEFAULT 'PENDING',
    "storage_key" TEXT NOT NULL,
    "file_name" TEXT,
    "mime" TEXT,
    "size_bytes" BIGINT,
    "width" INTEGER,
    "height" INTEGER,
    "thumb_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asset_links" (
    "id" UUID NOT NULL,
    "asset_id" UUID NOT NULL,
    "subject_type" TEXT NOT NULL,
    "subject_id" UUID NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "asset_links_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "assets_storage_key_key" ON "assets"("storage_key");

-- CreateIndex
CREATE UNIQUE INDEX "assets_thumb_id_key" ON "assets"("thumb_id");

-- CreateIndex
CREATE INDEX "assets_owner_id_status_idx" ON "assets"("owner_id", "status");

-- CreateIndex
CREATE INDEX "asset_links_subject_type_subject_id_sort_order_idx" ON "asset_links"("subject_type", "subject_id", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "asset_links_asset_id_subject_type_subject_id_key" ON "asset_links"("asset_id", "subject_type", "subject_id");

-- AddForeignKey
ALTER TABLE "builds" ADD CONSTRAINT "builds_cover_asset_id_fkey" FOREIGN KEY ("cover_asset_id") REFERENCES "assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "assets_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assets" ADD CONSTRAINT "assets_thumb_id_fkey" FOREIGN KEY ("thumb_id") REFERENCES "assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asset_links" ADD CONSTRAINT "asset_links_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
