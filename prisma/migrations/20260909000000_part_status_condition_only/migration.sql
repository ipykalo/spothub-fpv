-- Reduce PartStatus to condition only.
--
-- NEW, IN_USE and SPARE all answered "where is it", which `build_parts`
-- already records: an install with `removed_on IS NULL` is what "fitted"
-- means. Keeping a hand-typed copy of that let the two disagree, and with a
-- row standing for several units -- four motors bought as one pack -- no
-- single value could be right at "2 of 4 fitted" anyway.
--
-- Postgres cannot remove values from an enum in place, so the type is
-- replaced and the column converted with an explicit mapping. All three
-- deployment values become SERVICEABLE: none of them said anything about
-- condition, so no condition information is lost.

ALTER TYPE "PartStatus" RENAME TO "PartStatus_old";

CREATE TYPE "PartStatus" AS ENUM ('SERVICEABLE', 'BROKEN', 'RETIRED');

-- The default references the old type and blocks the conversion.
ALTER TABLE "parts" ALTER COLUMN "status" DROP DEFAULT;

ALTER TABLE "parts"
  ALTER COLUMN "status" TYPE "PartStatus"
  USING (
    CASE "status"::text
      WHEN 'BROKEN' THEN 'BROKEN'
      WHEN 'RETIRED' THEN 'RETIRED'
      ELSE 'SERVICEABLE'
    END
  )::"PartStatus";

ALTER TABLE "parts" ALTER COLUMN "status" SET DEFAULT 'SERVICEABLE';

DROP TYPE "PartStatus_old";
