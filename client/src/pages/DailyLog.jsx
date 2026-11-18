import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import TradeCard from '../components/trades/TradeCard'
import { tradeApi } from '../api/client'
import { useCurrency } from '../context/CurrencyContext'

const MONTH_NAMES = ['January','February','March','April','May','June',
  'July','August','September','October','November','December']

function formatDateLabel(dateStr) {
  const [year, month, day] = (dateStr ?? '').split('-').map(Number)
  if (!year || !month || !day) return 'Daily Log'
  const date = new Date(year, month - 1, day)
  return `${MONTH_NAMES[date.getMonth()]} ${date.getDate()}`
}

export default function DailyLog() {
  const { date } = useParams()
  // The key resets loading state when moving straight from one day to another.
  return <DailyLogInner key={date} date={date} />
}

function DailyLogInner({ date }) {
  const navigate = useNavigate()
  const [trades, setTrades] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    tradeApi.getTradesByDay(date)
      .then(data => { if (!cancelled) setTrades(data.trades) })
      .catch(err => { if (!cancelled) setError(err.message) })
    return () => { cancelled = true }
  }, [date])

  const addTrade = () => navigate(`/trades/new?date=${date}`)

  const handleExport = () => {
    // CSV export logic goes here later
    console.log('export CSV for', date)
  }

  return (
    <div style={{ paddingBottom: '1.5rem' }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        padding: '1rem',
      }}>
        <button
          onClick={() => navigate(-1)}
          aria-label="Back"
          style={{
            background: 'none',
            border: 'none',
            color: '#22c55e',
            fontSize: '20px',
            cursor: 'pointer',
            padding: 0,
            lineHeight: 1,
          }}
        >
          ←
        </button>
        <span style={{ color: '#fff', fontSize: '17px', fontWeight: '500', flex: 1 }}>
          {formatDateLabel(date)} — Daily Log
        </span>
        <button onClick={addTrade} style={outlineButtonStyle}>+ ADD</button>
      </div>

      {error && (
        <div style={{
          margin: '0 1rem',
          color: '#ef4444',
          fontSize: '12px',
          padding: '10px 12px',
          backgroundColor: '#ef444411',
          borderRadius: '8px',
          border: '1px solid #ef444433',
        }}>
          {error}
        </div>
      )}

      {!error && trades === null && (
        <div style={{ margin: '0 1rem', color: '#555', fontSize: '12px', letterSpacing: '1px' }}>LOADING...</div>
      )}

      {trades && <DayContent trades={trades} date={date} onAdd={addTrade} onExport={handleExport} navigate={navigate} />}
    </div>
  )
}

function DayContent({ trades, date, onAdd, onExport, navigate }) {
  const { formatUsd } = useCurrency()

  if (trades.length === 0) {
    return (
      <div style={{
        margin: '0 1rem',
        backgroundColor: '#141414',
        borderRadius: '12px',
        padding: '2rem 1rem',
        textAlign: 'center',
      }}>
        <div style={{ color: '#555', fontSize: '13px', marginBottom: '16px' }}>No trades closed on this day.</div>
        <button onClick={onAdd} style={outlineButtonStyle}>LOG A TRADE</button>
      </div>
    )
  }

  // Display-only totals. The server's summary endpoints do the exact Decimal maths.
  // Summed in USD (pnlUsd), since trades can be entered in different currencies.
  const aggregatePnl = trades.reduce((sum, t) => sum + t.pnlUsd, 0)
  const wins = trades.filter(t => t.pnlUsd > 0).length
  const winRate = ((wins / trades.length) * 100).toFixed(1)
  const volume = trades.reduce((sum, t) => sum + t.lotSize, 0)
  const isProfit = aggregatePnl >= 0

  return (
    <>
      {/* Aggregate card */}
      <div style={{
        margin: '0 1rem',
        backgroundColor: '#141414',
        borderRadius: '12px',
        padding: '1rem',
        border: '1px solid #16a34a33',
      }}>
        <div style={{ color: '#555', fontSize: '10px', letterSpacing: '1.5px', marginBottom: '8px' }}>
          AGGREGATE DAILY PERFORMANCE
        </div>
        <div style={{
          color: isProfit ? '#22c55e' : '#ef4444',
          fontSize: '26px',
          fontWeight: '600',
          marginBottom: '14px',
        }}>
          {formatUsd(aggregatePnl, { signed: true })}
        </div>

        <div style={{
          display: 'flex',
          gap: '24px',
          paddingTop: '12px',
          borderTop: '1px solid #1f1f1f',
        }}>
          <div>
            <div style={{ color: '#555', fontSize: '10px', letterSpacing: '1px', marginBottom: '4px' }}>
              WIN RATE
            </div>
            <div style={{ color: '#e5e7eb', fontSize: '15px' }}>{winRate}%</div>
          </div>
          <div>
            <div style={{ color: '#555', fontSize: '10px', letterSpacing: '1px', marginBottom: '4px' }}>
              VOLUME
            </div>
            <div style={{ color: '#e5e7eb', fontSize: '15px' }}>{volume.toFixed(2)} Lots</div>
          </div>
        </div>
      </div>

      {/* Trade list header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        margin: '1.25rem 1rem 0.75rem',
      }}>
        <span style={{ color: '#888', fontSize: '12px', letterSpacing: '0.5px' }}>
          TRADE EXECUTION LOG ({trades.length})
        </span>
        <button
          onClick={onExport}
          style={{
            background: 'none',
            border: '1px solid #333',
            borderRadius: '6px',
            color: '#888',
            fontSize: '11px',
            padding: '5px 10px',
            cursor: 'pointer',
          }}
        >
          CSV Export
        </button>
      </div>

      {/* Trade cards — tap one to edit it */}
      <div style={{ padding: '0 1rem' }}>
        {trades.map(trade => (
          <TradeCard
            key={trade.id}
            trade={trade}
            day={date}
            onClick={() => navigate(`/trades/${trade.id}/edit`)}
          />
        ))}
      </div>
    </>
  )
}

const outlineButtonStyle = {
  background: 'none',
  border: '1px solid #16a34a55',
  borderRadius: '8px',
  color: '#22c55e',
  fontSize: '12px',
  letterSpacing: '0.5px',
  padding: '8px 14px',
  cursor: 'pointer',
  fontFamily: 'monospace',
}
