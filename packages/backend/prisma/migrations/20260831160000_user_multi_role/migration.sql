-- Multi-role accounts: a person holds a *set* of roles, not one. Permissions
-- are the union across the set — see `hasPermission` in `@redinfo/shared`.
-- There is no primary role, so nothing here preserves ordering beyond the
-- canonical one `normalizeRoles` writes going forward.
--
-- Same shape as `20260310000000_role_model`: the enum type itself is reused
-- untouched (`NoticeTargetRole.role` and `AvailabilityWindowRole` still
-- depend on it — those are unrelated "role within a schedule slot" concepts,
-- not this one), only `User`'s own role column changes.
--
-- ⚠️ Irreversible: step 4 drops `role`. There is no down migration; restoring
-- a single role per user requires a pre-migration backup.

-- 1. New column. Defaulted so the NOT NULL holds for the moment between
--    ADD COLUMN and the backfill, and so the value matches the
--    `@default([EMERGENCY_OPERATIONAL])` Prisma now expects.
ALTER TABLE "User"
  ADD COLUMN "roles" "UserRole"[] NOT NULL DEFAULT ARRAY['EMERGENCY_OPERATIONAL']::"UserRole"[];

-- 2. Backfill: every existing person keeps exactly the one role they had.
--    `role` is NOT NULL, so there is no null case to handle.
UPDATE "User" SET "roles" = ARRAY["role"];

-- 3. Named explicitly rather than left to an implicit drop, so the loss of
--    the composite index is visible in the diff. A btree index cannot serve
--    `roles && ARRAY[...]` the way it served `role = ...`; `isActive` is the
--    selective half of the roster queries that used it and keeps its own
--    index.
DROP INDEX IF EXISTS "User_isActive_role_idx";
CREATE INDEX "User_isActive_idx" ON "User"("isActive");

-- 4. The scalar column is gone. Nothing reads a "primary role".
ALTER TABLE "User" DROP COLUMN "role";
