-- Countries nobody may sign in from, by the country of their IP address:
-- Russia, Belarus, Iran, North Korea, Syria and Cuba to start with. The
-- existing settings row takes the same list; the Admin page changes it.
ALTER TABLE "app_settings"
  ADD COLUMN "blocked_countries" TEXT[] NOT NULL DEFAULT ARRAY['RU', 'BY', 'IR', 'KP', 'SY', 'CU']::TEXT[];

-- Where each pilot last signed in from, refused or not, for the Admin page.
ALTER TABLE "users" ADD COLUMN "last_sign_in_country" VARCHAR(2);
