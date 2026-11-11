-- The National Bank of Ukraine's official rates, as hryvnias per unit of
-- each currency, one row per currency per day. Fetched for a day the first
-- time a price dated that day is converted, and kept: a past rate never changes.
CREATE TABLE "exchange_rates" (
    "day" DATE NOT NULL,
    "currency" VARCHAR(3) NOT NULL,
    "uah_per_unit" DECIMAL(18,8) NOT NULL,
    "fetched_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "exchange_rates_pkey" PRIMARY KEY ("day", "currency"),
    CONSTRAINT "exchange_rates_rate_check" CHECK ("uah_per_unit" > 0)
);
