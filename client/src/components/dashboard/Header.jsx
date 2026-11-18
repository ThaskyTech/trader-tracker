import { Link } from 'react-router-dom'
import { useCurrency } from '../../context/CurrencyContext'

// Top of the dashboard (D-40): net worth, the total equity of all accounts that aren't
// archived (D-02), and how it moved today from trading. The Accounts tab shows how it
// splits across accounts, so Home doesn't repeat that.
//   netWorth: USD, or undefined while loading. hasAccounts: false for a new user.
//   today:    USD P&L of trades closed today, or null when there were none, in which
//             case the line is left out rather than showing "+$0.00".
// No "LIVE" dot: nothing here updates live yet. It can return with Socket.IO pushes (D-10).
export default function Header({ netWorth, hasAccounts, today }) {
  const { formatUsd } = useCurrency()

  return (
    <div style={{ padding: '1.25rem 1rem 1rem' }}>
      <div style={{ color: '#555', fontSize: '13px', letterSpacing: '1.5px', marginBottom: '4px' }}>
        NET WORTH
      </div>

      {hasAccounts === false ? (
        <Link to="/accounts/new" style={{ color: '#22c55e', fontSize: '14px', textDecoration: 'none' }}>
          Add your first account →
        </Link>
      ) : (
        <>
          <div style={{ color: netWorth === undefined ? '#555' : '#fff', fontSize: '25px', fontWeight: '600', letterSpacing: '-0.5px' }}>
            {netWorth === undefined ? '—' : formatUsd(netWorth)}
          </div>
          {/* Trading only, like the equity chart: a deposit raises net worth but isn't a gain (D-27). */}
          {today != null && (
            <div style={{ color: today >= 0 ? '#22c55e' : '#ef4444', fontSize: '12px', marginTop: '4px' }}>
              {today >= 0 ? '▲' : '▼'} {formatUsd(Math.abs(today))} today from trading
            </div>
          )}
        </>
      )}
    </div>
  )
}
