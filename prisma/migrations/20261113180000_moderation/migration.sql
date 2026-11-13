-- An admin hides a post or a comment without deleting it.
ALTER TABLE "posts" ADD COLUMN "hidden_at" TIMESTAMP(3);
ALTER TABLE "comments" ADD COLUMN "hidden_at" TIMESTAMP(3);
