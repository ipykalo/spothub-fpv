-- AlterEnum
ALTER TYPE "LogFormat" ADD VALUE 'BETAFLIGHT_BBL';

-- AlterTable
ALTER TABLE "flights" ADD COLUMN     "time_recorded" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "log_imports" ADD COLUMN     "flown_on" DATE;
