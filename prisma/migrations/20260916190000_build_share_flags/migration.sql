-- AlterTable
ALTER TABLE "builds" ADD COLUMN     "share_costs" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "share_notes" BOOLEAN NOT NULL DEFAULT false;

