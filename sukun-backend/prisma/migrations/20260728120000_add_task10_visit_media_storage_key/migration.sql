-- Task 10 (docs/integration/decisions.md K3).
--
-- Visit note/issue photos moved from the PUBLIC Supabase Storage bucket to the
-- PRIVATE one. A private object has no durable public URL - only a short-lived
-- signed URL - so the durable reference has to be the storage KEY.
--
-- Strictly additive: two nullable columns, no data rewritten, no column
-- dropped, no constraint changed. Rows written before this migration keep
-- their existing `photo_url` and simply have a NULL key.

ALTER TABLE "visit_notes" ADD COLUMN "photo_storage_key" TEXT;
ALTER TABLE "visit_issues" ADD COLUMN "photo_storage_key" TEXT;
