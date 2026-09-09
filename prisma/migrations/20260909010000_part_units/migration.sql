-- Track parts as individual physical units.
--
-- `parts` becomes a catalogue entry -- a KIND of thing -- and `part_units`
-- holds the objects. One condition field could not describe four motors:
-- marking the row broken condemned all four, and leaving it serviceable
-- claimed a dead motor was fine.
--
-- Written by hand rather than generated, because Prisma would drop
-- `quantity_owned` and repoint `build_parts` without carrying the rows across.

-- The enum now describes a unit's condition, not a part's whereabouts.
ALTER TYPE "PartStatus" RENAME TO "PartCondition";

CREATE TABLE "part_units" (
    "id" UUID NOT NULL,
    "part_id" UUID NOT NULL,
    "condition" "PartCondition" NOT NULL DEFAULT 'SERVICEABLE',
    "label" TEXT,
    "acquired_on" DATE,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "part_units_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "part_units_part_id_idx" ON "part_units"("part_id");

ALTER TABLE "part_units" ADD CONSTRAINT "part_units_part_id_fkey"
    FOREIGN KEY ("part_id") REFERENCES "parts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- One unit per item held, inheriting the row's condition. `generate_series`
-- expands "quantity_owned: 4" into the four objects it always meant.
INSERT INTO "part_units" ("id", "part_id", "condition", "created_at")
SELECT gen_random_uuid(), p."id", p."status", now()
FROM "parts" p, generate_series(1, GREATEST(p."quantity_owned", 1));

ALTER TABLE "build_parts" ADD COLUMN "unit_id" UUID;

-- Guard: only *open* installs need a unit each -- one object cannot be on two
-- quads at once. Closed installs are history and may share a unit, since the
-- same motor can be fitted, removed and refitted. If a part somehow has more
-- open installs than units held, top the units up: the column is about to
-- become NOT NULL, and an install with nowhere to point would abort the
-- migration rather than fail quietly.
INSERT INTO "part_units" ("id", "part_id", "condition", "created_at", "notes")
SELECT gen_random_uuid(), s."part_id", 'SERVICEABLE', now(),
       'Created by migration: more parts were fitted than were recorded as held'
FROM (
    SELECT bp."part_id",
           COUNT(*) FILTER (WHERE bp."removed_on" IS NULL)
             - (SELECT COUNT(*) FROM "part_units" u WHERE u."part_id" = bp."part_id")
             AS shortfall
    FROM "build_parts" bp
    GROUP BY bp."part_id"
) s
CROSS JOIN generate_series(1, 1000) AS g
WHERE s.shortfall > 0 AND g <= s.shortfall;

-- Which specific motor sat on which quad was never recorded, so the pairing
-- below is arbitrary. It only has to be stable and physically possible.

-- Open installs: the Nth gets the Nth unit, so no two claim the same object.
WITH open_installs AS (
    SELECT "id", "part_id",
           row_number() OVER (PARTITION BY "part_id" ORDER BY "installed_on", "id") AS rn
    FROM "build_parts"
    WHERE "removed_on" IS NULL
),
units AS (
    SELECT "id", "part_id",
           row_number() OVER (PARTITION BY "part_id" ORDER BY "created_at", "id") AS rn
    FROM "part_units"
)
UPDATE "build_parts" bp
SET "unit_id" = u."id"
FROM open_installs oi
JOIN units u ON u."part_id" = oi."part_id" AND u."rn" = oi."rn"
WHERE bp."id" = oi."id";

-- Closed installs: spread round-robin over that part's units rather than
-- piling every past fitting onto unit one.
WITH closed_installs AS (
    SELECT "id", "part_id",
           row_number() OVER (PARTITION BY "part_id" ORDER BY "installed_on", "id") AS rn
    FROM "build_parts"
    WHERE "removed_on" IS NOT NULL
),
units AS (
    SELECT "id", "part_id",
           row_number() OVER (PARTITION BY "part_id" ORDER BY "created_at", "id") AS rn,
           COUNT(*) OVER (PARTITION BY "part_id") AS total
    FROM "part_units"
)
UPDATE "build_parts" bp
SET "unit_id" = u."id"
FROM closed_installs ci
JOIN units u ON u."part_id" = ci."part_id" AND u."rn" = ((ci."rn" - 1) % u."total") + 1
WHERE bp."id" = ci."id";

ALTER TABLE "build_parts" ALTER COLUMN "unit_id" SET NOT NULL;

ALTER TABLE "build_parts" DROP CONSTRAINT "build_parts_part_id_fkey";
DROP INDEX "build_parts_part_id_idx";
ALTER TABLE "build_parts" DROP COLUMN "part_id";

CREATE INDEX "build_parts_unit_id_idx" ON "build_parts"("unit_id");

ALTER TABLE "build_parts" ADD CONSTRAINT "build_parts_unit_id_fkey"
    FOREIGN KEY ("unit_id") REFERENCES "part_units"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Both now live on the unit.
ALTER TABLE "parts" DROP COLUMN "quantity_owned";
ALTER TABLE "parts" DROP COLUMN "status";
