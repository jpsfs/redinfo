-- Drop the default value first (was 'VOLUNTEER'::"UserRole") so the enum type can be dropped
ALTER TABLE "User" ALTER COLUMN role DROP DEFAULT;

-- Decouple the column from the enum type to allow recreation
ALTER TABLE "User" ALTER COLUMN role TYPE text;

-- Remove old enum
DROP TYPE "UserRole";

-- Create the new role enum
CREATE TYPE "UserRole" AS ENUM ('SYSTEM_ADMIN', 'EMERGENCY_OPERATIONAL', 'EMERGENCY_COORDINATOR', 'LOGISTICS_COORDINATOR');

-- Migrate existing data to equivalent new roles
UPDATE "User" SET role = 'SYSTEM_ADMIN' WHERE role = 'ADMIN';
UPDATE "User" SET role = 'EMERGENCY_COORDINATOR' WHERE role = 'STAFF';
UPDATE "User" SET role = 'EMERGENCY_OPERATIONAL' WHERE role = 'VOLUNTEER';

-- Restore typed column with new enum and updated default
ALTER TABLE "User" ALTER COLUMN role TYPE "UserRole" USING role::"UserRole";
ALTER TABLE "User" ALTER COLUMN role SET DEFAULT 'EMERGENCY_OPERATIONAL';
