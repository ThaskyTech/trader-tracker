-- Accounts (roadmap 6b, D-16 to D-19, D-27). Every trade moves from a free-text
-- broker name to an account. Existing trades get one manual account per broker name
-- per user (case and spaces ignored), which the owner then gives a trading style and
-- corrects to the broker's balance.

-- CreateEnum
CREATE TYPE "AccountProvider" AS ENUM ('BINANCE', 'CTRADER', 'IBKR', 'MT5', 'MANUAL');
CREATE TYPE "AccountCategory" AS ENUM ('CRYPTO', 'FOREX', 'STOCKS');
CREATE TYPE "TradingStyle" AS ENUM ('BOT', 'SCALPING', 'DAY', 'SWING', 'LONG_TERM');
CREATE TYPE "SyncStatus" AS ENUM ('OK', 'ERROR', 'RECONNECT');
CREATE TYPE "CashMovementType" AS ENUM ('DEPOSIT', 'WITHDRAWAL', 'ADJUSTMENT');
CREATE TYPE "RecordOrigin" AS ENUM ('MANUAL', 'SYNCED');

-- CreateTable
CREATE TABLE "accounts" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" "AccountProvider" NOT NULL,
    "broker" TEXT NOT NULL,
    "style" "TradingStyle",
    "category" "AccountCategory" NOT NULL,
    "currency" "Currency" NOT NULL,
    "accountNumber" TEXT,
    "openingBalance" DECIMAL(20,8) NOT NULL DEFAULT 0,
    "openingFxRate" DECIMAL(20,10) NOT NULL DEFAULT 1,
    "openingBalanceUsd" DECIMAL(20,8) NOT NULL DEFAULT 0,
    "openingDate" TIMESTAMP(3) NOT NULL,
    "credentialsEncrypted" TEXT,
    "credentialHint" TEXT,
    "syncStatus" "SyncStatus",
    "lastSyncedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "cash_movements" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "type" "CashMovementType" NOT NULL,
    "amount" DECIMAL(20,8) NOT NULL,
    "currency" "Currency" NOT NULL,
    "fxRate" DECIMAL(20,10) NOT NULL,
    "amountUsd" DECIMAL(20,8) NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "note" TEXT,
    "origin" "RecordOrigin" NOT NULL DEFAULT 'MANUAL',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "cash_movements_pkey" PRIMARY KEY ("id")
);

-- Backfill, step 1: one account per user and broker name.
--   broker:   the spelling used most often ("Exness" over "exness ").
--   provider: Exness and FP Markets are MT5 brokers (D-12); anything else is "Other
--             (manual)". cTrader/Binance/IBKR are synced types, which a migrated account
--             without credentials can't be.
--   category: a best guess from the broker (D-17 lets the owner change it).
--   currency: the P&L currency used most often on those trades.
--   style:    left empty; the owner sets it from the account's Details (D-47).
--   opening:  balance 0 from the first trade's close, so every existing trade counts.
--             The owner then uses "Correct balance" to match the broker (D-19).
INSERT INTO "accounts" ("id", "userId", "provider", "broker", "style", "category", "currency", "openingDate", "updatedAt")
SELECT
    gen_random_uuid()::text,
    t."userId",
    CASE WHEN lower(trim(t.broker)) IN ('exness', 'fp markets', 'fpmarkets') THEN 'MT5' ELSE 'MANUAL' END::"AccountProvider",
    mode() WITHIN GROUP (ORDER BY trim(t.broker)),
    NULL,
    CASE
        WHEN lower(trim(t.broker)) IN ('binance', 'bybit') THEN 'CRYPTO'
        WHEN lower(trim(t.broker)) IN ('ibkr', 'interactive brokers') THEN 'STOCKS'
        ELSE 'FOREX'
    END::"AccountCategory",
    mode() WITHIN GROUP (ORDER BY t."pnlCurrency"),
    min(t."closedAt"),
    CURRENT_TIMESTAMP
FROM "trades" t
GROUP BY t."userId", lower(trim(t.broker));

-- Backfill, step 2: link every trade to its account. The column is added nullable,
-- filled, then made required, so this works on a table that already has rows.
ALTER TABLE "trades" ADD COLUMN "accountId" TEXT;

UPDATE "trades" t
SET "accountId" = a."id"
FROM "accounts" a
WHERE a."userId" = t."userId" AND lower(trim(a."broker")) = lower(trim(t."broker"));

ALTER TABLE "trades" ALTER COLUMN "accountId" SET NOT NULL;

-- The broker name now lives on the account, so the trade's copy goes.
ALTER TABLE "trades" DROP COLUMN "broker";

-- CreateIndex
CREATE INDEX "accounts_userId_idx" ON "accounts"("userId");
CREATE INDEX "cash_movements_accountId_occurredAt_idx" ON "cash_movements"("accountId", "occurredAt");
CREATE INDEX "trades_accountId_closedAt_idx" ON "trades"("accountId", "closedAt");

-- AddForeignKey
ALTER TABLE "trades" ADD CONSTRAINT "trades_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "cash_movements" ADD CONSTRAINT "cash_movements_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
