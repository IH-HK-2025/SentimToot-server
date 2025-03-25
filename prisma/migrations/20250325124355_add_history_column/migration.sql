-- AlterTable
ALTER TABLE "users" ADD COLUMN     "history" TEXT[] DEFAULT ARRAY[]::TEXT[];
