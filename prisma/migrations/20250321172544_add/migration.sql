/*
  Warnings:

  - You are about to drop the column `sentimentCombined` on the `RedditPost` table. All the data in the column will be lost.
  - You are about to drop the column `sentimentComments` on the `RedditPost` table. All the data in the column will be lost.
  - You are about to drop the column `sentimentPost` on the `RedditPost` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "RedditPost" DROP COLUMN "sentimentCombined",
DROP COLUMN "sentimentComments",
DROP COLUMN "sentimentPost";
