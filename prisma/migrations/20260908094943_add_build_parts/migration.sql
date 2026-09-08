-- CreateEnum
CREATE TYPE "InstallReason" AS ENUM ('INITIAL', 'REPLACEMENT', 'UPGRADE');

-- CreateTable
CREATE TABLE "build_parts" (
    "id" UUID NOT NULL,
    "build_id" UUID NOT NULL,
    "part_id" UUID NOT NULL,
    "position" TEXT,
    "installed_on" DATE NOT NULL,
    "removed_on" DATE,
    "reason" "InstallReason" NOT NULL DEFAULT 'INITIAL',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "build_parts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "build_parts_build_id_idx" ON "build_parts"("build_id");

-- Partial index, hand-written: Prisma has no schema syntax for a WHERE
-- clause on an index. Covers the "currently fitted" lookup, which is the
-- query the build page runs on every load.
CREATE INDEX "build_parts_installed_idx" ON "build_parts"("build_id") WHERE "removed_on" IS NULL;

-- CreateIndex
CREATE INDEX "build_parts_part_id_idx" ON "build_parts"("part_id");

-- AddForeignKey
ALTER TABLE "build_parts" ADD CONSTRAINT "build_parts_build_id_fkey" FOREIGN KEY ("build_id") REFERENCES "builds"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "build_parts" ADD CONSTRAINT "build_parts_part_id_fkey" FOREIGN KEY ("part_id") REFERENCES "parts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
