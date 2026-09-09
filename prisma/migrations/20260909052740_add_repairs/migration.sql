-- CreateEnum
CREATE TYPE "RepairCause" AS ENUM ('CRASH', 'WEAR', 'UPGRADE');

-- AlterTable
ALTER TABLE "build_parts" ADD COLUMN     "repair_id" UUID;

-- CreateTable
CREATE TABLE "repairs" (
    "id" UUID NOT NULL,
    "build_id" UUID NOT NULL,
    "occurred_on" DATE NOT NULL,
    "cause" "RepairCause" NOT NULL DEFAULT 'CRASH',
    "description_md" TEXT,
    "cost" DECIMAL(10,2),
    "currency" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "repairs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "repairs_build_id_occurred_on_idx" ON "repairs"("build_id", "occurred_on");

-- CreateIndex
CREATE INDEX "build_parts_repair_id_idx" ON "build_parts"("repair_id");

-- AddForeignKey
ALTER TABLE "build_parts" ADD CONSTRAINT "build_parts_repair_id_fkey" FOREIGN KEY ("repair_id") REFERENCES "repairs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "repairs" ADD CONSTRAINT "repairs_build_id_fkey" FOREIGN KEY ("build_id") REFERENCES "builds"("id") ON DELETE CASCADE ON UPDATE CASCADE;
