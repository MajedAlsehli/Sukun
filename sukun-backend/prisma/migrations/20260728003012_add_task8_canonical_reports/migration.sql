-- CreateEnum
CREATE TYPE "ReportCategory" AS ENUM ('PLUMBING', 'ELECTRICAL', 'CRACKS', 'PAINT', 'DOORS', 'WINDOWS', 'FLOORING', 'CEILINGS', 'OTHER');

-- CreateEnum
CREATE TYPE "ReportPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateEnum
CREATE TYPE "ReportPrioritySource" AS ENUM ('AI', 'MANUAL_DEFAULT');

-- CreateEnum
CREATE TYPE "ReportStatus" AS ENUM ('ROUTING_PENDING', 'ROUTED', 'IN_PROGRESS', 'AWAITING_OWNER_APPROVAL', 'CLOSED');

-- CreateEnum
CREATE TYPE "ReportWarrantyVerdict" AS ENUM ('COVERED', 'NOT_COVERED', 'NOT_CONFIGURED', 'NO_WARRANTY', 'NOT_EVALUATED_LEGACY');

-- CreateEnum
CREATE TYPE "ReportRoutingState" AS ENUM ('PENDING', 'ROUTED');

-- CreateEnum
CREATE TYPE "ReportMediaStage" AS ENUM ('HOMEOWNER', 'BEFORE', 'AFTER');

-- CreateEnum
CREATE TYPE "ReportRepairStatus" AS ENUM ('IN_PROGRESS', 'SUBMITTED', 'APPROVED', 'REOPENED');

-- CreateEnum
CREATE TYPE "ReportActorType" AS ENUM ('HOMEOWNER', 'TECHNICIAN', 'SYSTEM', 'AI');

-- CreateEnum
CREATE TYPE "ReportTimelineEventType" AS ENUM ('REPORT_CREATED', 'AI_ANALYSIS_RECORDED', 'AI_ANALYSIS_UNAVAILABLE', 'WARRANTY_EVALUATED', 'ROUTING_PENDING_RECORDED', 'TECHNICIAN_ASSIGNED', 'ROUTING_RETRIED', 'REPAIR_STARTED', 'REPAIR_MEDIA_ADDED', 'REPAIR_SUBMITTED', 'HOMEOWNER_APPROVED', 'HOMEOWNER_REOPENED', 'REPORT_CLOSED', 'REVIEW_SUBMITTED', 'LEGACY_IMPORTED');

-- CreateEnum
CREATE TYPE "ReportOrigin" AS ENUM ('HOMEOWNER', 'LEGACY_WARRANTY_REPORT');

