-- AlterEnum
ALTER TYPE "JobType" ADD VALUE 'transform';

-- AlterTable
ALTER TABLE "Job" ADD COLUMN "sourceAssetId" TEXT;
ALTER TABLE "Job" ADD COLUMN "specJson" JSONB;

-- CreateIndex
CREATE INDEX "Job_sourceAssetId_idx" ON "Job"("sourceAssetId");

-- AddForeignKey
ALTER TABLE "Job" ADD CONSTRAINT "Job_sourceAssetId_fkey" FOREIGN KEY ("sourceAssetId") REFERENCES "Asset"("id") ON DELETE SET NULL ON UPDATE CASCADE;
