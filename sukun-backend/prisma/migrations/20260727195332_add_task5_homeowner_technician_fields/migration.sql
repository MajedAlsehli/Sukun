-- AlterTable
ALTER TABLE "ownerships" ADD COLUMN     "end_reason" TEXT;

-- AlterTable
ALTER TABLE "technicians" ADD COLUMN     "specialty" TEXT;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "national_id" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "users_national_id_key" ON "users"("national_id");


-- Task 5 (decisions.md F4): DB-level enforcement of "at most one ACTIVE
-- ownership per unit" - a partial unique index, not expressible in Prisma's
-- schema DSL. Multiple ENDED rows per unit remain fully allowed (that's the
-- ownership history); two concurrent ACTIVE rows for the same unit now fail
-- at the database, closing the race the existing app-level pre-check narrows
-- but cannot fully eliminate under concurrent requests.
CREATE UNIQUE INDEX "ownerships_active_unit_unique" ON "ownerships"("unit_id") WHERE "status" = 'ACTIVE';
