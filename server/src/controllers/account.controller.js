import prisma from '../config/db.js'
import { HttpError } from '../middleware/error.middleware.js'
import { accountFigures, balanceParts, correctionFor, equitySeries, toAccountDTO, toCashDTO } from '../services/account.service.js'
import { getRateForDate, toUsd } from '../services/fx.service.js'
import { titleClashError } from '../utils/accounts.js'
import { getLocalParts, lastLocalDays, localMonthRange } from '../utils/time.js'
import {
    accountQuerySchema, balanceCorrectionSchema, cashMovementSchema,
    createAccountSchema, equityQuerySchema, updateAccountSchema,
} from '../validators/account.schema.js'

// No try/catch: Express 5 forwards thrown errors to error.middleware.js.

const TRADE_FIELDS = { accountId: true, closedAt: true, pnlUsd: true }
const CASH_FIELDS = { accountId: true, type: true, amountUsd: true, occurredAt: true }

function currentMonth(tz){
    const now = getLocalParts(new Date(), tz)
    return localMonthRange(now.year, now.month, tz)
}

// The user's account by id. Someone else's gives the same 404 as a missing one (D-33).
export async function findOwnAccount(userId, id){
    const account = await prisma.account.findFirst({ where: { id, userId } })
    if(!account) throw new HttpError(404, 'Account not found.')
    return account
}

// For anything that adds to an account: archived accounts take no new trades or cash (D-18).
export async function findWritableAccount(userId, id){
    const account = await findOwnAccount(userId, id)
    if(account.archivedAt) throw new HttpError(400, 'This account is archived. Restore it first.')
    return account
}

// The trades and cash movements behind several accounts' figures: two queries in
// total, not two per account.
function loadActivity(userId, ids){
    return Promise.all([
        prisma.trade.findMany({ where: { userId, accountId: { in: ids } }, select: TRADE_FIELDS }),
        prisma.cashMovement.findMany({ where: { accountId: { in: ids } }, select: CASH_FIELDS }),
    ])
}

async function withFigures(userId, accounts, tz){
    const [trades, cash] = await loadActivity(userId, accounts.map(a => a.id))
    const month = currentMonth(tz)
    return accounts.map(account => toAccountDTO(account, accountFigures(
        account,
        trades.filter(t => t.accountId === account.id),
        cash.filter(c => c.accountId === account.id),
        month,
    )))
}

async function checkTitle(userId, candidate){
    const others = await prisma.account.findMany({
        where: { userId, id: { not: candidate.id ?? '' } },
        select: { id: true, broker: true, style: true, accountNumber: true },
    })
    const problem = titleClashError(candidate, others)
    if(problem) throw new HttpError(400, problem, { accountNumber: [problem] })
}

// GET /accounts?tz=…  Every account, archived ones included (the client lists them
// separately), each with its figures. Net worth and shares are summed by the client.
export async function listAccounts(req, res){
    const { tz } = accountQuerySchema.parse(req.query)
    const accounts = await prisma.account.findMany({ where: { userId: req.userId }, orderBy: { createdAt: 'asc' } })
    res.status(200).json({ accounts: await withFigures(req.userId, accounts, tz) })
}

export async function getAccount(req, res){
    const { tz } = accountQuerySchema.parse(req.query)
    const account = await findOwnAccount(req.userId, req.params.id)
    const [dto] = await withFigures(req.userId, [account], tz)
    res.status(200).json({ account: dto })
}

// POST /accounts. Manual and MT5 accounts only for now (see CREATABLE_PROVIDERS).
// The opening balance is what the broker shows today, stored with today's rate (D-22).
export async function createAccount(req, res){
    const data = createAccountSchema.parse(req.body)
    const { tz } = accountQuerySchema.parse(req.query)
    await checkTitle(req.userId, data)

    const openingDate = new Date()
    const openingFxRate = await getRateForDate(data.currency, openingDate)
    const account = await prisma.account.create({
        data: {
            ...data,
            accountNumber: data.accountNumber ?? null,
            openingFxRate,
            openingBalanceUsd: toUsd(data.openingBalance, openingFxRate),
            openingDate,
            userId: req.userId,
        },
    })

    const [dto] = await withFigures(req.userId, [account], tz)
    res.status(201).json({ account: dto })
}

// PATCH /accounts/:id  style, category, accountNumber.
export async function updateAccount(req, res){
    const data = updateAccountSchema.parse(req.body)
    const { tz } = accountQuerySchema.parse(req.query)
    const existing = await findOwnAccount(req.userId, req.params.id)
    await checkTitle(req.userId, { ...existing, ...data })

    const account = await prisma.account.update({ where: { id: existing.id }, data })
    const [dto] = await withFigures(req.userId, [account], tz)
    res.status(200).json({ account: dto })
}