-- AlterTable
ALTER TABLE "technicians" ADD COLUMN     "last_assigned_at" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "reports" (
    "id" TEXT NOT NULL,
    "report_number" SERIAL NOT NULL,
    "homeowner_id" TEXT NOT NULL,
    "ownership_id" TEXT NOT NULL,
    "unit_id" TEXT NOT NULL,
    "building_id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "category" "ReportCategory" NOT NULL,
    "category_confirmed_by_user" BOOLEAN NOT NULL DEFAULT true,
    "problem_text" TEXT NOT NULL,
    "homeowner_note" TEXT,
    "analysis_id" TEXT,
    "ai_suggested_category" "ReportCategory",
    "ai_confidence" INTEGER,
    "ai_problem_text" TEXT,
    "ai_explanation" TEXT,
    "ai_provider" TEXT,
    "ai_model" TEXT,
    "priority" "ReportPriority" NOT NULL,
    "priority_source" "ReportPrioritySource" NOT NULL DEFAULT 'AI',
    "warranty_verdict" "ReportWarrantyVerdict" NOT NULL,
    "warranty_reason_code" TEXT NOT NULL,
    "warranty_category_key" TEXT,
    "warranty_rules_version" TEXT NOT NULL,
    "warranty_evaluated_at" TIMESTAMP(3) NOT NULL,
    "warranty_period_start" TIMESTAMP(3),
    "warranty_period_end" TIMESTAMP(3),
    "status" "ReportStatus" NOT NULL DEFAULT 'ROUTING_PENDING',
    "routing_state" "ReportRoutingState" NOT NULL DEFAULT 'PENDING',
    "routing_reason_code" TEXT,
    "routing_attempt_count" INTEGER NOT NULL DEFAULT 0,
    "last_routing_attempt_at" TIMESTAMP(3),
    "assigned_technician_id" TEXT,
    "original_technician_id" TEXT,
    "assigned_at" TIMESTAMP(3),
    "sla_start_due_at" TIMESTAMP(3),
    "sla_rules_version" TEXT NOT NULL,
    "reopen_count" INTEGER NOT NULL DEFAULT 0,
    "origin" "ReportOrigin" NOT NULL DEFAULT 'HOMEOWNER',
    "legacy_warranty_report_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "closed_at" TIMESTAMP(3),

    CONSTRAINT "reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "report_media" (
    "id" TEXT NOT NULL,
    "report_id" TEXT NOT NULL,
    "stage" "ReportMediaStage" NOT NULL,
    "storage_key" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "uploaded_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "report_media_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "report_repairs" (
    "id" TEXT NOT NULL,
    "report_id" TEXT NOT NULL,
    "technician_id" TEXT NOT NULL,
    "status" "ReportRepairStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "started_at" TIMESTAMP(3) NOT NULL,
    "submitted_at" TIMESTAMP(3),
    "homeowner_decision_at" TIMESTAMP(3),
    "technician_note" TEXT,
    "homeowner_reopen_reason" TEXT,
    "duration_minutes" INTEGER,
    "reopen_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "report_repairs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "report_timeline_events" (
    "id" TEXT NOT NULL,
    "report_id" TEXT NOT NULL,
    "type" "ReportTimelineEventType" NOT NULL,
    "actorType" "ReportActorType" NOT NULL,
    "actor_id" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "report_timeline_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "report_reviews" (
    "id" TEXT NOT NULL,
    "report_id" TEXT NOT NULL,
    "report_repair_id" TEXT NOT NULL,
    "technician_id" TEXT NOT NULL,
    "homeowner_id" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "comment" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "report_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "report_analyses" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "suggested_category" "ReportCategory" NOT NULL,
    "problem_text" TEXT NOT NULL,
    "priority" "ReportPriority" NOT NULL,
    "confidence" INTEGER NOT NULL,
    "explanation" TEXT NOT NULL,
    "media_keys" TEXT[],
    "detections" JSONB,
    "consumed_by_report_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "report_analyses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "reports_report_number_key" ON "reports"("report_number");

-- CreateIndex
CREATE UNIQUE INDEX "reports_analysis_id_key" ON "reports"("analysis_id");

-- CreateIndex
CREATE UNIQUE INDEX "reports_legacy_warranty_report_id_key" ON "reports"("legacy_warranty_report_id");

-- CreateIndex
CREATE INDEX "reports_homeowner_id_created_at_idx" ON "reports"("homeowner_id", "created_at");

-- CreateIndex
CREATE INDEX "reports_project_id_status_idx" ON "reports"("project_id", "status");

-- CreateIndex
CREATE INDEX "reports_unit_id_idx" ON "reports"("unit_id");

-- CreateIndex
CREATE INDEX "reports_building_id_idx" ON "reports"("building_id");

-- CreateIndex
CREATE INDEX "reports_assigned_technician_id_status_idx" ON "reports"("assigned_technician_id", "status");

-- CreateIndex
CREATE INDEX "reports_status_idx" ON "reports"("status");

-- CreateIndex
CREATE INDEX "reports_ownership_id_idx" ON "reports"("ownership_id");

-- CreateIndex
CREATE INDEX "report_media_report_id_stage_sort_order_idx" ON "report_media"("report_id", "stage", "sort_order");

-- CreateIndex
CREATE UNIQUE INDEX "report_repairs_report_id_key" ON "report_repairs"("report_id");

-- CreateIndex
CREATE INDEX "report_repairs_technician_id_status_idx" ON "report_repairs"("technician_id", "status");

-- CreateIndex
CREATE INDEX "report_timeline_events_report_id_created_at_id_idx" ON "report_timeline_events"("report_id", "created_at", "id");

-- CreateIndex
CREATE UNIQUE INDEX "report_reviews_report_id_key" ON "report_reviews"("report_id");

-- CreateIndex
CREATE UNIQUE INDEX "report_reviews_report_repair_id_key" ON "report_reviews"("report_repair_id");

-- CreateIndex
CREATE INDEX "report_reviews_technician_id_created_at_idx" ON "report_reviews"("technician_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "report_analyses_consumed_by_report_id_key" ON "report_analyses"("consumed_by_report_id");

-- CreateIndex
CREATE INDEX "report_analyses_user_id_created_at_idx" ON "report_analyses"("user_id", "created_at");

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_homeowner_id_fkey" FOREIGN KEY ("homeowner_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_ownership_id_fkey" FOREIGN KEY ("ownership_id") REFERENCES "ownerships"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_building_id_fkey" FOREIGN KEY ("building_id") REFERENCES "buildings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_assigned_technician_id_fkey" FOREIGN KEY ("assigned_technician_id") REFERENCES "technicians"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_original_technician_id_fkey" FOREIGN KEY ("original_technician_id") REFERENCES "technicians"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_analysis_id_fkey" FOREIGN KEY ("analysis_id") REFERENCES "report_analyses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_legacy_warranty_report_id_fkey" FOREIGN KEY ("legacy_warranty_report_id") REFERENCES "warranty_reports"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_media" ADD CONSTRAINT "report_media_report_id_fkey" FOREIGN KEY ("report_id") REFERENCES "reports"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_media" ADD CONSTRAINT "report_media_uploaded_by_id_fkey" FOREIGN KEY ("uploaded_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_repairs" ADD CONSTRAINT "report_repairs_report_id_fkey" FOREIGN KEY ("report_id") REFERENCES "reports"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_repairs" ADD CONSTRAINT "report_repairs_technician_id_fkey" FOREIGN KEY ("technician_id") REFERENCES "technicians"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_timeline_events" ADD CONSTRAINT "report_timeline_events_report_id_fkey" FOREIGN KEY ("report_id") REFERENCES "reports"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_timeline_events" ADD CONSTRAINT "report_timeline_events_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_reviews" ADD CONSTRAINT "report_reviews_report_id_fkey" FOREIGN KEY ("report_id") REFERENCES "reports"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_reviews" ADD CONSTRAINT "report_reviews_report_repair_id_fkey" FOREIGN KEY ("report_repair_id") REFERENCES "report_repairs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_reviews" ADD CONSTRAINT "report_reviews_technician_id_fkey" FOREIGN KEY ("technician_id") REFERENCES "technicians"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_reviews" ADD CONSTRAINT "report_reviews_homeowner_id_fkey" FOREIGN KEY ("homeowner_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_analyses" ADD CONSTRAINT "report_analyses_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Task 8 (docs/integration/decisions.md I8): DB-level enforcement of
-- "a technician may have at most one ACTIVE canonical repair" - a partial
-- unique index, not expressible in Prisma's schema DSL. This is the real
-- safety net under concurrent requests; the service-layer pre-check exists
-- only to turn a raw constraint violation into a friendly
-- 409 ACTIVE_REPAIR_EXISTS carrying the blocking report's id/number (C1).
--
-- Only IN_PROGRESS counts as active (decisions.md I2): a technician may hold
-- any number of SUBMITTED/APPROVED/REOPENED rows, and a homeowner's reopen
-- (which sets REOPENED, not IN_PROGRESS) can therefore never be blocked by,
-- or silently violate, this lock. Same pattern as Task 5's
-- `ownerships_active_unit_unique`.
CREATE UNIQUE INDEX "report_repairs_active_technician_unique"
  ON "report_repairs"("technician_id")
  WHERE "status" = 'IN_PROGRESS';

-- Task 8 (decisions.md I13): ratings are 1-5 everywhere the reference renders
-- them (H9's 5-star picker, C3's history rows, RE5's reviews tab). Enforced at
-- the database as well as in the Zod schema so no code path can persist a 0
-- or a 6 - reviews feed real technician averages (I14) and a bad row would
-- silently corrupt them.
ALTER TABLE "report_reviews"
  ADD CONSTRAINT "report_reviews_rating_range" CHECK ("rating" >= 1 AND "rating" <= 5);

-- Task 8 (decisions.md I6): AI confidence is 0-100 (AI-011). Clamped in code
-- (clampConfidence) and enforced here too, for the same reason as above.
ALTER TABLE "reports"
  ADD CONSTRAINT "reports_ai_confidence_range" CHECK ("ai_confidence" IS NULL OR ("ai_confidence" >= 0 AND "ai_confidence" <= 100));

ALTER TABLE "report_analyses"
  ADD CONSTRAINT "report_analyses_confidence_range" CHECK ("confidence" >= 0 AND "confidence" <= 100);

-- Task 8 (decisions.md I1): cosmetic only. Every reference screen renders a
-- four-digit report number ("#2418"), so the sequence starts at 1001 rather
-- than 1. Uniqueness is guaranteed by the sequence + the unique index above,
-- never by this starting value. Guarded so re-running on a database that
-- already has reports cannot rewind the sequence.
DO $$
BEGIN
  IF (SELECT COUNT(*) FROM "reports") = 0 THEN
    PERFORM setval(pg_get_serial_sequence('reports', 'report_number'), 1000, true);
  END IF;
END
$$;
