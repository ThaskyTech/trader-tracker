import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import TradeCard from '../components/trades/TradeCard'
import { tradeApi } from '../api/client'
import { useCurrency } from '../context/CurrencyContext'
import { AccountFilterChip } from '../components/accounts/ui'
import { useAccounts } from '../context/AccountsContext'

// Trades per "page". Bots can log hundreds of trades, so History loads them in
// chunks instead of all at once.
const PAGE_SIZE = 50

// Each filter pill and the API parameters it sends. The server applies them to
// both the list and the totals, so the summary bar describes exactly the filtered trades.
const FILTERS = {
  ALL: {},
  LONG: { direction: 'LONG' },
  SHORT: { direction: 'SHORT' },
  PROFIT: { outcome: 'PROFIT' },
  LOSS: { outcome: 'LOSS' },
}

const MONTHS = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December'
]

// Trades arrive newest first, so consecutive trades in the same local month share a group.
function groupByMonth(trades) {
  const groups = []
  for (const trade of trades) {
    const d = new Date(trade.closedAt)
    const label = `${MONTHS[d.getMonth()]} ${d.getFullYear()}`
    if (groups.at(-1)?.label === label) groups.at(-1).trades.push(trade)
    else groups.push({ label, trades: [trade] })
  }
  return groups
}

export default function History() {
  // The filter lives in the URL (?filter=LOSS), so coming back from editing a
  // trade returns to the same filter.
  const [searchParams, setSearchParams] = useSearchParams()
  const requested = searchParams.get('filter')
  const filterKey = requested && Object.hasOwn(FILTERS, requested) ? requested : 'ALL'

  // ?account=… from an account's "VIEW ALL" (D-46). Archived accounts count: their trades
  // stay in History (D-18).
  // The id from the URL filters straight away; the chip appears once the accounts (for
  // its title) have loaded.
  const { byId, titleOf } = useAccounts()
  const accountParam = searchParams.get('account') || undefined
  const account = byId(accountParam)

  // Each control changes only its own part of the URL, so the account survives a filter change.
  const setParams = ({ filter = filterKey, accountId = accountParam }) => setSearchParams({
    ...(filter !== 'ALL' && { filter }),
    ...(accountId && { account: accountId }),
  }, { replace: true })

  return (
    <div style={{ paddingBottom: '1.5rem' }}>

      {/* One title: the old "TRADE HISTORY" eyebrow repeated it, and "All Sessions" said nothing. */}
      <div style={{ padding: '1.25rem 1rem 0' }}>
        <div style={{ color: '#fff', fontSize: '20px', fontWeight: '500' }}>
          Trade History
        </div>
      </div>

      {account && <AccountFilterChip account={account} title={titleOf(account)} onClear={() => setParams({ accountId: null })} />}

      {/* The key gives each filter fresh state: its own list, totals and paging. */}
      <HistoryResults
        key={`${filterKey}:${accountParam ?? 'all'}`}
        filterKey={filterKey}
        onFilter={filter => setParams({ filter })}
        accountId={accountParam}
      />
    </div>
  )
}

