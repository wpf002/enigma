-- AlterTable
ALTER TABLE "ComparabilityEdge" ADD COLUMN     "clusterId" TEXT;

-- CreateIndex
CREATE INDEX "ComparabilityEdge_clusterId_idx" ON "ComparabilityEdge"("clusterId");
