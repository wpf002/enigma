/*
  Warnings:

  - Added the required column `pooling` to the `ResolvedReview` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "ResolvedReview" ADD COLUMN     "agents" TEXT[],
ADD COLUMN     "excludedNctIds" TEXT[],
ADD COLUMN     "pooling" TEXT NOT NULL;
