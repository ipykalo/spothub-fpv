-- CreateTable
CREATE TABLE "pilot_blocks" (
    "blocker_id" UUID NOT NULL,
    "blocked_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pilot_blocks_pkey" PRIMARY KEY ("blocker_id","blocked_id")
);

-- CreateIndex
CREATE INDEX "pilot_blocks_blocked_id_idx" ON "pilot_blocks"("blocked_id");

-- AddForeignKey
ALTER TABLE "pilot_blocks" ADD CONSTRAINT "pilot_blocks_blocker_id_fkey" FOREIGN KEY ("blocker_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pilot_blocks" ADD CONSTRAINT "pilot_blocks_blocked_id_fkey" FOREIGN KEY ("blocked_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Nobody blocks themselves; Prisma cannot express this, so it lives here.
ALTER TABLE "pilot_blocks" ADD CONSTRAINT "pilot_blocks_not_self" CHECK ("blocker_id" <> "blocked_id");
