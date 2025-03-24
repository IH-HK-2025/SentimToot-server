/*
  Warnings:

  - You are about to drop the `reddit_posts` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "reddit_posts" DROP CONSTRAINT "reddit_posts_userId_fkey";

-- DropTable
DROP TABLE "reddit_posts";

-- CreateTable
CREATE TABLE "toots" (
    "id" SERIAL NOT NULL,
    "mastodonId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "visibility" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "toots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "toots_mastodonId_key" ON "toots"("mastodonId");

-- AddForeignKey
ALTER TABLE "toots" ADD CONSTRAINT "toots_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
