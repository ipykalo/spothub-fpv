-- YouTube videos on a build. Only the video's id and start time are kept,
-- never the pasted address; the CHECK holds the id to YouTube's alphabet, so
-- nothing but a YouTube video can be stored here, whatever writes the row.
CREATE TABLE "build_videos" (
    "id" UUID NOT NULL,
    "build_id" UUID NOT NULL,
    "youtube_id" VARCHAR(11) NOT NULL,
    "start_s" INTEGER,
    "title" VARCHAR(80),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "build_videos_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "build_videos_youtube_id_check" CHECK ("youtube_id" ~ '^[A-Za-z0-9_-]{11}$')
);

CREATE INDEX "build_videos_build_id_created_at_idx" ON "build_videos"("build_id", "created_at");

ALTER TABLE "build_videos" ADD CONSTRAINT "build_videos_build_id_fkey" FOREIGN KEY ("build_id") REFERENCES "builds"("id") ON DELETE CASCADE ON UPDATE CASCADE;
