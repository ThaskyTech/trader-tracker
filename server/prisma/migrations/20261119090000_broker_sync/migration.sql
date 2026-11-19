-- AlterTable
ALTER TABLE "accounts" ADD COLUMN     "reportedBalance" DECIMAL(20,8),
ADD COLUMN     "reportedBalanceUsd" DECIMAL(20,8),
ADD COLUMN     "reportedFloating" DECIMAL(20,8),
ADD COLUMN     "reportedFloatingUsd" DECIMAL(20,8),
ADD COLUMN     "syncCursor" JSONB;

-- AlterTable
ALTER TABLE "cash_movements" ADD COLUMN     "externalId" TEXT;

-- AlterTable
ALTER TABLE "trades" ADD COLUMN     "externalId" TEXT,
ADD COLUMN     "fees" DECIMAL(20,8);

-- CreateTable
CREATE TABLE "positions" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "direction" "Direction" NOT NULL,
    "quantity" DECIMAL(20,8) NOT NULL,
    "entryPrice" DECIMAL(20,8) NOT NULL,
    "markPrice" DECIMAL(20,8),
    "unrealizedPnl" DECIMAL(20,8) NOT NULL,
    "currency" "Currency" NOT NULL,
    "unrealizedPnlUsd" DECIMAL(20,8) NOT NULL,
    "openedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "positions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "balance_snapshots" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "balanceUsd" DECIMAL(20,8) NOT NULL,
    "equityUsd" DECIMAL(20,8) NOT NULL,
    "takenAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "balance_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "positions_accountId_idx" ON "positions"("accountId");

-- CreateIndex
CREATE UNIQUE INDEX "balance_snapshots_accountId_date_key" ON "balance_snapshots"("accountId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "cash_movements_accountId_externalId_key" ON "cash_movements"("accountId", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "trades_accountId_externalId_key" ON "trades"("accountId", "externalId");

-- AddForeignKey
ALTER TABLE "positions" ADD CONSTRAINT "positions_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "balance_snapshots" ADD CONSTRAINT "balance_snapshots_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

