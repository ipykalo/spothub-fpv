-- Comments stop belonging to spots alone: the same conversation now hangs off
-- builds too. Hand-written, because `migrate diff` would drop and recreate the
-- tables. Renamed instead, so every existing comment keeps its id, author,
-- thread and answer mark — and every constraint and index is renamed to the
-- name Prisma expects, so a later diff against the schema comes back empty.

-- ---------------------------------------------------------------- comments

ALTER TABLE "spot_comments" RENAME TO "comments";
ALTER TABLE "comments" RENAME CONSTRAINT "spot_comments_pkey" TO "comments_pkey";
ALTER TABLE "comments" RENAME CONSTRAINT "spot_comments_spot_id_fkey" TO "comments_spot_id_fkey";
ALTER TABLE "comments" RENAME CONSTRAINT "spot_comments_author_id_fkey" TO "comments_author_id_fkey";
ALTER TABLE "comments" RENAME CONSTRAINT "spot_comments_parent_id_fkey" TO "comments_parent_id_fkey";
ALTER INDEX "spot_comments_spot_id_created_at_idx" RENAME TO "comments_spot_id_created_at_idx";
ALTER INDEX "spot_comments_parent_id_idx" RENAME TO "comments_parent_id_idx";

ALTER TABLE "comments" ALTER COLUMN "spot_id" DROP NOT NULL;
ALTER TABLE "comments" ADD COLUMN "build_id" UUID;

CREATE INDEX "comments_build_id_created_at_idx" ON "comments"("build_id", "created_at");

ALTER TABLE "comments" ADD CONSTRAINT "comments_build_id_fkey" FOREIGN KEY ("build_id") REFERENCES "builds"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Exactly one subject. Prisma cannot express this, so it lives only here.
ALTER TABLE "comments" ADD CONSTRAINT "comments_one_subject" CHECK (num_nonnulls("spot_id", "build_id") = 1);

-- ----------------------------------------------------------- comment_reads

-- A new table rather than a rename: the old key was (spot_id, user_id), and a
-- primary key cannot include a column that is now nullable.
CREATE TABLE "comment_reads" (
    "id" UUID NOT NULL,
    "spot_id" UUID,
    "build_id" UUID,
    "user_id" UUID NOT NULL,
    "read_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "comment_reads_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "comment_reads_one_subject" CHECK (num_nonnulls("spot_id", "build_id") = 1)
);

INSERT INTO "comment_reads" ("id", "spot_id", "user_id", "read_at")
SELECT gen_random_uuid(), "spot_id", "user_id", "read_at"
FROM "spot_comment_reads";

DROP TABLE "spot_comment_reads";

CREATE UNIQUE INDEX "comment_reads_spot_id_user_id_key" ON "comment_reads"("spot_id", "user_id");
CREATE UNIQUE INDEX "comment_reads_build_id_user_id_key" ON "comment_reads"("build_id", "user_id");

ALTER TABLE "comment_reads" ADD CONSTRAINT "comment_reads_spot_id_fkey" FOREIGN KEY ("spot_id") REFERENCES "spots"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "comment_reads" ADD CONSTRAINT "comment_reads_build_id_fkey" FOREIGN KEY ("build_id") REFERENCES "builds"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "comment_reads" ADD CONSTRAINT "comment_reads_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
