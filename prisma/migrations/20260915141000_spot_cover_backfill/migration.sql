-- Backfill: queue a cover for every spot that already had a YouTube video
-- before covers existed. Data, not schema, but derived from rows already in
-- the table rather than invented, so it belongs in the one place that runs
-- once per database. The spot.cover job is idempotent and leaves alone a spot
-- whose video has changed since, so it is safe for these to run late.
INSERT INTO "jobs" ("id", "type", "payload", "updated_at")
SELECT
  gen_random_uuid(),
  'spot.cover',
  jsonb_build_object(
    'ownerId', "owner_id",
    'spotId', "id",
    'youtubeId', "youtube_video_id"
  ),
  CURRENT_TIMESTAMP
FROM "spots"
WHERE "youtube_video_id" IS NOT NULL
  AND "cover_storage_key" IS NULL;
