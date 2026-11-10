-- AlterTable
ALTER TABLE "builds" ADD COLUMN     "bought_complete" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "purchase_currency" TEXT,
ADD COLUMN     "purchase_price" DECIMAL(10,2),
ADD COLUMN     "purchase_url" TEXT,
ADD COLUMN     "purchase_vendor" TEXT;
