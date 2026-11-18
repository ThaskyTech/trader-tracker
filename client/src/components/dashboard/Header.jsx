import { useCurrency } from '../../context/CurrencyContext'

// Top of the dashboard. This becomes total net worth once broker balances sync.
// Until then it shows all-time realised P&L from logged trades.
export default function Header({ history }) {
  const { formatUsd } = useCurrency()
  const total = history?.totalPnl
  const color = total === undefined ? '#555' : total < 0 ? '#ef4444' : '#22c55e'

  return (
    <div style={{
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      padding: '1rem',
      paddingTop: '1.25rem',
    }}>

      <div>
        <div style={{
          color: '#555',
          fontSize: '13px',
          letterSpacing: '1.5px',
          marginBottom: '4px',
        }}>
          ALL-TIME REALISED P/L
        </div>
        <div style={{
          color,
          fontSize: '25px',
          fontWeight: '600',
          letterSpacing: '-0.5px',
        }}>
          {total === undefined ? '—' : formatUsd(total, { signed: true })}
        </div>
      </div>

      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        marginTop: '4px',
      }}>
        <div style={{
          width: '8px',
          height: '8px',
          borderRadius: '50%',
          backgroundColor: '#22c55e',
          animation: 'pulse 2s infinite',
        }} />
        <span style={{ color: '#555', fontSize: '10px', letterSpacing: '1px' }}>LIVE</span>
      </div>
    </div>
  )
}