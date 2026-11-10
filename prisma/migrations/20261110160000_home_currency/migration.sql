-- The currency a pilot's cost totals are shown in, besides USD. Everyone
-- starts on USD and picks their own on the account page.
ALTER TABLE "users" ADD COLUMN "home_currency" VARCHAR(3) NOT NULL DEFAULT 'USD';
