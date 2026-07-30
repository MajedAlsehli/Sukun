-- CreateTable
CREATE TABLE "sakani_projects" (
    "id" INTEGER NOT NULL,
    "external_id" TEXT NOT NULL,
    "project_code" TEXT,
    "project_name" TEXT NOT NULL,
    "project_type" TEXT,
    "developer_name" TEXT,
    "city" TEXT,
    "city_id" INTEGER,
    "region" TEXT,
    "region_id" INTEGER,
    "lat" DOUBLE PRECISION,
    "lon" DOUBLE PRECISION,
    "min_price" DOUBLE PRECISION,
    "max_price" DOUBLE PRECISION,
    "marketplace_price" DOUBLE PRECISION,
    "available_units_count" INTEGER,
    "unit_types" TEXT[],
    "raw" JSONB NOT NULL,
    "fetched_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sakani_projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sakani_units" (
    "id" INTEGER NOT NULL,
    "unit_code" TEXT,
    "unit_type" TEXT,
    "unit_size" DOUBLE PRECISION,
    "living_area" DOUBLE PRECISION,
    "price" DOUBLE PRECISION,
    "moh_price" DOUBLE PRECISION,
    "bedroom_count" INTEGER,
    "bathroom_count" INTEGER,
    "floor" INTEGER,
    "apartment_number" TEXT,
    "block_number" TEXT,
    "building_number" TEXT,
    "status" TEXT,
    "target_segments" TEXT[],
    "project_id" INTEGER,
    "lat" DOUBLE PRECISION,
    "lon" DOUBLE PRECISION,
    "raw" JSONB NOT NULL,
    "fetched_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sakani_units_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sakani_price_ranges" (
    "id" TEXT NOT NULL,
    "city_id" INTEGER,
    "region_id" INTEGER,
    "project_type" TEXT,
    "max_price" DOUBLE PRECISION,
    "max_rental_price" DOUBLE PRECISION,
    "fetched_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sakani_price_ranges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sakani_sync_logs" (
    "id" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "record_count" INTEGER NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL,
    "finished_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sakani_sync_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "sakani_projects_external_id_key" ON "sakani_projects"("external_id");

-- CreateIndex
CREATE INDEX "sakani_units_project_id_idx" ON "sakani_units"("project_id");

-- AddForeignKey
ALTER TABLE "sakani_units" ADD CONSTRAINT "sakani_units_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "sakani_projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
