import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import Header from '../components/dashboard/Header'
import PnlCard from '../components/dashboard/PnLCard'
import WinRateCard from '../components/dashboard/WinRateCard'
import SystemStatusCard from '../components/dashboard/SystemStatusCard'
import CalendarGrid from '../components/calendar/CalendarGrid'
import OperationsLog from '../components/dashboard/OperationsLog'
import MarketAtmosphere from '../components/dashboard/MarketAtmosphere'
import { tradeApi } from '../api/client'
import { useAccounts, netWorthOf } from '../context/AccountsContext'
import { toLocalDateString } from '../utils/tradeForm'

// month is 1-12. shiftMonth({ year: 2026, month: 1 }, -1) -> { year: 2025, month: 12 }
function shiftMonth({ year, month }, delta) {
  const index = year * 12 + (month - 1) + delta
  return { year: Math.floor(index / 12), month: (index % 12) + 1 }
}

function currentMonth() {
  const now = new Date()
  return { year: now.getFullYear(), month: now.getMonth() + 1 }
}

// The dashboard loads its data here and hands it to the cards, which only display it.
// The P&L card, win rate card and calendar all follow the month the calendar shows.
// Everything reloads when a broker sync lands (syncVersion, D-66).
export default function Dashboard() {
  const [view, setView] = useState(currentMonth)
  // Net worth comes from the shared accounts list, so it matches the Accounts tab exactly.
  const { accounts, active, synced, live, syncVersion } = useAccounts()
  const { year, month: monthNumber } = view
  const viewKey = `${year}-${monthNumber}`

  // Each result is tagged with the month it belongs to, so a slow response for
  // October can't overwrite November after the user has already moved on.
  const [monthData, setMonthData] = useState(null)
  const [monthError, setMonthError] = useState(null)
  const [overview, setOverview] = useState(null)
  const [overviewError, setOverviewError] = useState(null)

  useEffect(() => {
    let cancelled = false
    const key = `${year}-${monthNumber}`
    const previous = shiftMonth({ year, month: monthNumber }, -1)

    Promise.all([
      tradeApi.getMonthlySummary(year, monthNumber),
      tradeApi.getMonthlySummary(previous.year, previous.month),
      tradeApi.getCalendarSummary(year, monthNumber),
    ])
      .then(([summary, previousSummary, calendar]) => {
        if (!cancelled) setMonthData({ key, summary, previousSummary, days: calendar.days })
      })
      .catch(err => { if (!cancelled) setMonthError({ key, message: err.message }) })

    return () => { cancelled = true }
  }, [year, monthNumber, syncVersion])

  // Not tied to the month: today's trades (for the header's change) and the latest trades.
  useEffect(() => {
    let cancelled = false
    Promise.all([tradeApi.getTradesByDay(toLocalDateString(new Date())), tradeApi.getRecentTrades(5)])
      .then(([today, recent]) => {
        if (cancelled) return
        const todayPnl = today.trades.length ? today.trades.reduce((sum, t) => sum + t.pnlUsd, 0) : null
        setOverview({ todayPnl, recentTrades: recent.trades })
      })
      .catch(err => { if (!cancelled) setOverviewError(err.message) })
    return () => { cancelled = true }
  }, [syncVersion])

  const month = monthData?.key === viewKey ? monthData : null
  const error = (monthError?.key === viewKey ? monthError.message : null) ?? overviewError

  return (
    <div style={{ paddingBottom: '1.5rem' }}>
      <Header
        netWorth={accounts === null ? undefined : netWorthOf(active)}
        hasAccounts={accounts === null ? undefined : active.length > 0}
        today={overview?.todayPnl}
        live={live && synced.length > 0}
      />

      {error && (
        <div role="alert" style={{
          margin: '0 1rem 0.75rem',
          color: '#ef4444',
          fontSize: '12px',
          padding: '10px 12px',
          backgroundColor: '#ef444411',
          borderRadius: '8px',
          border: '1px solid #ef444433',
        }}>
          Couldn't load your data: {error}
        </div>
      )}

      <PnlCard view={view} summary={month?.summary} previousSummary={month?.previousSummary} />
      <WinRateCard summary={month?.summary} />
      <SystemStatusCard />
      <CalendarGrid
        view={view}
        days={month?.days}
        onPrev={() => setView(v => shiftMonth(v, -1))}
        onNext={() => setView(v => shiftMonth(v, 1))}
      />
      <OperationsLog trades={overview?.recentTrades} />
      <MarketAtmosphere />

      {/* Floating "log a trade" button, sitting just above the bottom nav. The right
          offset keeps it inside the 430px app column on wide screens. */}
      <Link
        to="/trades/new"
        aria-label="Log a trade"
        style={{
          position: 'fixed',
          bottom: 'calc(64px + 16px + env(safe-area-inset-bottom))',
          right: 'max(16px, calc(50vw - 215px + 16px))',
          width: '56px',
          height: '56px',
          borderRadius: '50%',
          backgroundColor: '#16a34a',
          color: '#fff',
          fontSize: '28px',
          lineHeight: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          textDecoration: 'none',
          boxShadow: '0 4px 16px #00000088',
        }}
      >
        +
      </Link>
    </div>
  )
}
