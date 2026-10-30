-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "image" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "role" TEXT DEFAULT 'attendant',
    "stores" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "banned" BOOLEAN DEFAULT false,
    "banReason" TEXT,
    "banExpires" TIMESTAMP(3),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "token" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "userId" TEXT NOT NULL,
    "impersonatedBy" TEXT,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accounts" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "idToken" TEXT,
    "accessTokenExpiresAt" TIMESTAMP(3),
    "refreshTokenExpiresAt" TIMESTAMP(3),
    "scope" TEXT,
    "password" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verifications" (
    "id" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3),

    CONSTRAINT "verifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dma_requests" (
    "id" TEXT NOT NULL,
    "requesterId" TEXT NOT NULL,
    "actionType" TEXT NOT NULL,
    "contractName" TEXT NOT NULL,
    "observations" TEXT,
    "coralContractId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ANALYZING',
    "version" INTEGER NOT NULL DEFAULT 1,
    "submittedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dma_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bulk_action_jobs" (
    "id" TEXT NOT NULL,
    "requesterId" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "actionType" TEXT NOT NULL,
    "worksheetName" TEXT NOT NULL,
    "contractColumn" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'READY',
    "totalRows" INTEGER NOT NULL,
    "succeededCount" INTEGER NOT NULL DEFAULT 0,
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "uncertainCount" INTEGER NOT NULL DEFAULT 0,
    "skippedCount" INTEGER NOT NULL DEFAULT 0,
    "deletedAt" TIMESTAMP(3),
    "deletedById" TEXT,
    "deletedByName" TEXT,
    "deletedByEmail" TEXT,
    "deletionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bulk_action_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bulk_action_items" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "rowNumber" INTEGER NOT NULL,
    "contractNumber" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "note" TEXT,
    "processingStartedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bulk_action_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bulk_action_attempts" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "attemptNumber" INTEGER NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "response" JSONB,
    "errorCode" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "bulk_action_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "request_documents" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "request_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_analyses" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "requestVersion" INTEGER NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "extractedData" JSONB,
    "comparison" JSONB,
    "confidence" DOUBLE PRECISION,
    "errorCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_analyses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "review_decisions" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "reviewerId" TEXT NOT NULL,
    "requestVersion" INTEGER NOT NULL,
    "decision" TEXT NOT NULL,
    "justification" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "review_decisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "execution_attempts" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "integration" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "response" JSONB,
    "errorCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "execution_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_events" (
    "id" TEXT NOT NULL,
    "requestId" TEXT,
    "actorId" TEXT,
    "event" TEXT NOT NULL,
    "details" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_token_key" ON "sessions"("token");

-- CreateIndex
CREATE UNIQUE INDEX "accounts_providerId_accountId_key" ON "accounts"("providerId", "accountId");

-- CreateIndex
CREATE INDEX "dma_requests_requesterId_status_idx" ON "dma_requests"("requesterId", "status");

-- CreateIndex
CREATE INDEX "dma_requests_status_submittedAt_idx" ON "dma_requests"("status", "submittedAt");

-- CreateIndex
CREATE INDEX "bulk_action_jobs_requesterId_createdAt_idx" ON "bulk_action_jobs"("requesterId", "createdAt");

-- CreateIndex
CREATE INDEX "bulk_action_jobs_status_createdAt_idx" ON "bulk_action_jobs"("status", "createdAt");

-- CreateIndex
CREATE INDEX "bulk_action_jobs_deletedAt_createdAt_idx" ON "bulk_action_jobs"("deletedAt", "createdAt");

-- CreateIndex
CREATE INDEX "bulk_action_items_jobId_status_rowNumber_idx" ON "bulk_action_items"("jobId", "status", "rowNumber");

-- CreateIndex
CREATE UNIQUE INDEX "bulk_action_items_jobId_rowNumber_key" ON "bulk_action_items"("jobId", "rowNumber");

-- CreateIndex
CREATE UNIQUE INDEX "bulk_action_attempts_idempotencyKey_key" ON "bulk_action_attempts"("idempotencyKey");

-- CreateIndex
CREATE INDEX "bulk_action_attempts_itemId_startedAt_idx" ON "bulk_action_attempts"("itemId", "startedAt");

-- CreateIndex
CREATE UNIQUE INDEX "bulk_action_attempts_itemId_attemptNumber_key" ON "bulk_action_attempts"("itemId", "attemptNumber");

-- CreateIndex
CREATE INDEX "request_documents_requestId_kind_version_idx" ON "request_documents"("requestId", "kind", "version");

-- CreateIndex
CREATE INDEX "ai_analyses_requestId_requestVersion_idx" ON "ai_analyses"("requestId", "requestVersion");

-- CreateIndex
CREATE INDEX "review_decisions_requestId_createdAt_idx" ON "review_decisions"("requestId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "execution_attempts_idempotencyKey_key" ON "execution_attempts"("idempotencyKey");

-- CreateIndex
CREATE INDEX "execution_attempts_requestId_createdAt_idx" ON "execution_attempts"("requestId", "createdAt");

-- CreateIndex
CREATE INDEX "audit_events_requestId_createdAt_idx" ON "audit_events"("requestId", "createdAt");

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dma_requests" ADD CONSTRAINT "dma_requests_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bulk_action_jobs" ADD CONSTRAINT "bulk_action_jobs_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bulk_action_items" ADD CONSTRAINT "bulk_action_items_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "bulk_action_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bulk_action_attempts" ADD CONSTRAINT "bulk_action_attempts_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "bulk_action_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "request_documents" ADD CONSTRAINT "request_documents_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "dma_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_analyses" ADD CONSTRAINT "ai_analyses_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "dma_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_decisions" ADD CONSTRAINT "review_decisions_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "dma_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_decisions" ADD CONSTRAINT "review_decisions_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "execution_attempts" ADD CONSTRAINT "execution_attempts_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "dma_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "dma_requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

