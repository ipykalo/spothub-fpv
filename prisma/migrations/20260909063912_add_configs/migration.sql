-- CreateEnum
CREATE TYPE "ConfigKind" AS ENUM ('DIFF', 'DUMP');

-- CreateTable
CREATE TABLE "configs" (
    "id" UUID NOT NULL,
    "build_id" UUID NOT NULL,
    "captured_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "kind" "ConfigKind" NOT NULL DEFAULT 'DIFF',
    "raw" TEXT NOT NULL,
    "note" TEXT,
    "fw_target" TEXT,
    "fw_version" TEXT,
    "fw_build_date" DATE,
    "fw_git_rev" TEXT,
    "msp_api" TEXT,
    "config_rev" TEXT,
    "board_name" TEXT,
    "manufacturer_id" TEXT,
    "mcu_id" TEXT,
    "craft_name" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "configs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "configs_build_id_captured_at_idx" ON "configs"("build_id", "captured_at");

-- AddForeignKey
ALTER TABLE "configs" ADD CONSTRAINT "configs_build_id_fkey" FOREIGN KEY ("build_id") REFERENCES "builds"("id") ON DELETE CASCADE ON UPDATE CASCADE;
