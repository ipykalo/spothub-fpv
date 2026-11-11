-- The name a pilot chooses to go by. Null until they choose: the site then
-- shows the Google name cut to "First L.", never the full name.
ALTER TABLE "users" ADD COLUMN "pilot_name" TEXT;
