import prisma from '../../config/db.js'
import { notifyUser } from '../../sockets/index.js'
import { decryptCredentials } from '../../utils/secrets.js'
import { getRateForDate, toUsd } from '../fx.service.js'
import { binanceAdapter } from './binance.adapter.js'

// Runs one account's sync and saves the result (D-64, D-65). The scheduler calls it
// every ~10 minutes; "Sync now" and connecting an account call it directly.

const ADAPTERS = { BINANCE: binanceAdapter }
export const adapterFor = provider => ADAPTERS[provider] ?? null
export const SYNCABLE_PROVIDERS = Object.keys(ADAPTERS)

// Accounts syncing right now. One sync per account at a time: the timer and a
// "Sync now" tap must not both import the same trades.
const running = new Set()
export const isSyncing = accountId => running.has(accountId)

// --- Failures and backoff (D-65) ---

const BACKOFF_START_MS = 10 * 60e3
const BACKOFF_MAX_MS = 6 * 3600e3
const failures = new Map() // accountId -> { count, nextAt }

export const isDue = (accountId, now = Date.now()) => (failures.get(accountId)?.nextAt ?? 0) <= now

export function backoffDelay(count){
    return Math.min(BACKOFF_START_MS * 2 ** Math.max(0, count - 1), BACKOFF_MAX_MS)
}

// What went wrong, in words for the account page, and what it does to the account:
// RECONNECT stops syncing until the key is replaced; ERROR keeps retrying.
export function describeFailure(err){
    switch(err.kind){
        case 'AUTH': return { status: 'RECONNECT', message: 'Binance rejected the key: it may have been deleted or lost a permission. Replace the key to reconnect.' }
        case 'CREDENTIALS': return { status: 'RECONNECT', message: "The stored key can't be read (the server's ENCRYPTION_KEY changed). Replace the key to reconnect." }
        case 'LOCATION': return { status: 'ERROR', message: "Binance refused the server's location (it blocks some countries, including the US). The server's hosting region needs to change." }
        case 'RATE_LIMIT': return { status: 'ERROR', message: 'Binance asked the app to slow down. It will retry automatically.' }
        case 'NETWORK': return { status: 'ERROR', message: `${err.message} It will retry automatically.` }
        default: return { status: 'ERROR', message: `Sync failed: ${String(err.message).slice(0, 200)}` }
    }
}

// --- Saving ---

const utcDate = moment => new Date(new Date(moment).toISOString().slice(0, 10))

// Everything one sync learned, saved in a single transaction: if any of it fails,
// nothing is saved and the cursor doesn't move, so the next sync reads the same
// records again. Trades and transfers are keyed by externalId, so nothing doubles.
async function saveResult(account, result, now){
    const rate = await getRateForDate(result.currency, new Date(now))
    const usd = amount => toUsd(amount, rate)
    const balanceUsd = usd(result.balance)
    const floatingUsd = usd(result.floating)

    const trades = []
    for(const trade of result.trades){
        const fxRate = await getRateForDate(result.currency, trade.closedAt)
        trades.push({
            ...trade,
            userId: account.userId,
            accountId: account.id,
            source: account.provider,
            pnlCurrency: result.currency,
            fxRate,
            pnlUsd: toUsd(trade.pnl, fxRate),
        })
    }
    const cash = []
    for(const movement of result.cash){
        const fxRate = await getRateForDate(result.currency, movement.occurredAt)
        cash.push({
            ...movement,
            accountId: account.id,
            currency: result.currency,
            fxRate,
            amountUsd: toUsd(movement.amount, fxRate),
            origin: 'SYNCED',
        })
    }

    const today = utcDate(now)
    const snapshot = { balanceUsd, equityUsd: balanceUsd.plus(floatingUsd), takenAt: new Date(now) }
    const opening = result.opening && {
        openingBalance: result.opening.balance,
        openingFxRate: rate,
        openingBalanceUsd: usd(result.opening.balance),
        openingDate: result.opening.date,
    }

    await prisma.$transaction([
        prisma.trade.createMany({ data: trades, skipDuplicates: true }),
        prisma.cashMovement.createMany({ data: cash, skipDuplicates: true }),
        prisma.position.deleteMany({ where: { accountId: account.id } }),
        prisma.position.createMany({ data: result.positions.map(p => ({ ...p, accountId: account.id })) }),
        ...(result.history ? [prisma.balanceSnapshot.createMany({
            data: result.history.map(day => ({
                accountId: account.id, date: new Date(day.date), balanceUsd: usd(day.balanceUsd),
                equityUsd: usd(day.balanceUsd), takenAt: day.takenAt,
            })),
            skipDuplicates: true,
        })] : []),
        prisma.balanceSnapshot.upsert({
            where: { accountId_date: { accountId: account.id, date: today } },
            create: { accountId: account.id, date: today, ...snapshot },
            update: snapshot,
        }),
        prisma.account.update({
            where: { id: account.id },
            data: {
                reportedBalance: result.balance,
                reportedBalanceUsd: balanceUsd,
                reportedFloating: result.floating,
                reportedFloatingUsd: floatingUsd,
                syncCursor: result.cursor,
                lastSyncedAt: new Date(now),
                syncStatus: 'OK',
                lastError: null,
                ...opening,
            },
        }),
    ])
    return { newTrades: trades.length }
}

