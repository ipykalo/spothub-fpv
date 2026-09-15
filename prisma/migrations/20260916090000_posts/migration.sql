-- CreateTable
CREATE TABLE "posts" (
    "id" UUID NOT NULL,
    "author_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "summary" TEXT,
    "body_md" TEXT NOT NULL DEFAULT '',
    "visibility" "Visibility" NOT NULL DEFAULT 'PRIVATE',
    "published_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "posts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "post_builds" (
    "post_id" UUID NOT NULL,
    "build_id" UUID NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "post_builds_pkey" PRIMARY KEY ("post_id","build_id")
);

-- CreateIndex
CREATE INDEX "posts_author_id_updated_at_idx" ON "posts"("author_id", "updated_at");

-- CreateIndex
CREATE INDEX "posts_visibility_published_at_idx" ON "posts"("visibility", "published_at");

-- CreateIndex
CREATE UNIQUE INDEX "posts_author_id_slug_key" ON "posts"("author_id", "slug");

-- CreateIndex
CREATE INDEX "post_builds_build_id_idx" ON "post_builds"("build_id");

-- AddForeignKey
ALTER TABLE "posts" ADD CONSTRAINT "posts_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post_builds" ADD CONSTRAINT "post_builds_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post_builds" ADD CONSTRAINT "post_builds_build_id_fkey" FOREIGN KEY ("build_id") REFERENCES "builds"("id") ON DELETE CASCADE ON UPDATE CASCADE;

