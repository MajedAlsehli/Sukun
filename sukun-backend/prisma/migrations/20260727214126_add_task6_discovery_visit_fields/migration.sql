-- CreateEnum
CREATE TYPE "ProjectReadiness" AS ENUM ('READY', 'UNDER_CONSTRUCTION', 'OFF_PLAN');

-- CreateEnum
CREATE TYPE "VisitIssueCategory" AS ENUM ('FINISHING', 'ELECTRICAL', 'PLUMBING', 'PLAN_MISMATCH', 'OTHER');

-- CreateEnum
CREATE TYPE "VisitSuitability" AS ENUM ('YES', 'SOMEWHAT', 'NO');

-- AlterTable
ALTER TABLE "projects" ADD COLUMN     "amenities" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "readiness" "ProjectReadiness";

-- AlterTable
ALTER TABLE "units" ADD COLUMN     "price" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "visits" ADD COLUMN     "last_rescheduled_at" TIMESTAMP(3),
ADD COLUMN     "reschedule_count" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "project_media" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "is_placeholder" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_media_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "saved_projects" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "saved_projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "visit_notes" (
    "id" TEXT NOT NULL,
    "visit_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "text" TEXT,
    "photo_url" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "visit_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "visit_issues" (
    "id" TEXT NOT NULL,
    "visit_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "category" "VisitIssueCategory" NOT NULL,
    "description" TEXT,
    "photo_url" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "visit_issues_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "visit_feedback" (
    "id" TEXT NOT NULL,
    "visit_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "comment" TEXT,
    "suitability" "VisitSuitability",
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "visit_feedback_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "project_media_project_id_idx" ON "project_media"("project_id");

-- CreateIndex
CREATE INDEX "saved_projects_user_id_idx" ON "saved_projects"("user_id");

-- CreateIndex
CREATE INDEX "saved_projects_project_id_idx" ON "saved_projects"("project_id");

-- CreateIndex
CREATE UNIQUE INDEX "saved_projects_user_id_project_id_key" ON "saved_projects"("user_id", "project_id");

-- CreateIndex
CREATE INDEX "visit_notes_visit_id_idx" ON "visit_notes"("visit_id");

-- CreateIndex
CREATE INDEX "visit_issues_visit_id_idx" ON "visit_issues"("visit_id");

-- CreateIndex
CREATE UNIQUE INDEX "visit_feedback_visit_id_key" ON "visit_feedback"("visit_id");

-- CreateIndex
CREATE INDEX "visit_feedback_user_id_idx" ON "visit_feedback"("user_id");

-- AddForeignKey
ALTER TABLE "project_media" ADD CONSTRAINT "project_media_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saved_projects" ADD CONSTRAINT "saved_projects_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saved_projects" ADD CONSTRAINT "saved_projects_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visit_notes" ADD CONSTRAINT "visit_notes_visit_id_fkey" FOREIGN KEY ("visit_id") REFERENCES "visits"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visit_notes" ADD CONSTRAINT "visit_notes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visit_issues" ADD CONSTRAINT "visit_issues_visit_id_fkey" FOREIGN KEY ("visit_id") REFERENCES "visits"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visit_issues" ADD CONSTRAINT "visit_issues_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visit_feedback" ADD CONSTRAINT "visit_feedback_visit_id_fkey" FOREIGN KEY ("visit_id") REFERENCES "visits"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visit_feedback" ADD CONSTRAINT "visit_feedback_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
