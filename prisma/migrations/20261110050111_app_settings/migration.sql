-- CreateTable
CREATE TABLE "app_settings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "open_registration" BOOLEAN NOT NULL DEFAULT false,
    "allowed_emails" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "app_settings_pkey" PRIMARY KEY ("id")
);

-- Hand-written: Prisma cannot express either of these.

-- One row, ever: the settings are the app's, not anybody's.
ALTER TABLE "app_settings" ADD CONSTRAINT "app_settings_single_row" CHECK ("id" = 1);

-- The Admin page needs an admin, and the role column has had no use until
-- now. The first account to sign in is the person who set the site up, so it
-- becomes the admin; anyone else is promoted by an UPDATE, deliberately.
UPDATE "users"
SET "role" = 'ADMIN'
WHERE "id" = (SELECT "id" FROM "users" ORDER BY "created_at" ASC, "id" ASC LIMIT 1);
