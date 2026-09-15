-- AlterTable
ALTER TABLE "flights" ADD COLUMN     "avg_throttle_pct" INTEGER,
ADD COLUMN     "max_throttle_pct" INTEGER,
ADD COLUMN     "max_tx_power_mw" INTEGER,
ADD COLUMN     "min_downlink_quality" INTEGER,
ADD COLUMN     "min_radio_voltage" DOUBLE PRECISION,
ADD COLUMN     "min_rssi_dbm" INTEGER,
ADD COLUMN     "min_snr_db" INTEGER;