// Syncs one account. Never throws: the outcome is saved on the account (D-14) and
// returned as { ok, kind?, skipped? }. The user's open screens are told either way.
export async function syncAccount(accountId, { now = Date.now(), deps } = {}){
    if(running.has(accountId)) return { ok: false, skipped: 'already syncing' }
    running.add(accountId)
    let account = null
    try {
        account = await prisma.account.findUnique({ where: { id: accountId } })
        const adapter = account && adapterFor(account.provider)
        if(!adapter || account.archivedAt || !account.credentialsEncrypted) return { ok: false, skipped: 'not connected' }

        let credentials
        try {
            credentials = decryptCredentials(account.credentialsEncrypted, account.id)
        } catch (err) {
            throw Object.assign(new Error(err.message), { kind: 'CREDENTIALS' })
        }

        const result = await adapter.sync({ credentials, cursor: account.syncCursor, now }, deps)
        if(result.mismatches.length) console.warn(`Sync ${account.id}: position mismatch on ${result.mismatches.join(', ')}; tracks reset.`)
        const saved = await saveResult(account, result, now)
        failures.delete(accountId)
        return { ok: true, ...saved }
    } catch (err) {
        if(!account) throw err // the database itself failed: nothing to record it on
        const { status, message } = describeFailure(err)
        const count = (failures.get(accountId)?.count ?? 0) + 1
        failures.set(accountId, { count, nextAt: now + backoffDelay(count) })
        console.error(`Sync ${account.id} (${account.provider}) failed:`, err.kind ?? '', err.message)
        await prisma.account.update({ where: { id: account.id }, data: { syncStatus: status, lastError: message } })
        return { ok: false, kind: err.kind ?? 'OTHER', message }
    } finally {
        running.delete(accountId)
        if(account) notifyUser(account.userId, 'accounts:changed', { accountId })
    }
}

// Accounts the scheduler should sync: connected, not archived, not waiting for a new key.
export function findSyncableAccounts(){
    return prisma.account.findMany({
        where: {
            archivedAt: null,
            credentialsEncrypted: { not: null },
            provider: { in: SYNCABLE_PROVIDERS },
            OR: [{ syncStatus: null }, { syncStatus: { not: 'RECONNECT' } }],
        },
        select: { id: true },
        orderBy: { createdAt: 'asc' },
    })
}

// Starts a sync without waiting for it (connecting an account, a new key). The result
// reaches the browser through the socket.
export function syncInBackground(accountId){
    syncAccount(accountId).catch(err => console.error(`Background sync ${accountId} failed:`, err))
}

// Test helper.
export function resetSyncState(){ running.clear(); failures.clear() }
