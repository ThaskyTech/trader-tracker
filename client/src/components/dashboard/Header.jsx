import { Link } from 'react-router-dom'
import { useCurrency } from '../../context/CurrencyContext'

// Top of the dashboard (D-40): net worth, the total equity of all accounts that aren't
// archived (D-02), and how it moved today from trading. The Accounts tab shows how it
// splits across accounts, so Home doesn't repeat that.
//   netWorth: USD, or undefined while loading. hasAccounts: false for a new user.
//   today:    USD P&L of trades closed today, or null when there were none, in which
//             case the line is left out rather than showing "+$0.00".
//   live:     the server can push updates right now AND a synced account exists (D-66),
//             so these figures change by themselves. Otherwise no dot: it would claim
//             liveness that isn't there (D-48).
export default function Header({ netWorth, hasAccounts, today, live }) {
  const { formatUsd } = useCurrency()

  return (
    <div style={{ padding: '1.25rem 1rem 1rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: '#555', fontSize: '13px', letterSpacing: '1.5px', marginBottom: '4px' }}>
        NET WORTH
        {live && (
          <span title="Updates by itself after each sync" style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', color: '#22c55e', fontSize: '9px', letterSpacing: '1px' }}>
            <span aria-hidden style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#22c55e', animation: 'tt-live 2s ease-in-out infinite' }} />
            LIVE
            <style>{'@keyframes tt-live { 50% { opacity: 0.35 } }'}</style>
          </span>
        )}
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
