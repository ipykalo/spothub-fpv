-- A question its asker deleted after others replied keeps its row, with the
-- words cleared, so the replies under it stay.
ALTER TABLE "comments" ADD COLUMN "deleted_at" TIMESTAMP(3);
