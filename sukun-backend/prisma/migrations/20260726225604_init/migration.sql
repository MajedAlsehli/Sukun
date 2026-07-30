-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('HOME_SEEKER', 'HOMEOWNER', 'TECHNICIAN', 'PROJECT_MANAGER', 'COMPANY');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "SearchJourneyStatus" AS ENUM ('CREATED', 'PREFERENCES_COMPLETED', 'RECOMMENDATIONS_GENERATED', 'VISITING', 'INSPECTING', 'PURCHASED', 'CLOSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "CompanyStatus" AS ENUM ('CREATED', 'VERIFIED', 'ACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "ProjectStatus" AS ENUM ('DRAFT', 'ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "BuildingStatus" AS ENUM ('DRAFT', 'ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "UnitStatus" AS ENUM ('AVAILABLE', 'RESERVED', 'DELIVERED', 'OCCUPIED');

-- CreateEnum
CREATE TYPE "VisitStatus" AS ENUM ('SCHEDULED', 'CONFIRMED', 'CHECKED_IN', 'CHECKED_OUT', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "InspectionReportStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'AI_PROCESSING', 'WAITING_MANUAL_REVIEW', 'ASSIGNED', 'REPAIR_IN_PROGRESS', 'WAITING_APPROVAL', 'REJECTED', 'CLOSED');

-- CreateEnum
CREATE TYPE "InspectionPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "AIAnalysisType" AS ENUM ('RECOMMENDATION', 'INSPECTION', 'WARRANTY', 'REPAIR_VALIDATION');

-- CreateEnum
CREATE TYPE "TechnicianStatus" AS ENUM ('INVITED', 'ACTIVATED', 'AVAILABLE', 'BUSY', 'INACTIVE');

-- CreateEnum
CREATE TYPE "ProjectManagerStatus" AS ENUM ('INVITED', 'ACTIVATED', 'ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "RepairStatus" AS ENUM ('ASSIGNED', 'ACCEPTED', 'IN_PROGRESS', 'WAITING_VALIDATION', 'WAITING_CUSTOMER_APPROVAL', 'COMPLETED', 'REJECTED');

-- CreateEnum
CREATE TYPE "RepairImageType" AS ENUM ('BEFORE', 'AFTER');

-- CreateEnum
CREATE TYPE "OwnershipStatus" AS ENUM ('ACTIVE', 'ENDED');

-- CreateEnum
CREATE TYPE "HomeownerActivationStatus" AS ENUM ('PENDING', 'ACTIVATED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "WarrantyReportStatus" AS ENUM ('AI_ANALYSIS', 'WAITING_MANUAL_REVIEW', 'ASSIGNED', 'REPAIR_IN_PROGRESS', 'WAITING_HOMEOWNER', 'REJECTED', 'CLOSED');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('PUSH', 'EMAIL', 'SMS');

-- CreateEnum
CREATE TYPE "NotificationStatus" AS ENUM ('QUEUED', 'SENT', 'DELIVERED', 'READ');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'HOME_SEEKER',
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "failed_login_attempts" INTEGER NOT NULL DEFAULT 0,
    "locked_until" TIMESTAMP(3),
    "company_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used_at" TIMESTAMP(3),
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "password_reset_tokens" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "password_reset_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "search_journeys" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "status" "SearchJourneyStatus" NOT NULL DEFAULT 'CREATED',
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closed_at" TIMESTAMP(3),

    CONSTRAINT "search_journeys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "companies" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "commercial_registration" TEXT NOT NULL,
    "status" "CompanyStatus" NOT NULL DEFAULT 'CREATED',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "companies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "projects" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "status" "ProjectStatus" NOT NULL DEFAULT 'DRAFT',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "buildings" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "status" "BuildingStatus" NOT NULL DEFAULT 'DRAFT',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "buildings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "units" (
    "id" TEXT NOT NULL,
    "building_id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "floor" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "status" "UnitStatus" NOT NULL DEFAULT 'AVAILABLE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "units_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "visits" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "unit_id" TEXT NOT NULL,
    "search_journey_id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "time" TEXT NOT NULL,
    "status" "VisitStatus" NOT NULL DEFAULT 'CONFIRMED',
    "checked_in_at" TIMESTAMP(3),
    "checked_out_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "visits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "files" (
    "id" TEXT NOT NULL,
    "storage_key" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "hash" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "files_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inspection_reports" (
    "id" TEXT NOT NULL,
    "visit_id" TEXT NOT NULL,
    "unit_id" TEXT NOT NULL,
    "search_journey_id" TEXT NOT NULL,
    "status" "InspectionReportStatus" NOT NULL DEFAULT 'SUBMITTED',
    "priority" "InspectionPriority",
    "location" TEXT NOT NULL,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inspection_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inspection_images" (
    "id" TEXT NOT NULL,
    "report_id" TEXT NOT NULL,
    "file_id" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inspection_images_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "technicians" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "status" "TechnicianStatus" NOT NULL DEFAULT 'INVITED',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "technicians_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_managers" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "status" "ProjectManagerStatus" NOT NULL DEFAULT 'INVITED',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "project_managers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "repairs" (
    "id" TEXT NOT NULL,
    "report_id" TEXT NOT NULL,
    "technician_id" TEXT NOT NULL,
    "status" "RepairStatus" NOT NULL DEFAULT 'ASSIGNED',
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "repairs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "repair_images" (
    "id" TEXT NOT NULL,
    "repair_id" TEXT NOT NULL,
    "type" "RepairImageType" NOT NULL,
    "file_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "repair_images_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_results" (
    "id" TEXT NOT NULL,
    "type" "AIAnalysisType" NOT NULL DEFAULT 'INSPECTION',
    "inspection_report_id" TEXT,
    "repair_id" TEXT,
    "warranty_report_id" TEXT,
    "request_id" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "confidence" INTEGER NOT NULL,
    "prediction" TEXT NOT NULL,
    "priority" "InspectionPriority",
    "suggested_repair" TEXT,
    "processing_time_ms" INTEGER NOT NULL,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_results_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ownerships" (
    "id" TEXT NOT NULL,
    "unit_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "start_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "end_date" TIMESTAMP(3),
    "status" "OwnershipStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ownerships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "homeowner_activations" (
    "id" TEXT NOT NULL,
    "unit_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "code_hash" TEXT NOT NULL,
    "status" "HomeownerActivationStatus" NOT NULL DEFAULT 'PENDING',
    "expires_at" TIMESTAMP(3) NOT NULL,
    "activated_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "homeowner_activations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "warranties" (
    "id" TEXT NOT NULL,
    "unit_id" TEXT NOT NULL,
    "start_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "end_date" TIMESTAMP(3) NOT NULL,
    "coverage" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "warranties_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "warranty_reports" (
    "id" TEXT NOT NULL,
    "warranty_id" TEXT NOT NULL,
    "unit_id" TEXT NOT NULL,
    "homeowner_id" TEXT NOT NULL,
    "reference_number" TEXT NOT NULL,
    "status" "WarrantyReportStatus" NOT NULL DEFAULT 'AI_ANALYSIS',
    "priority" "InspectionPriority",
    "category" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "warranty_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "warranty_images" (
    "id" TEXT NOT NULL,
    "report_id" TEXT NOT NULL,
    "file_id" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "warranty_images_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL DEFAULT 'PUSH',
    "status" "NotificationStatus" NOT NULL DEFAULT 'QUEUED',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "user_id" TEXT,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entity_id" TEXT,
    "ip_address" TEXT,
    "metadata" JSONB,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_phone_key" ON "users"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_token_hash_key" ON "refresh_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "refresh_tokens_user_id_idx" ON "refresh_tokens"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "password_reset_tokens_token_hash_key" ON "password_reset_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "password_reset_tokens_user_id_idx" ON "password_reset_tokens"("user_id");

-- CreateIndex
CREATE INDEX "search_journeys_user_id_idx" ON "search_journeys"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "companies_commercial_registration_key" ON "companies"("commercial_registration");

-- CreateIndex
CREATE UNIQUE INDEX "projects_code_key" ON "projects"("code");

-- CreateIndex
CREATE INDEX "projects_company_id_idx" ON "projects"("company_id");

-- CreateIndex
CREATE INDEX "buildings_project_id_idx" ON "buildings"("project_id");

-- CreateIndex
CREATE UNIQUE INDEX "buildings_project_id_number_key" ON "buildings"("project_id", "number");

-- CreateIndex
CREATE INDEX "units_building_id_idx" ON "units"("building_id");

-- CreateIndex
CREATE UNIQUE INDEX "units_building_id_number_key" ON "units"("building_id", "number");

-- CreateIndex
CREATE INDEX "visits_user_id_idx" ON "visits"("user_id");

-- CreateIndex
CREATE INDEX "visits_unit_id_idx" ON "visits"("unit_id");

-- CreateIndex
CREATE INDEX "visits_search_journey_id_idx" ON "visits"("search_journey_id");

-- CreateIndex
CREATE UNIQUE INDEX "files_storage_key_key" ON "files"("storage_key");

-- CreateIndex
CREATE INDEX "inspection_reports_visit_id_idx" ON "inspection_reports"("visit_id");

-- CreateIndex
CREATE INDEX "inspection_reports_unit_id_idx" ON "inspection_reports"("unit_id");

-- CreateIndex
CREATE INDEX "inspection_reports_search_journey_id_idx" ON "inspection_reports"("search_journey_id");

-- CreateIndex
CREATE INDEX "inspection_images_report_id_idx" ON "inspection_images"("report_id");

-- CreateIndex
CREATE UNIQUE INDEX "technicians_user_id_key" ON "technicians"("user_id");

-- CreateIndex
CREATE INDEX "technicians_project_id_idx" ON "technicians"("project_id");

-- CreateIndex
CREATE UNIQUE INDEX "project_managers_project_id_key" ON "project_managers"("project_id");

-- CreateIndex
CREATE UNIQUE INDEX "project_managers_user_id_key" ON "project_managers"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "repairs_report_id_key" ON "repairs"("report_id");

-- CreateIndex
CREATE INDEX "repairs_technician_id_idx" ON "repairs"("technician_id");

-- CreateIndex
CREATE INDEX "repair_images_repair_id_idx" ON "repair_images"("repair_id");

-- CreateIndex
CREATE INDEX "ai_results_inspection_report_id_idx" ON "ai_results"("inspection_report_id");

-- CreateIndex
CREATE INDEX "ai_results_repair_id_idx" ON "ai_results"("repair_id");

-- CreateIndex
CREATE INDEX "ai_results_warranty_report_id_idx" ON "ai_results"("warranty_report_id");

-- CreateIndex
CREATE INDEX "ownerships_unit_id_idx" ON "ownerships"("unit_id");

-- CreateIndex
CREATE INDEX "ownerships_user_id_idx" ON "ownerships"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "homeowner_activations_code_hash_key" ON "homeowner_activations"("code_hash");

-- CreateIndex
CREATE INDEX "homeowner_activations_unit_id_idx" ON "homeowner_activations"("unit_id");

-- CreateIndex
CREATE INDEX "homeowner_activations_user_id_idx" ON "homeowner_activations"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "warranties_unit_id_key" ON "warranties"("unit_id");

-- CreateIndex
CREATE UNIQUE INDEX "warranty_reports_reference_number_key" ON "warranty_reports"("reference_number");

-- CreateIndex
CREATE INDEX "warranty_reports_warranty_id_idx" ON "warranty_reports"("warranty_id");

-- CreateIndex
CREATE INDEX "warranty_reports_unit_id_idx" ON "warranty_reports"("unit_id");

-- CreateIndex
CREATE INDEX "warranty_reports_homeowner_id_idx" ON "warranty_reports"("homeowner_id");

-- CreateIndex
CREATE INDEX "warranty_images_report_id_idx" ON "warranty_images"("report_id");

-- CreateIndex
CREATE INDEX "notifications_user_id_idx" ON "notifications"("user_id");

-- CreateIndex
CREATE INDEX "audit_logs_user_id_idx" ON "audit_logs"("user_id");

-- CreateIndex
CREATE INDEX "audit_logs_entity_entity_id_idx" ON "audit_logs"("entity", "entity_id");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "search_journeys" ADD CONSTRAINT "search_journeys_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "buildings" ADD CONSTRAINT "buildings_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "units" ADD CONSTRAINT "units_building_id_fkey" FOREIGN KEY ("building_id") REFERENCES "buildings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visits" ADD CONSTRAINT "visits_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visits" ADD CONSTRAINT "visits_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visits" ADD CONSTRAINT "visits_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visits" ADD CONSTRAINT "visits_search_journey_id_fkey" FOREIGN KEY ("search_journey_id") REFERENCES "search_journeys"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inspection_reports" ADD CONSTRAINT "inspection_reports_visit_id_fkey" FOREIGN KEY ("visit_id") REFERENCES "visits"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inspection_reports" ADD CONSTRAINT "inspection_reports_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inspection_reports" ADD CONSTRAINT "inspection_reports_search_journey_id_fkey" FOREIGN KEY ("search_journey_id") REFERENCES "search_journeys"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inspection_images" ADD CONSTRAINT "inspection_images_report_id_fkey" FOREIGN KEY ("report_id") REFERENCES "inspection_reports"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inspection_images" ADD CONSTRAINT "inspection_images_file_id_fkey" FOREIGN KEY ("file_id") REFERENCES "files"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "technicians" ADD CONSTRAINT "technicians_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "technicians" ADD CONSTRAINT "technicians_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_managers" ADD CONSTRAINT "project_managers_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_managers" ADD CONSTRAINT "project_managers_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "repairs" ADD CONSTRAINT "repairs_report_id_fkey" FOREIGN KEY ("report_id") REFERENCES "inspection_reports"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "repairs" ADD CONSTRAINT "repairs_technician_id_fkey" FOREIGN KEY ("technician_id") REFERENCES "technicians"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "repair_images" ADD CONSTRAINT "repair_images_repair_id_fkey" FOREIGN KEY ("repair_id") REFERENCES "repairs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "repair_images" ADD CONSTRAINT "repair_images_file_id_fkey" FOREIGN KEY ("file_id") REFERENCES "files"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_results" ADD CONSTRAINT "ai_results_inspection_report_id_fkey" FOREIGN KEY ("inspection_report_id") REFERENCES "inspection_reports"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_results" ADD CONSTRAINT "ai_results_repair_id_fkey" FOREIGN KEY ("repair_id") REFERENCES "repairs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_results" ADD CONSTRAINT "ai_results_warranty_report_id_fkey" FOREIGN KEY ("warranty_report_id") REFERENCES "warranty_reports"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ownerships" ADD CONSTRAINT "ownerships_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ownerships" ADD CONSTRAINT "ownerships_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "homeowner_activations" ADD CONSTRAINT "homeowner_activations_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "homeowner_activations" ADD CONSTRAINT "homeowner_activations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warranties" ADD CONSTRAINT "warranties_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warranty_reports" ADD CONSTRAINT "warranty_reports_warranty_id_fkey" FOREIGN KEY ("warranty_id") REFERENCES "warranties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warranty_reports" ADD CONSTRAINT "warranty_reports_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warranty_reports" ADD CONSTRAINT "warranty_reports_homeowner_id_fkey" FOREIGN KEY ("homeowner_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warranty_images" ADD CONSTRAINT "warranty_images_report_id_fkey" FOREIGN KEY ("report_id") REFERENCES "warranty_reports"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "warranty_images" ADD CONSTRAINT "warranty_images_file_id_fkey" FOREIGN KEY ("file_id") REFERENCES "files"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
