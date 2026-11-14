import { useState } from 'react'
import TradeCard from '../components/trades/TradeCard'

const MOCK_HISTORY = [
  {
    id: 1,
    symbol: 'BTC/USD',
    direction: 'LONG',
    status: 'EXECUTED',
    broker: 'IC Markets',
    lotSize: 2.5,
    entryTime: '08:14:02',
    exitTime: '09:45:51',
    pnl: 1250.00,
    date: '2024-10-24',
  },
  {
    id: 2,
    symbol: 'ETH/USD',
    direction: 'SHORT',
    status: 'EXECUTED',
    broker: 'IC Markets',
    lotSize: 5.0,
    entryTime: '11:02:44',
    exitTime: '11:15:20',
    pnl: -450.25,
    date: '2024-10-24',
  },
  {
    id: 3,
    symbol: 'XRP/USD',
    direction: 'LONG',
    status: 'EXECUTED',
    broker: 'FTMO',
    lotSize: 10.0,
    entryTime: '14:30:00',
    exitTime: '15:45:12',
    pnl: 2621.33,
    date: '2024-10-24',
  },
  {
    id: 4,
    symbol: 'US30',
    direction: 'LONG',
    status: 'EXECUTED',
    broker: 'FTMO',
    lotSize: 1.0,
    entryTime: '09:30:00',
    exitTime: '10:15:00',
    pnl: 3420.00,
    date: '2024-10-18',
  },
  {
    id: 5,
    symbol: 'GOLD',
    direction: 'SHORT',
    status: 'EXECUTED',
    broker: 'IC Markets',
    lotSize: 3.0,
    entryTime: '13:00:00',
    exitTime: '14:30:00',
    pnl: -890.50,
    date: '2024-10-18',
  },
  {
    id: 6,
    symbol: 'ETH/USD',
    direction: 'LONG',
    status: 'EXECUTED',
    broker: 'Binance',
    lotSize: 8.0,
    entryTime: '10:00:00',
    exitTime: '11:45:00',
    pnl: 1875.00,
    date: '2024-09-30',
  },
  {
    id: 7,
    symbol: 'BTC/USD',
    direction: 'SHORT',
    status: 'EXECUTED',
    broker: 'Binance',
    lotSize: 4.0,
    entryTime: '15:00:00',
    exitTime: '15:45:00',
    pnl: -320.75,
    date: '2024-09-15',
  },
]

const MONTHS = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December'
]

function getMonthLabel(dateStr) {
  const [year, month] = dateStr.split('-').map(Number)
  return `${MONTHS[month - 1]} ${year}`
}

function groupByMonth(trades) {
  return trades.reduce((groups, trade) => {
    const label = getMonthLabel(trade.date)
    if (!groups[label]) groups[label] = []
    groups[label].push(trade)
    return groups
  }, {})
}

const FILTERS = ['ALL', 'LONG', 'SHORT', 'PROFIT', 'LOSS']

export default function History() {
  const [activeFilter, setActiveFilter] = useState('ALL')

  const filtered = MOCK_HISTORY.filter(trade => {
    if (activeFilter === 'LONG') return trade.direction === 'LONG'
    if (activeFilter === 'SHORT') return trade.direction === 'SHORT'
    if (activeFilter === 'PROFIT') return trade.pnl > 0
    if (activeFilter === 'LOSS') return trade.pnl < 0
    return true
  })

  const grouped = groupByMonth(filtered)
  const totalPnl = filtered.reduce((sum, t) => sum + t.pnl, 0)
  const wins = filtered.filter(t => t.pnl > 0).length
  const winRate = filtered.length > 0
    ? ((wins / filtered.length) * 100).toFixed(1)
    : '0.0'
  const isProfit = totalPnl >= 0

  return (
    <div style={{ paddingBottom: '1.5rem' }}>

      {/* Header */}
      <div style={{ padding: '1.25rem 1rem 0' }}>
        <div style={{ color: '#555', fontSize: '10px', letterSpacing: '1.5px', marginBottom: '4px' }}>
          TRADE HISTORY
        </div>
        <div style={{ color: '#fff', fontSize: '20px', fontWeight: '500' }}>
          All Sessions
        </div>
      </div>

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
            color: isProfit ? '#22c55e' : '#ef4444',
            fontSize: '18px',
            fontWeight: '600',
          }}>
            {isProfit ? '+' : '-'}${Math.abs(totalPnl).toLocaleString('en-US', { minimumFractionDigits: 2 })}
          </div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ color: '#555', fontSize: '10px', letterSpacing: '1px', marginBottom: '4px' }}>
            TRADES
          </div>
          <div style={{ color: '#e5e7eb', fontSize: '18px' }}>{filtered.length}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ color: '#555', fontSize: '10px', letterSpacing: '1px', marginBottom: '4px' }}>
            WIN RATE
          </div>
          <div style={{ color: '#22d3ee', fontSize: '18px' }}>{winRate}%</div>
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
        {FILTERS.map(filter => (
          <button
            key={filter}
            onClick={() => setActiveFilter(filter)}
            style={{
              background: activeFilter === filter ? '#22c55e' : '#141414',
              border: activeFilter === filter ? 'none' : '1px solid #2a2a2a',
              borderRadius: '20px',
              color: activeFilter === filter ? '#000' : '#666',
              fontSize: '11px',
              letterSpacing: '0.5px',
              padding: '6px 14px',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              fontFamily: 'monospace',
              fontWeight: activeFilter === filter ? '600' : '400',
              transition: 'all 0.15s',
            }}
          >
            {filter}
          </button>
        ))}
      </div>

      {/* Grouped trade list */}
      {Object.keys(grouped).length === 0 ? (
        <div style={{
          textAlign: 'center',
          color: '#444',
          fontSize: '13px',
          marginTop: '3rem',
          letterSpacing: '0.5px',
        }}>
          NO TRADES MATCH THIS FILTER
        </div>
      ) : (
        Object.entries(grouped).map(([month, trades]) => (
          <div key={month} style={{ padding: '0 1rem', marginBottom: '0.5rem' }}>
            <div style={{
              color: '#444',
              fontSize: '10px',
              letterSpacing: '1.5px',
              marginBottom: '10px',
              paddingBottom: '6px',
              borderBottom: '1px solid #1f1f1f',
            }}>
              {month.toUpperCase()}
            </div>
            {trades.map(trade => (
              <TradeCard key={trade.id} trade={trade} />
            ))}
          </div>
        ))
      )}
    </div>
  )
}