import { useParams, useNavigate } from 'react-router-dom'
import TradeCard from '../components/trades/TradeCard'

// mock trade data until backend is operational
const MOCK_TRADES = [
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
  },
]

function formatDateLabel(dateStr) {
  const [year, month, day] = dateStr.split('-').map(Number)
  const date = new Date(year, month - 1, day)
  const monthNames = ['January','February','March','April','May','June',
    'July','August','September','October','November','December']
  return `${monthNames[date.getMonth()]} ${date.getDate()}`
}

export default function DailyLog() {
  const { date } = useParams()
  const navigate = useNavigate()

  const aggregatePnl = MOCK_TRADES.reduce((sum, t) => sum + t.pnl, 0)
  const wins = MOCK_TRADES.filter(t => t.pnl > 0).length
  const winRate = ((wins / MOCK_TRADES.length) * 100).toFixed(1)
  const volume = MOCK_TRADES.reduce((sum, t) => sum + t.lotSize, 0)
  const isProfit = aggregatePnl >= 0

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
        <span style={{ color: '#fff', fontSize: '17px', fontWeight: '500' }}>
          {formatDateLabel(date)} — Daily Log
        </span>
      </div>

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
          {isProfit ? '+' : '-'}${Math.abs(aggregatePnl).toLocaleString('en-US', { minimumFractionDigits: 2 })}
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
            <div style={{ color: '#e5e7eb', fontSize: '15px' }}>{volume.toFixed(1)} Lots</div>
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
          TRADE EXECUTION LOG ({MOCK_TRADES.length})
        </span>
        <button
          onClick={handleExport}
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

      {/* Trade cards */}
      <div style={{ padding: '0 1rem' }}>
        {MOCK_TRADES.map(trade => (
          <TradeCard key={trade.id} trade={trade} />
        ))}
      </div>

      {/* Load older */}
      <div style={{ textAlign: 'center', marginTop: '0.5rem' }}>
        <button style={{
          background: 'none',
          border: '1px solid #16a34a55',
          borderRadius: '8px',
          color: '#22c55e',
          fontSize: '12px',
          letterSpacing: '0.5px',
          padding: '10px 24px',
          cursor: 'pointer',
        }}>
          LOAD OLDER ENTRIES
        </button>
      </div>
    </div>
  )
}