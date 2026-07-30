-- DropForeignKey
ALTER TABLE "project_managers" DROP CONSTRAINT "project_managers_project_id_fkey";

-- AlterTable
ALTER TABLE "buildings" ADD COLUMN     "is_active" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "project_managers" ALTER COLUMN "project_id" DROP NOT NULL;

-- AlterTable
ALTER TABLE "projects" ADD COLUMN     "cover_image_key" TEXT,
ADD COLUMN     "cover_image_url" TEXT,
ADD COLUMN     "description" TEXT,
ADD COLUMN     "district" TEXT,
ADD COLUMN     "external_id" TEXT,
ADD COLUMN     "is_active" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "last_synced_at" TIMESTAMP(3),
ADD COLUMN     "primary_contractor_id" TEXT,
ADD COLUMN     "source" TEXT NOT NULL DEFAULT 'MANUAL',
ADD COLUMN     "source_updated_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "units" ADD COLUMN     "area" DOUBLE PRECISION,
ADD COLUMN     "bathrooms" INTEGER,
ADD COLUMN     "bedrooms" INTEGER,
ADD COLUMN     "external_id" TEXT,
ADD COLUMN     "last_synced_at" TIMESTAMP(3),
ADD COLUMN     "parking_spots" INTEGER,
ADD COLUMN     "source" TEXT NOT NULL DEFAULT 'MANUAL',
ADD COLUMN     "source_updated_at" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "contractor_organizations" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contractor_organizations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "contractor_organizations_company_id_idx" ON "contractor_organizations"("company_id");

-- CreateIndex
CREATE UNIQUE INDEX "contractor_organizations_company_id_name_key" ON "contractor_organizations"("company_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "projects_external_id_key" ON "projects"("external_id");

-- CreateIndex
CREATE INDEX "projects_primary_contractor_id_idx" ON "projects"("primary_contractor_id");

-- CreateIndex
CREATE UNIQUE INDEX "units_external_id_key" ON "units"("external_id");

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_primary_contractor_id_fkey" FOREIGN KEY ("primary_contractor_id") REFERENCES "contractor_organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contractor_organizations" ADD CONSTRAINT "contractor_organizations_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_managers" ADD CONSTRAINT "project_managers_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

