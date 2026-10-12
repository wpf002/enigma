-- CreateTable
CREATE TABLE "Snapshot" (
    "id" TEXT NOT NULL,
    "aactVersion" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'AACT_DUMP',
    "area" TEXT NOT NULL DEFAULT 't2d-cv',
    "fetchedAt" TIMESTAMP(3) NOT NULL,
    "checksum" TEXT NOT NULL,
    "studyCount" INTEGER NOT NULL DEFAULT 0,
    "previousId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Snapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "raw_study" (
    "id" TEXT NOT NULL,
    "snapshotId" TEXT NOT NULL,
    "nctId" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "contentHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "raw_study_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "raw_outcome_measure" (
    "id" TEXT NOT NULL,
    "snapshotId" TEXT NOT NULL,
    "nctId" TEXT NOT NULL,
    "aactOutcomeId" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "raw_outcome_measure_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "raw_outcome_analysis" (
    "id" TEXT NOT NULL,
    "snapshotId" TEXT NOT NULL,
    "nctId" TEXT NOT NULL,
    "aactOutcomeId" TEXT NOT NULL,
    "aactAnalysisId" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "raw_outcome_analysis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SnapshotDelta" (
    "id" TEXT NOT NULL,
    "snapshotId" TEXT NOT NULL,
    "nctId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "previousHash" TEXT,
    "currentHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SnapshotDelta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Trial" (
    "id" TEXT NOT NULL,
    "snapshotId" TEXT NOT NULL,
    "nctId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "acronym" TEXT,
    "status" TEXT NOT NULL,
    "phase" TEXT,
    "enrollment" INTEGER,
    "startDate" TIMESTAMP(3),
    "completionDate" TIMESTAMP(3),
    "resultsPostedDate" TIMESTAMP(3),
    "sponsor" TEXT,
    "sponsorClass" TEXT,
    "allocation" TEXT,
    "masking" TEXT,
    "whyStopped" TEXT,
    "stopCategory" TEXT,
    "population" JSONB NOT NULL,
    "populationHash" TEXT NOT NULL,
    "arms" JSONB NOT NULL,
    "ruleVersion" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Trial_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EffectRecord" (
    "id" TEXT NOT NULL,
    "snapshotId" TEXT NOT NULL,
    "trialId" TEXT NOT NULL,
    "nctId" TEXT NOT NULL,
    "outcomeMeasureId" TEXT NOT NULL,
    "analysisId" TEXT,
    "sourceKind" TEXT NOT NULL,
    "outcomeTitle" TEXT NOT NULL,
    "outcomeType" TEXT,
    "timeFrame" TEXT,
    "units" TEXT,
    "measure" TEXT NOT NULL,
    "value" DECIMAL(18,8) NOT NULL,
    "ciLow" DECIMAL(18,8),
    "ciHigh" DECIMAL(18,8),
    "ciLevel" DECIMAL(5,4),
    "se" DECIMAL(18,8),
    "pValue" DECIMAL(18,12),
    "dispersionType" TEXT,
    "nAnalyzed" INTEGER,
    "nExperimental" INTEGER,
    "nComparator" INTEGER,
    "controlRisk" DECIMAL(9,8),
    "pooledSd" DECIMAL(18,8),
    "directionConvention" TEXT NOT NULL,
    "directionResolved" BOOLEAN NOT NULL DEFAULT false,
    "lowerIsBetter" BOOLEAN,
    "experimentalLabel" TEXT,
    "comparatorLabel" TEXT,
    "agents" TEXT[],
    "agentClass" TEXT,
    "doseDaily" DECIMAL(18,6),
    "doseUnit" TEXT,
    "comparatorClass" TEXT,
    "comparatorAgents" TEXT[],
    "endpointNodeId" TEXT,
    "populationHash" TEXT,
    "interventionHash" TEXT,
    "comparatorHash" TEXT,
    "timepointDays" INTEGER,
    "analysisPopulation" TEXT,
    "factors" JSONB NOT NULL,
    "ruleVersion" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EffectRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NormalizationFailure" (
    "id" TEXT NOT NULL,
    "snapshotId" TEXT NOT NULL,
    "nctId" TEXT NOT NULL,
    "outcomeMeasureId" TEXT NOT NULL,
    "analysisId" TEXT,
    "reason" TEXT NOT NULL,
    "detail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NormalizationFailure_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EndpointNode" (
    "id" TEXT NOT NULL,
    "parentId" TEXT,
    "label" TEXT NOT NULL,
    "family" TEXT NOT NULL,
    "depth" INTEGER NOT NULL,
    "lowerIsBetter" BOOLEAN,
    "meshTerms" TEXT[],
    "ruleVersion" TEXT NOT NULL,

    CONSTRAINT "EndpointNode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComparabilityEdge" (
    "id" TEXT NOT NULL,
    "snapshotId" TEXT NOT NULL,
    "aId" TEXT NOT NULL,
    "bId" TEXT NOT NULL,
    "aNctId" TEXT NOT NULL,
    "bNctId" TEXT NOT NULL,
    "blockKey" TEXT NOT NULL,
    "gateScore" DECIMAL(5,4) NOT NULL,
    "passed" BOOLEAN NOT NULL,
    "weakestDimension" TEXT NOT NULL,
    "dimensionScores" JSONB NOT NULL,
    "failureReasons" JSONB NOT NULL,
    "factors" JSONB NOT NULL,
    "ruleVersion" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ComparabilityEdge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Cluster" (
    "id" TEXT NOT NULL,
    "snapshotId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "endpointNodeId" TEXT NOT NULL,
    "measure" TEXT NOT NULL,
    "k" INTEGER NOT NULL,
    "nPatients" INTEGER NOT NULL,
    "density" DECIMAL(5,4) NOT NULL,
    "memberIds" TEXT[],
    "stats" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Cluster_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Contradiction" (
    "id" TEXT NOT NULL,
    "snapshotId" TEXT NOT NULL,
    "edgeId" TEXT,
    "clusterId" TEXT,
    "aId" TEXT,
    "bId" TEXT,
    "nctIds" TEXT[],
    "endpointNodeId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "severity" DECIMAL(5,4) NOT NULL,
    "gateConfidence" DECIMAL(5,4) NOT NULL,
    "diagnosticValue" DECIMAL(5,4) NOT NULL,
    "components" JSONB NOT NULL,
    "rank" INTEGER,
    "discriminatingVariable" TEXT,
    "alreadyResolvedRef" TEXT,
    "claim" JSONB NOT NULL,
    "factors" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Contradiction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Dossier" (
    "id" TEXT NOT NULL,
    "contradictionId" TEXT NOT NULL,
    "snapshotId" TEXT NOT NULL,
    "rank" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "body" JSONB NOT NULL,
    "markdown" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Dossier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResolvedReview" (
    "id" TEXT NOT NULL,
    "citation" TEXT NOT NULL,
    "pmid" TEXT,
    "year" INTEGER NOT NULL,
    "endpointNodeIds" TEXT[],
    "agentClasses" TEXT[],
    "nctIds" TEXT[],
    "conclusion" TEXT NOT NULL,
    "reviewStatus" TEXT NOT NULL,

    CONSTRAINT "ResolvedReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Watchlist" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Watchlist_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Alert" (
    "id" TEXT NOT NULL,
    "watchlistId" TEXT NOT NULL,
    "snapshotId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "detail" JSONB NOT NULL,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Alert_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PipelineRun" (
    "id" TEXT NOT NULL,
    "snapshotId" TEXT NOT NULL,
    "step" TEXT NOT NULL,
    "ruleVersion" TEXT,
    "stats" JSONB NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "PipelineRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Snapshot_aactVersion_key" ON "Snapshot"("aactVersion");

-- CreateIndex
CREATE UNIQUE INDEX "raw_study_snapshotId_nctId_key" ON "raw_study"("snapshotId", "nctId");

-- CreateIndex
CREATE INDEX "raw_outcome_measure_snapshotId_nctId_idx" ON "raw_outcome_measure"("snapshotId", "nctId");

-- CreateIndex
CREATE UNIQUE INDEX "raw_outcome_measure_snapshotId_aactOutcomeId_key" ON "raw_outcome_measure"("snapshotId", "aactOutcomeId");

-- CreateIndex
CREATE INDEX "raw_outcome_analysis_snapshotId_nctId_idx" ON "raw_outcome_analysis"("snapshotId", "nctId");

-- CreateIndex
CREATE UNIQUE INDEX "raw_outcome_analysis_snapshotId_aactAnalysisId_key" ON "raw_outcome_analysis"("snapshotId", "aactAnalysisId");

-- CreateIndex
CREATE INDEX "SnapshotDelta_snapshotId_kind_idx" ON "SnapshotDelta"("snapshotId", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "SnapshotDelta_snapshotId_nctId_key" ON "SnapshotDelta"("snapshotId", "nctId");

-- CreateIndex
CREATE INDEX "Trial_nctId_idx" ON "Trial"("nctId");

-- CreateIndex
CREATE UNIQUE INDEX "Trial_snapshotId_nctId_key" ON "Trial"("snapshotId", "nctId");

-- CreateIndex
CREATE INDEX "EffectRecord_nctId_idx" ON "EffectRecord"("nctId");

-- CreateIndex
CREATE INDEX "EffectRecord_endpointNodeId_idx" ON "EffectRecord"("endpointNodeId");

-- CreateIndex
CREATE INDEX "EffectRecord_snapshotId_endpointNodeId_idx" ON "EffectRecord"("snapshotId", "endpointNodeId");

-- CreateIndex
CREATE INDEX "EffectRecord_trialId_idx" ON "EffectRecord"("trialId");

-- CreateIndex
CREATE INDEX "NormalizationFailure_snapshotId_reason_idx" ON "NormalizationFailure"("snapshotId", "reason");

-- CreateIndex
CREATE INDEX "NormalizationFailure_snapshotId_nctId_idx" ON "NormalizationFailure"("snapshotId", "nctId");

-- CreateIndex
CREATE INDEX "ComparabilityEdge_snapshotId_passed_gateScore_idx" ON "ComparabilityEdge"("snapshotId", "passed", "gateScore");

-- CreateIndex
CREATE INDEX "ComparabilityEdge_snapshotId_weakestDimension_idx" ON "ComparabilityEdge"("snapshotId", "weakestDimension");

-- CreateIndex
CREATE INDEX "ComparabilityEdge_aNctId_idx" ON "ComparabilityEdge"("aNctId");

-- CreateIndex
CREATE INDEX "ComparabilityEdge_bNctId_idx" ON "ComparabilityEdge"("bNctId");

-- CreateIndex
CREATE UNIQUE INDEX "ComparabilityEdge_aId_bId_ruleVersion_key" ON "ComparabilityEdge"("aId", "bId", "ruleVersion");

-- CreateIndex
CREATE INDEX "Cluster_snapshotId_endpointNodeId_idx" ON "Cluster"("snapshotId", "endpointNodeId");

-- CreateIndex
CREATE UNIQUE INDEX "Cluster_snapshotId_key_key" ON "Cluster"("snapshotId", "key");

-- CreateIndex
CREATE INDEX "Contradiction_diagnosticValue_idx" ON "Contradiction"("diagnosticValue");

-- CreateIndex
CREATE INDEX "Contradiction_snapshotId_type_idx" ON "Contradiction"("snapshotId", "type");

-- CreateIndex
CREATE INDEX "Contradiction_snapshotId_endpointNodeId_idx" ON "Contradiction"("snapshotId", "endpointNodeId");

-- CreateIndex
CREATE INDEX "Contradiction_snapshotId_rank_idx" ON "Contradiction"("snapshotId", "rank");

-- CreateIndex
CREATE UNIQUE INDEX "Dossier_contradictionId_key" ON "Dossier"("contradictionId");

-- CreateIndex
CREATE INDEX "Dossier_snapshotId_rank_idx" ON "Dossier"("snapshotId", "rank");

-- CreateIndex
CREATE UNIQUE INDEX "Watchlist_kind_value_key" ON "Watchlist"("kind", "value");

-- CreateIndex
CREATE INDEX "Alert_watchlistId_readAt_idx" ON "Alert"("watchlistId", "readAt");

-- CreateIndex
CREATE INDEX "PipelineRun_snapshotId_step_idx" ON "PipelineRun"("snapshotId", "step");

-- AddForeignKey
ALTER TABLE "raw_study" ADD CONSTRAINT "raw_study_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "Snapshot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "raw_outcome_measure" ADD CONSTRAINT "raw_outcome_measure_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "Snapshot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "raw_outcome_analysis" ADD CONSTRAINT "raw_outcome_analysis_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "Snapshot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SnapshotDelta" ADD CONSTRAINT "SnapshotDelta_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "Snapshot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Trial" ADD CONSTRAINT "Trial_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "Snapshot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EffectRecord" ADD CONSTRAINT "EffectRecord_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "Snapshot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EffectRecord" ADD CONSTRAINT "EffectRecord_trialId_fkey" FOREIGN KEY ("trialId") REFERENCES "Trial"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComparabilityEdge" ADD CONSTRAINT "ComparabilityEdge_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "Snapshot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cluster" ADD CONSTRAINT "Cluster_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "Snapshot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contradiction" ADD CONSTRAINT "Contradiction_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "Snapshot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Dossier" ADD CONSTRAINT "Dossier_contradictionId_fkey" FOREIGN KEY ("contradictionId") REFERENCES "Contradiction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Dossier" ADD CONSTRAINT "Dossier_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "Snapshot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Alert" ADD CONSTRAINT "Alert_watchlistId_fkey" FOREIGN KEY ("watchlistId") REFERENCES "Watchlist"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Alert" ADD CONSTRAINT "Alert_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "Snapshot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PipelineRun" ADD CONSTRAINT "PipelineRun_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "Snapshot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
