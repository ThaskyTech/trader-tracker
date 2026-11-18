-- AlterTable
ALTER TABLE "trades" ALTER COLUMN "lotSize" SET DATA TYPE DECIMAL(20,8),
ALTER COLUMN "entryPrice" SET DATA TYPE DECIMAL(20,8),
ALTER COLUMN "exitPrice" SET DATA TYPE DECIMAL(20,8),
ALTER COLUMN "pnl" SET DATA TYPE DECIMAL(20,8);

-- CreateIndex
CREATE INDEX "trades_userId_closedAt_idx" ON "trades"("userId", "closedAt");
