import crypto from 'node:crypto'
import prisma from '../config/db.js'
import { HttpError } from '../middleware/error.middleware.js'
import {
    accountFigures, balanceParts, correctionFor, equitySeries, snapshotSeries,
    toAccountDTO, toCashDTO, toPositionDTO, usesReportedBalance,
} from '../services/account.service.js'
import { getRateForDate, toUsd } from '../services/fx.service.js'
import { KeyRejectedError } from '../services/sync/binance.adapter.js'
import { adapterFor, describeFailure, isSyncing, syncAccount, syncInBackground } from '../services/sync/sync.service.js'
import { isSyncedProvider, titleClashError } from '../utils/accounts.js'
import { encryptCredentials, isEncryptionConfigured } from '../utils/secrets.js'
import { getLocalParts, lastLocalDays, localMonthRange } from '../utils/time.js'
import {
    accountQuerySchema, balanceCorrectionSchema, binanceCredentialsSchema, cashMovementSchema,
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

// For hand-entered records: a synced account's trades, cash and balance come from the
// broker, so typing them in would double them or disagree with it (D-63).
export async function findManualAccount(userId, id){
    const account = await findWritableAccount(userId, id)
    if(isSyncedProvider(account.provider)) throw new HttpError(400, `This account syncs from ${account.broker}, so its trades and cash come in automatically.`)
    return account
}

// The trades, cash movements and open positions behind several accounts' figures:
// three queries in total, not three per account.
function loadActivity(userId, ids){
    return Promise.all([
        prisma.trade.findMany({ where: { userId, accountId: { in: ids } }, select: TRADE_FIELDS }),
        prisma.cashMovement.findMany({ where: { accountId: { in: ids } }, select: CASH_FIELDS }),
        prisma.position.findMany({ where: { accountId: { in: ids } }, select: { accountId: true } }),
    ])
}

async function withFigures(userId, accounts, tz){
    const [trades, cash, positions] = await loadActivity(userId, accounts.map(a => a.id))
    const month = currentMonth(tz)
    return accounts.map(account => toAccountDTO(account, accountFigures(
        account,
        trades.filter(t => t.accountId === account.id),
        cash.filter(c => c.accountId === account.id),
        month,
        positions.filter(p => p.accountId === account.id).length,
    ), { syncing: isSyncing(account.id) }))
}

// Checks a broker key before anything is saved (D-15, D-67). A problem with the key
// itself is the user's to fix (400); Binance being unreachable or refusing the
// server is not (502).
async function verifyKey(provider, credentials){
    if(!isEncryptionConfigured()) throw new HttpError(503, "Broker connections aren't set up on this server yet (ENCRYPTION_KEY is missing).")
    try {
        return await adapterFor(provider).verify(credentials)
    } catch (err) {
        if(err instanceof KeyRejectedError) throw new HttpError(400, err.message, { credentials: [err.message] })
        throw new HttpError(502, describeFailure(err).message)
    }
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

// POST /accounts. Manual, MT5 and Binance (see CREATABLE_PROVIDERS).
// Manual: the opening balance is what the broker shows today, with today's rate (D-22).
// Binance: the key is checked, encrypted and saved, then the first sync imports the
// last 3 months in the background (D-62, D-65); it sets the opening balance itself.
// The response comes back straight away with `syncing: true`, and the socket says
// when the import is done.
export async function createAccount(req, res){
    const { credentials, ...data } = createAccountSchema.parse(req.body)
    const { tz } = accountQuerySchema.parse(req.query)
    await checkTitle(req.userId, data)

    // The id is made here so the encrypted key can be bound to it (utils/secrets.js).
    const id = crypto.randomUUID()
    const connection = credentials ? {
        credentialHint: (await verifyKey(data.provider, credentials)).hint,
        credentialsEncrypted: encryptCredentials(credentials, id),
    } : {}

    const openingDate = new Date()
    const openingFxRate = await getRateForDate(data.currency, openingDate)
    const account = await prisma.account.create({
        data: {
            ...data,
            ...connection,
            id,
            accountNumber: data.accountNumber ?? null,
            openingFxRate,
            openingBalanceUsd: toUsd(data.openingBalance, openingFxRate),
            openingDate,
            userId: req.userId,
        },
    })

    if(credentials) syncInBackground(account.id)
    const [dto] = await withFigures(req.userId, [account], tz)
    res.status(201).json({ account: { ...dto, syncing: Boolean(credentials) } })
}

// POST /accounts/:id/credentials  { apiKey, apiSecret }  Replace key (D-45): after a
// rejection, a restore from the archive, or just rotating keys. Same checks as adding.
// The sync carries on from where it stopped, so nothing is imported twice.
export async function replaceCredentials(req, res){
    const { tz } = accountQuerySchema.parse(req.query)
    const existing = await findWritableAccount(req.userId, req.params.id)
    if(!adapterFor(existing.provider)) throw new HttpError(400, "This account doesn't connect with a key.")
    const credentials = binanceCredentialsSchema.parse(req.body)
    const { hint } = await verifyKey(existing.provider, credentials)

    const account = await prisma.account.update({
        where: { id: existing.id },
        data: {
            credentialsEncrypted: encryptCredentials(credentials, existing.id),
            credentialHint: hint,
            syncStatus: null,
            lastError: null,
        },
    })
    syncInBackground(account.id)
    const [dto] = await withFigures(req.userId, [account], tz)
    res.status(200).json({ account: { ...dto, syncing: true } })
}

// POST /accounts/:id/sync  "Sync now" (D-65): at most once a minute per account, so
// repeated taps can't burn through Binance's limits. Waits for the sync: after the
// first import, one takes a few seconds.
const SYNC_NOW_GAP_MS = 60e3
const lastSyncNow = new Map()

export async function syncNow(req, res){
    const { tz } = accountQuerySchema.parse(req.query)
    const existing = await findWritableAccount(req.userId, req.params.id)
    if(!adapterFor(existing.provider) || !existing.credentialsEncrypted) throw new HttpError(400, 'This account has no key to sync with.')
    if(isSyncing(existing.id)) throw new HttpError(409, 'This account is already syncing.')
    const wait = (lastSyncNow.get(existing.id) ?? 0) + SYNC_NOW_GAP_MS - Date.now()
    if(wait > 0) throw new HttpError(429, `Synced moments ago. Try again in ${Math.ceil(wait / 1000)} s.`)
    lastSyncNow.set(existing.id, Date.now())

    await syncAccount(existing.id)
    const account = await findOwnAccount(req.userId, existing.id)
    const [dto] = await withFigures(req.userId, [account], tz)
    res.status(200).json({ account: dto })
}

// GET /accounts/:id/positions  Open positions, as of the last sync (D-64).
export async function listPositions(req, res){
    const account = await findOwnAccount(req.userId, req.params.id)
    const positions = await prisma.position.findMany({ where: { accountId: account.id }, orderBy: { symbol: 'asc' } })
    res.status(200).json({ positions: positions.map(toPositionDTO) })
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
    // Open positions go too: nothing will update them any more.
    const account = existing.archivedAt ? existing : (await prisma.$transaction([
        prisma.position.deleteMany({ where: { accountId: existing.id } }),
        prisma.account.update({
            where: { id: existing.id },
            data: { archivedAt: new Date(), credentialsEncrypted: null, credentialHint: null, syncStatus: null, lastError: null },
        }),
    ]))[1]
    const [dto] = await withFigures(req.userId, [account], tz)
    res.status(200).json({ account: dto })
}

// Restore. A synced account comes back needing its credentials again (they were wiped).
export async function restoreAccount(req, res){
    const { tz } = accountQuerySchema.parse(req.query)
    const existing = await findOwnAccount(req.userId, req.params.id)
    const synced = isSyncedProvider(existing.provider)
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
    const account = await findManualAccount(req.userId, req.params.id)
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
    const account = await findManualAccount(req.userId, req.params.id)
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

// GET /accounts/:id/equity?days=90&tz=…  Daily equity for the chart (D-45). Manual
// accounts: rebuilt from trades and cash (D-19). Synced: the daily snapshots (D-64).
export async function getEquity(req, res){
    const { tz, days } = equityQuerySchema.parse(req.query)
    const account = await findOwnAccount(req.userId, req.params.id)
    const range = lastLocalDays(days, tz)
    if(usesReportedBalance(account)){
        const [snapshots, cash] = await Promise.all([
            prisma.balanceSnapshot.findMany({ where: { accountId: account.id }, orderBy: { takenAt: 'asc' }, select: { takenAt: true, equityUsd: true } }),
            prisma.cashMovement.findMany({ where: { accountId: account.id }, select: CASH_FIELDS }),
        ])
        return res.status(200).json({ points: snapshotSeries(snapshots, cash, range) })
    }
    const [trades, cash] = await loadActivity(req.userId, [account.id])
    res.status(200).json({ points: equitySeries(account, trades, cash, range) })
}
