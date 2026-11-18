import { formatTradeTime } from '../../utils/format'
import { formatMoney } from '../../utils/currency'
import { useCurrency } from '../../context/CurrencyContext'

// `day` is the Daily Log's date ('YYYY-MM-DD'). Times on that day show as just
// the time; a trade opened on an earlier day also shows its date.
// withinAccount: on an account's own page, every trade has that account's broker and
// source, so both are left out instead of repeated on every card (D-45).
export default function TradeCard({ trade, day, onClick, withinAccount = false }) {
  const { displayCurrency, formatTradePnl } = useCurrency()
  const isProfit = trade.pnl >= 0
  const isLong = trade.direction === 'LONG'

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick?.() } }}
      aria-label={`Edit ${trade.symbol} ${trade.direction} trade`}
      style={{
        backgroundColor: '#141414',
        borderRadius: '12px',
        overflow: 'hidden',
        marginBottom: '10px',
        cursor: onClick ? 'pointer' : 'default',
      }}
    >
      {/* Top row — symbol, direction, source */}
      <div style={{
        backgroundColor: '#1a1a1a',
        padding: '10px 14px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{
            color: isLong ? '#22c55e' : '#ef4444',
            fontSize: '13px',
            fontWeight: '500',
            letterSpacing: '0.5px',
          }}>
            {trade.symbol}
          </span>
          <span style={{ color: '#444', fontSize: '12px' }}>•</span>
          <span style={{ color: '#888', fontSize: '12px', letterSpacing: '0.5px' }}>
            {trade.direction}
          </span>
        </div>

        {/* MANUAL for now. Broker-synced trades will show BINANCE, METAAPI, etc. */}
        {!withinAccount && <span style={{
          fontSize: '10px',
          letterSpacing: '0.5px',
          padding: '3px 8px',
          borderRadius: '4px',
          backgroundColor: isLong ? '#16a34a22' : '#dc262622',
          color: isLong ? '#22c55e' : '#ef4444',
          border: `1px solid ${isLong ? '#16a34a44' : '#dc262644'}`,
        }}>
          {trade.source}
        </span>}
      </div>

      {/* Detail grid */}
      <div style={{ padding: '12px 14px' }}>
        <div style={{
          display: 'grid',
          // Without the broker there are three fields, which fit on one row.
          gridTemplateColumns: withinAccount ? '1fr 1fr 1fr' : '1fr 1fr',
          gap: '10px',
          marginBottom: '12px',
        }}>
          {!withinAccount && <DetailField label="BROKER" value={trade.broker} />}
          <DetailField label="LOT SIZE" value={trade.lotSize.toFixed(2)} />
          <DetailField label="ENTRY" value={formatTradeTime(trade.openedAt, day)} />
          <DetailField label="EXIT" value={formatTradeTime(trade.closedAt, day)} />
        </div>

        <div>
          <div style={{ color: '#555', fontSize: '10px', letterSpacing: '1px', marginBottom: '4px' }}>
            NET P/L
          </div>
          <div style={{
            color: isProfit ? '#22c55e' : '#ef4444',
            fontSize: '15px',
            fontWeight: '500'
          }}>
            {formatTradePnl(trade, { signed: true })}
          </div>
          {trade.pnlCurrency !== displayCurrency && (
            <div style={{ color: '#555', fontSize: '11px', marginTop: '3px' }}>
              Entered as {formatMoney(trade.pnl, trade.pnlCurrency, { signed: true })}
            </div>
          )}
        </div>

        {trade.notes && (
          <div style={{ color: '#777', fontSize: '12px', marginTop: '10px', lineHeight: 1.4, whiteSpace: 'pre-wrap' }}>
            {trade.notes}
          </div>
        )}
      </div>
    </div>
  )
}

function DetailField({ label, value }) {
  return (
    <div>
      <div style={{ color: '#555', fontSize: '10px', letterSpacing: '1px', marginBottom: '4px' }}>
        {label}
      </div>
      <div style={{ color: '#ccc', fontSize: '13px' }}>
        {value}
      </div>
    </div>
  )
}
