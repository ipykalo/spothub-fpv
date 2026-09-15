-- CreateTable
CREATE TABLE "spot_comments" (
    "id" UUID NOT NULL,
    "spot_id" UUID NOT NULL,
    "author_id" UUID NOT NULL,
    "parent_id" UUID,
    "body" TEXT NOT NULL,
    "is_answer" BOOLEAN NOT NULL DEFAULT false,
    "edited_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "spot_comments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "spot_comment_reads" (
    "spot_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "read_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "spot_comment_reads_pkey" PRIMARY KEY ("spot_id","user_id")
);

-- CreateIndex
CREATE INDEX "spot_comments_spot_id_created_at_idx" ON "spot_comments"("spot_id", "created_at");

-- CreateIndex
CREATE INDEX "spot_comments_parent_id_idx" ON "spot_comments"("parent_id");

-- AddForeignKey
ALTER TABLE "spot_comments" ADD CONSTRAINT "spot_comments_spot_id_fkey" FOREIGN KEY ("spot_id") REFERENCES "spots"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "spot_comments" ADD CONSTRAINT "spot_comments_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "spot_comments" ADD CONSTRAINT "spot_comments_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "spot_comments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "spot_comment_reads" ADD CONSTRAINT "spot_comment_reads_spot_id_fkey" FOREIGN KEY ("spot_id") REFERENCES "spots"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "spot_comment_reads" ADD CONSTRAINT "spot_comment_reads_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
