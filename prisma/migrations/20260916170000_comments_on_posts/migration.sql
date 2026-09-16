-- AlterTable
ALTER TABLE "comment_reads" ADD COLUMN     "post_id" UUID;

-- AlterTable
ALTER TABLE "comments" ADD COLUMN     "post_id" UUID;

-- CreateIndex
CREATE UNIQUE INDEX "comment_reads_post_id_user_id_key" ON "comment_reads"("post_id", "user_id");

-- CreateIndex
CREATE INDEX "comments_post_id_created_at_idx" ON "comments"("post_id", "created_at");

-- AddForeignKey
ALTER TABLE "comments" ADD CONSTRAINT "comments_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comment_reads" ADD CONSTRAINT "comment_reads_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- A comment, and a read mark, still belong to exactly one subject — now a spot,
-- a build or a post. Prisma cannot express this, so the rule is widened by hand.
ALTER TABLE "comments" DROP CONSTRAINT "comments_one_subject";
ALTER TABLE "comments" ADD CONSTRAINT "comments_one_subject" CHECK (num_nonnulls("spot_id", "build_id", "post_id") = 1);
ALTER TABLE "comment_reads" DROP CONSTRAINT "comment_reads_one_subject";
ALTER TABLE "comment_reads" ADD CONSTRAINT "comment_reads_one_subject" CHECK (num_nonnulls("spot_id", "build_id", "post_id") = 1);