// D-18 archive: leaves net worth, stops syncing, wipes credentials. Trades stay.
export async function archiveAccount(req, res){
    const { tz } = accountQuerySchema.parse(req.query)
    const existing = await findOwnAccount(req.userId, req.params.id)
    const account = existing.archivedAt ? existing : await prisma.account.update({
        where: { id: existing.id },
        data: { archivedAt: new Date(), credentialsEncrypted: null, credentialHint: null, syncStatus: null },
    })
    const [dto] = await withFigures(req.userId, [account], tz)
    res.status(200).json({ account: dto })
}

// Restore. A synced account comes back needing its credentials again (they were wiped).
export async function restoreAccount(req, res){
    const { tz } = accountQuerySchema.parse(req.query)
    const existing = await findOwnAccount(req.userId, req.params.id)
    const synced = existing.provider !== 'MT5' && existing.provider !== 'MANUAL'
    const account = await prisma.account.update({
        where: { id: existing.id },
        data: {
            archivedAt: null,
            ...(synced && { syncStatus: 'RECONNECT', lastError: 'Credentials were removed when this account was archived.' }),
        },
    })
    const [dto] = await withFigures(req.userId, [account], tz)
    res.status(200).json({ account: dto })
}

// D-18 delete permanently: the account with its trades and cash movements (the foreign
// keys cascade). The client confirms by typing the account's title first.
export async function deleteAccount(req, res){
    const { count } = await prisma.account.deleteMany({ where: { id: req.params.id, userId: req.userId } })
    if(count === 0) throw new HttpError(404, 'Account not found.')
    res.status(200).json({ message: 'Account deleted.' })
}

// GET /accounts/:id/cash  Newest first.
export async function listCash(req, res){
    const account = await findOwnAccount(req.userId, req.params.id)
    const cash = await prisma.cashMovement.findMany({
        where: { accountId: account.id },
        orderBy: [{ occurredAt: 'desc' }, { createdAt: 'desc' }],
    })
    res.status(200).json({ cash: cash.map(toCashDTO) })
}

// POST /accounts/:id/cash  A deposit or withdrawal on a manual account (D-27).
// Stored signed, with the rate on the day it happened, like a trade (D-22).
export async function addCash(req, res){
    const data = cashMovementSchema.parse(req.body)
    const account = await findWritableAccount(req.userId, req.params.id)
    if(data.occurredAt > new Date(Date.now() + 5 * 60 * 1000)) throw new HttpError(400, "occurredAt: The date can't be in the future.")
    if(data.occurredAt < account.openingDate){
        throw new HttpError(400, "occurredAt: That's before this account's start date, so its opening balance already includes it.")
    }

    const fxRate = await getRateForDate(data.currency, data.occurredAt)
    const sign = data.type === 'WITHDRAWAL' ? -1 : 1
    const movement = await prisma.cashMovement.create({
        data: {
            accountId: account.id,
            type: data.type,
            amount: data.amount * sign,
            currency: data.currency,
            fxRate,
            amountUsd: toUsd(data.amount * sign, fxRate),
            occurredAt: data.occurredAt,
            note: data.note ?? null,
        },
    })
    res.status(201).json({ movement: toCashDTO(movement) })
}

// POST /accounts/:id/balance-correction  D-19: the user enters what the broker shows;
// the difference is saved as a visible adjustment, never a silent overwrite.
export async function correctBalance(req, res){
    const { balance } = balanceCorrectionSchema.parse(req.body)
    const account = await findWritableAccount(req.userId, req.params.id)
    const [trades, cash] = await loadActivity(req.userId, [account.id])
    const current = balanceParts(account, trades, cash).balance

    const now = new Date()
    const fxRate = await getRateForDate(account.currency, now)
    const correction = correctionFor(toUsd(balance, fxRate), current, fxRate)
    if(!correction) throw new HttpError(400, 'That already matches the calculated balance.')

    const movement = await prisma.cashMovement.create({
        data: {
            accountId: account.id, type: 'ADJUSTMENT', currency: account.currency, fxRate,
            amount: correction.amount, amountUsd: correction.amountUsd, occurredAt: now,
            note: 'Matched to broker balance',
        },
    })
    res.status(201).json({ movement: toCashDTO(movement) })
}

// GET /accounts/:id/equity?days=90&tz=…  Daily equity for the chart (D-45).
export async function getEquity(req, res){
    const { tz, days } = equityQuerySchema.parse(req.query)
    const account = await findOwnAccount(req.userId, req.params.id)
    const [trades, cash] = await loadActivity(req.userId, [account.id])
    res.status(200).json({ points: equitySeries(account, trades, cash, lastLocalDays(days, tz)) })
}
