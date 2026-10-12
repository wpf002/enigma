/*
  Warnings:

  - Added the required column `minGateScore` to the `Cluster` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Cluster" ADD COLUMN     "agentClass" TEXT,
ADD COLUMN     "agents" TEXT[],
ADD COLUMN     "comparatorClass" TEXT,
ADD COLUMN     "minGateScore" DECIMAL(5,4) NOT NULL,
ADD COLUMN     "nctIds" TEXT[];

-- AlterTable
ALTER TABLE "Contradiction" ADD COLUMN     "agentClass" TEXT,
ADD COLUMN     "agents" TEXT[];
