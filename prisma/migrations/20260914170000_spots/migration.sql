-- CreateEnum
CREATE TYPE "SpotTerrain" AS ENUM ('FIELD', 'PARK', 'BANDO', 'FOREST', 'QUARRY', 'MOUNTAIN', 'WATER', 'URBAN', 'TRACK', 'OTHER');

-- CreateEnum
CREATE TYPE "SpotHazard" AS ENUM ('POWERLINES', 'PEOPLE', 'TRAFFIC', 'TREES', 'WATER', 'ANIMALS', 'AIRSPACE', 'PRIVATE_LAND');

-- CreateEnum
CREATE TYPE "SpotAccess" AS ENUM ('OPEN', 'ASK_FIRST', 'RESTRICTED', 'UNKNOWN');

-- CreateTable
CREATE TABLE "spots" (
    "id" UUID NOT NULL,
    "owner_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "lat" DECIMAL(9,6) NOT NULL,
    "lng" DECIMAL(9,6) NOT NULL,
    "locality" TEXT,
    "terrain" "SpotTerrain",
    "access" "SpotAccess" NOT NULL DEFAULT 'UNKNOWN',
    "difficulty" SMALLINT,
    "hazards" "SpotHazard"[] DEFAULT ARRAY[]::"SpotHazard"[],
    "description_md" TEXT,
    "access_notes_md" TEXT,
    "visibility" "Visibility" NOT NULL DEFAULT 'PRIVATE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "spots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "spots_owner_id_updated_at_idx" ON "spots"("owner_id", "updated_at");

-- CreateIndex
CREATE UNIQUE INDEX "spots_owner_id_slug_key" ON "spots"("owner_id", "slug");

-- AddForeignKey
ALTER TABLE "spots" ADD CONSTRAINT "spots_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