// accountId: History for one account. Its cards then leave out the account and source,
// which every card would repeat (D-45).
function HistoryResults({ filterKey, onFilter, accountId }) {
  const withinAccount = Boolean(accountId)
  const navigate = useNavigate()
  const { formatUsd } = useCurrency()

  const [trades, setTrades] = useState(null)
  const [nextCursor, setNextCursor] = useState(null)
  const [summary, setSummary] = useState(null)
  const [error, setError] = useState(null)
  const [loadingMore, setLoadingMore] = useState(false)
  const [loadMoreError, setLoadMoreError] = useState(null)

  useEffect(() => {
    let cancelled = false
    const params = { ...FILTERS[filterKey], accountId }
    Promise.all([
      tradeApi.listTrades({ ...params, limit: PAGE_SIZE }),
      tradeApi.getHistorySummary(params),
    ])
      .then(([page, totals]) => {
        if (cancelled) return
        setTrades(page.trades)
        setNextCursor(page.nextCursor)
        setSummary(totals)
      })
      .catch(err => { if (!cancelled) setError(err.message) })
    return () => { cancelled = true }
  }, [filterKey, accountId])

  const loadMore = async () => {
    setLoadingMore(true)
    setLoadMoreError(null)
    try {
      const page = await tradeApi.listTrades({ ...FILTERS[filterKey], accountId, limit: PAGE_SIZE, cursor: nextCursor })
      setTrades(current => [...current, ...page.trades])
      setNextCursor(page.nextCursor)
    } catch (err) {
      setLoadMoreError(err.message)
    } finally {
      setLoadingMore(false)
    }
  }

  const isProfit = (summary?.totalPnl ?? 0) >= 0
  const groups = trades ? groupByMonth(trades) : []

  return (
    <>
      {/* Summary bar */}
      <div style={{
        margin: '1rem',
        backgroundColor: '#141414',
        borderRadius: '12px',
        padding: '1rem',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        border: '1px solid #16a34a33',
      }}>
        <div>
          <div style={{ color: '#555', fontSize: '10px', letterSpacing: '1px', marginBottom: '4px' }}>
            TOTAL P/L
          </div>
          <div style={{
            color: summary ? (isProfit ? '#22c55e' : '#ef4444') : '#555',
            fontSize: '18px',
            fontWeight: '600',
          }}>
            {summary ? formatUsd(summary.totalPnl, { signed: true }) : '—'}
          </div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ color: '#555', fontSize: '10px', letterSpacing: '1px', marginBottom: '4px' }}>
            TRADES
          </div>
          <div style={{ color: '#e5e7eb', fontSize: '18px' }}>{summary ? summary.totalTrades : '—'}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ color: '#555', fontSize: '10px', letterSpacing: '1px', marginBottom: '4px' }}>
            WIN RATE
          </div>
          <div style={{ color: '#22d3ee', fontSize: '18px' }}>
            {summary ? `${summary.winRate.toFixed(1)}%` : '—'}
          </div>
        </div>
      </div>

      {/* Filter pills */}
      <div style={{
        display: 'flex',
        gap: '8px',
        padding: '0 1rem',
        overflowX: 'auto',
        marginBottom: '1rem',
        scrollbarWidth: 'none',
      }}>
        {Object.keys(FILTERS).map(filter => (
          <button
            key={filter}
            onClick={() => onFilter(filter)}
            aria-pressed={filterKey === filter}
            style={{
              background: filterKey === filter ? '#22c55e' : '#141414',
              border: filterKey === filter ? 'none' : '1px solid #2a2a2a',
              borderRadius: '20px',
              color: filterKey === filter ? '#000' : '#666',
              fontSize: '11px',
              letterSpacing: '0.5px',
              padding: '6px 14px',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              fontFamily: 'monospace',
              fontWeight: filterKey === filter ? '600' : '400',
              transition: 'all 0.15s',
            }}
          >
            {filter}
          </button>
        ))}
      </div>

      {error && <ErrorBox>{error}</ErrorBox>}

      {!error && trades === null && (
        <div style={{ margin: '0 1rem', color: '#555', fontSize: '12px', letterSpacing: '1px' }}>LOADING...</div>
      )}

      {trades?.length === 0 && (
        <div style={{ textAlign: 'center', marginTop: '3rem' }}>
          <div style={{ color: '#444', fontSize: '13px', letterSpacing: '0.5px', marginBottom: '16px' }}>
            {filterKey === 'ALL' ? 'NO TRADES YET' : 'NO TRADES MATCH THIS FILTER'}
          </div>
          {filterKey === 'ALL' && (
            <button onClick={() => navigate('/trades/new')} style={outlineButtonStyle}>LOG A TRADE</button>
          )}
        </div>
      )}

      {/* Grouped trade list. Cards show full dates (day = null), since a month holds many days. */}
      {groups.map(group => (
        <div key={group.label} style={{ padding: '0 1rem', marginBottom: '0.5rem' }}>
          <div style={{
            color: '#444',
            fontSize: '10px',
            letterSpacing: '1.5px',
            marginBottom: '10px',
            paddingBottom: '6px',
            borderBottom: '1px solid #1f1f1f',
          }}>
            {group.label.toUpperCase()}
          </div>
          {group.trades.map(trade => (
            <TradeCard
              key={trade.id}
              trade={trade}
              day={null}
              onClick={() => navigate(`/trades/${trade.id}/edit`)}
              withinAccount={withinAccount}
            />
          ))}
        </div>
      ))}

      {trades?.length > 0 && (
        <div style={{ textAlign: 'center', marginTop: '0.5rem', padding: '0 1rem' }}>
          <div style={{ color: '#444', fontSize: '11px', marginBottom: '10px' }}>
            Showing {trades.length} of {summary?.totalTrades ?? trades.length}
          </div>
          {loadMoreError && <ErrorBox>{loadMoreError}</ErrorBox>}
          {nextCursor && (
            <button onClick={loadMore} disabled={loadingMore} style={outlineButtonStyle}>
              {loadingMore ? 'LOADING...' : 'LOAD OLDER ENTRIES'}
            </button>
          )}
        </div>
      )}
    </>
  )
}

function ErrorBox({ children }) {
  return (
    <div role="alert" style={{
      margin: '0 1rem 0.75rem',
      color: '#ef4444',
      fontSize: '12px',
      padding: '10px 12px',
      backgroundColor: '#ef444411',
      borderRadius: '8px',
      border: '1px solid #ef444433',
      textAlign: 'left',
    }}>
      {children}
    </div>
  )
}

const outlineButtonStyle = {
  background: 'none',
  border: '1px solid #16a34a55',
  borderRadius: '8px',
  color: '#22c55e',
  fontSize: '12px',
  letterSpacing: '0.5px',
  padding: '10px 24px',
  cursor: 'pointer',
  fontFamily: 'monospace',
}
