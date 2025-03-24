/*
  Warnings:

  - The primary key for the `toots` table will be changed. If it partially fails, the table could be left without primary key constraint.

*/
-- AlterTable
ALTER TABLE "toots" DROP CONSTRAINT "toots_pkey",
ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "id" SET DATA TYPE TEXT,
ADD CONSTRAINT "toots_pkey" PRIMARY KEY ("id");
DROP SEQUENCE "toots_id_seq";
