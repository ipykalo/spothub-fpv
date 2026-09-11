-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('QUEUED', 'RUNNING', 'DONE', 'FAILED');

-- CreateEnum
CREATE TYPE "LogFormat" AS ENUM ('EDGETX_CSV');

-- CreateEnum
CREATE TYPE "LogFileStatus" AS ENUM ('PENDING', 'PARSED', 'FAILED');

-- CreateEnum
CREATE TYPE "LogImportStatus" AS ENUM ('QUEUED', 'RUNNING', 'DONE', 'FAILED');

-- CreateTable
CREATE TABLE "jobs" (
    "id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "status" "JobStatus" NOT NULL DEFAULT 'QUEUED',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "max_attempts" INTEGER NOT NULL DEFAULT 3,
    "run_after" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "locked_at" TIMESTAMP(3),
    "last_error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "log_imports" (
    "id" UUID NOT NULL,
    "owner_id" UUID NOT NULL,
    "build_id" UUID,
    "status" "LogImportStatus" NOT NULL DEFAULT 'QUEUED',
    "flight_count" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMP(3),

    CONSTRAINT "log_imports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "log_files" (
    "id" UUID NOT NULL,
    "owner_id" UUID NOT NULL,
    "import_id" UUID,
    "format" "LogFormat" NOT NULL DEFAULT 'EDGETX_CSV',
    "status" "LogFileStatus" NOT NULL DEFAULT 'PENDING',
    "storage_key" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "checksum" TEXT NOT NULL,
    "model_name" TEXT,
    "flight_count" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "log_files_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" UUID NOT NULL,
    "owner_id" UUID NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL,
    "ended_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "flights" (
    "id" UUID NOT NULL,
    "owner_id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "build_id" UUID,
    "log_file_id" UUID NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL,
    "ended_at" TIMESTAMP(3) NOT NULL,
    "duration_s" INTEGER NOT NULL,
    "sample_count" INTEGER NOT NULL,
    "start_voltage" DOUBLE PRECISION,
    "min_voltage" DOUBLE PRECISION,
    "end_voltage" DOUBLE PRECISION,
    "mah_used" INTEGER,
    "max_current_a" DOUBLE PRECISION,
    "min_link_quality" INTEGER,
    "has_gps" BOOLEAN NOT NULL DEFAULT false,
    "distance_m" DOUBLE PRECISION,
    "max_altitude_m" DOUBLE PRECISION,
    "max_speed_kmh" DOUBLE PRECISION,
    "max_home_distance_m" DOUBLE PRECISION,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "flights_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "jobs_status_run_after_idx" ON "jobs"("status", "run_after");

-- CreateIndex
CREATE INDEX "log_imports_owner_id_created_at_idx" ON "log_imports"("owner_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "log_files_storage_key_key" ON "log_files"("storage_key");

-- CreateIndex
CREATE INDEX "log_files_import_id_idx" ON "log_files"("import_id");

-- CreateIndex
CREATE UNIQUE INDEX "log_files_owner_id_checksum_key" ON "log_files"("owner_id", "checksum");

-- CreateIndex
CREATE INDEX "sessions_owner_id_started_at_idx" ON "sessions"("owner_id", "started_at");

-- CreateIndex
CREATE INDEX "flights_owner_id_started_at_idx" ON "flights"("owner_id", "started_at");

-- CreateIndex
CREATE INDEX "flights_session_id_idx" ON "flights"("session_id");

-- CreateIndex
CREATE INDEX "flights_build_id_idx" ON "flights"("build_id");

-- CreateIndex
CREATE UNIQUE INDEX "flights_log_file_id_started_at_key" ON "flights"("log_file_id", "started_at");

-- AddForeignKey
ALTER TABLE "log_imports" ADD CONSTRAINT "log_imports_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "log_files" ADD CONSTRAINT "log_files_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "log_files" ADD CONSTRAINT "log_files_import_id_fkey" FOREIGN KEY ("import_id") REFERENCES "log_imports"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "flights" ADD CONSTRAINT "flights_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "flights" ADD CONSTRAINT "flights_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "flights" ADD CONSTRAINT "flights_build_id_fkey" FOREIGN KEY ("build_id") REFERENCES "builds"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "flights" ADD CONSTRAINT "flights_log_file_id_fkey" FOREIGN KEY ("log_file_id") REFERENCES "log_files"("id") ON DELETE CASCADE ON UPDATE CASCADE;
