-- AlterTable
ALTER TABLE "ComparabilityEdge" ADD COLUMN     "apparentConflict" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "commonMeasure" TEXT;

-- CreateIndex
CREATE INDEX "ComparabilityEdge_snapshotId_apparentConflict_passed_idx" ON "ComparabilityEdge"("snapshotId", "apparentConflict", "passed");
