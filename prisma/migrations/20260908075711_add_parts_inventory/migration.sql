-- CreateEnum
CREATE TYPE "PartCategory" AS ENUM ('FRAME', 'MOTOR', 'ESC', 'FC', 'STACK', 'VTX', 'CAMERA', 'RX', 'ANTENNA', 'PROP', 'BATTERY', 'OTHER');

-- CreateEnum
CREATE TYPE "PartStatus" AS ENUM ('NEW', 'IN_USE', 'SPARE', 'BROKEN', 'RETIRED');

-- CreateTable
CREATE TABLE "parts" (
    "id" UUID NOT NULL,
    "owner_id" UUID NOT NULL,
    "category" "PartCategory" NOT NULL,
    "manufacturer" TEXT,
    "model" TEXT,
    "spec" JSONB NOT NULL DEFAULT '{}',
    "quantity_owned" INTEGER NOT NULL DEFAULT 1,
    "status" "PartStatus" NOT NULL DEFAULT 'IN_USE',
    "notes_md" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "parts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "part_sources" (
    "id" UUID NOT NULL,
    "part_id" UUID NOT NULL,
    "vendor" TEXT,
    "url" TEXT,
    "price" DECIMAL(10,2),
    "currency" TEXT,
    "is_purchase" BOOLEAN NOT NULL DEFAULT false,
    "purchased_on" DATE,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "captured_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "part_sources_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "parts_owner_id_category_idx" ON "parts"("owner_id", "category");

-- CreateIndex
CREATE INDEX "part_sources_part_id_idx" ON "part_sources"("part_id");

-- AddForeignKey
ALTER TABLE "parts" ADD CONSTRAINT "parts_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "part_sources" ADD CONSTRAINT "part_sources_part_id_fkey" FOREIGN KEY ("part_id") REFERENCES "parts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
