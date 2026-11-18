-- P&L currency support. Every trade keeps the amount the user typed (pnl, in
-- pnlCurrency) plus a USD copy (pnlUsd) that all totals are calculated from.

-- CreateEnum
CREATE TYPE "Currency" AS ENUM ('USD', 'EUR', 'GBP', 'JPY', 'AUD', 'ZAR');

-- AlterTable: existing trades were all entered in USD, so they get currency USD,
-- a rate of 1, and a USD amount equal to their P&L. pnlUsd is added as nullable,
-- filled in, then made required, so this works on a table that already has rows.
ALTER TABLE "trades" ADD COLUMN     "fxRate" DECIMAL(20,10) NOT NULL DEFAULT 1,
ADD COLUMN     "pnlCurrency" "Currency" NOT NULL DEFAULT 'USD',
ADD COLUMN     "pnlUsd" DECIMAL(20,8);

UPDATE "trades" SET "pnlUsd" = "pnl";

ALTER TABLE "trades" ALTER COLUMN "pnlUsd" SET NOT NULL;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "displayCurrency" "Currency" NOT NULL DEFAULT 'USD';

-- CreateTable
CREATE TABLE "fx_rates" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "currency" "Currency" NOT NULL,
    "rate" DECIMAL(20,10) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fx_rates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "fx_rates_date_currency_key" ON "fx_rates"("date", "currency");
