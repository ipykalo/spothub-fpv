-- CreateEnum
CREATE TYPE "ReportReason" AS ENUM ('SPAM', 'ABUSE', 'ILLEGAL', 'OTHER');

-- CreateTable
CREATE TABLE "reports" (
    "id" UUID NOT NULL,
    "reporter_id" UUID NOT NULL,
    "post_id" UUID,
    "comment_id" UUID,
    "reason" "ReportReason" NOT NULL,
    "details" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMP(3),
    "resolved_by_id" UUID,

    CONSTRAINT "reports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "reports_reporter_id_post_id_key" ON "reports"("reporter_id", "post_id");

-- CreateIndex
CREATE UNIQUE INDEX "reports_reporter_id_comment_id_key" ON "reports"("reporter_id", "comment_id");

-- CreateIndex
CREATE INDEX "reports_resolved_at_created_at_idx" ON "reports"("resolved_at", "created_at");

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_reporter_id_fkey" FOREIGN KEY ("reporter_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_resolved_by_id_fkey" FOREIGN KEY ("resolved_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_comment_id_fkey" FOREIGN KEY ("comment_id") REFERENCES "comments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- A report is about exactly one post or comment; Prisma cannot express this, so it lives here.
ALTER TABLE "reports" ADD CONSTRAINT "reports_one_subject" CHECK (num_nonnulls("post_id", "comment_id") = 1);
