-- AlterTable
ALTER TABLE "flights" ADD COLUMN     "battery_unit_id" UUID;

-- CreateIndex
CREATE INDEX "flights_battery_unit_id_idx" ON "flights"("battery_unit_id");

-- AddForeignKey
ALTER TABLE "flights" ADD CONSTRAINT "flights_battery_unit_id_fkey" FOREIGN KEY ("battery_unit_id") REFERENCES "part_units"("id") ON DELETE SET NULL ON UPDATE CASCADE;
