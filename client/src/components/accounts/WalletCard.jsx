import { CARD_HEIGHT, CATEGORIES, freshnessLine } from '../../utils/accounts'
import { formatMoney, fromUsd } from '../../utils/currency'
import { useCurrency } from '../../context/CurrencyContext'

// One account drawn as a wallet card (D-46). Every slot has one job (D-47); a slot
// with nothing useful to say stays empty rather than showing filler.
//
//   ┌─────────────────────────────────────────────┐
//   │ Title (broker · style)               Equity │  which account / what it's worth
//   │ Platform · freshness      +P&L this month   │  can I trust it / how is it doing
//   │                                             │
//   │ OF NET WORTH   FLOATING (live accounts only)│  its weight / open risk
//   │                                             │
//   │ Native equity (only if ≠ display)  CATEGORY │  matches the broker app / niche
//   └─────────────────────────────────────────────┘
//
// The top 64px is all that shows while the card sits in the stack, so the first two
// lines carry the figures that matter most.
export default function WalletCard({ account, title, figures, share, onClick, ariaLabel, style }) {
  const { displayCurrency, rates, formatUsd } = useCurrency()
  const category = CATEGORIES[account.category]
  const freshness = freshnessLine(account)
  const monthPnl = figures.month.totalPnl
  const hasMonthTrades = figures.month.totalTrades > 0
  const hasLivePositions = Boolean(account.positions)
  const floating = figures.floating

  // The equity in the account's own currency, so it can be checked against the broker's
  // app at a glance. Pointless (identical) when the account is already in the display currency.
  const native = account.currency !== displayCurrency ? fromUsd(figures.equity, account.currency, rates) : null

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel ?? `${title}, ${formatUsd(figures.equity)}`}
      style={{
        display: 'block',
        width: '100%',
        height: `${CARD_HEIGHT}px`,
        padding: 0,
        textAlign: 'left',
        fontFamily: 'monospace',
        cursor: onClick ? 'pointer' : 'default',
        borderRadius: '16px',
        border: `1px solid ${category.color}55`,
        // Frosted glass: the card stays slightly see-through, but what's behind it is
        // blurred and dimmed, so the title of the card underneath can't clash with this one.
        // For a fully solid card, set the base alpha to ff (#0f0f0fff).
        backgroundColor: '#0f0f0fd9',
        backgroundImage: `linear-gradient(135deg, ${category.color}38 0%, #17171780 48%, #0f0f0f00 100%)`,
        backdropFilter: 'blur(14px) saturate(140%)',
        WebkitBackdropFilter: 'blur(14px) saturate(140%)',
        boxShadow: '0 -6px 18px #00000099',
        overflow: 'hidden',
        position: 'relative',
        color: '#e5e7eb',
        ...style,
      }}
    >
      {/* Soft highlight, the "plastic" sheen of a card */}
      <span aria-hidden style={{
        position: 'absolute', inset: 0,
        background: 'radial-gradient(120% 60% at 0% 0%, #ffffff14 0%, transparent 60%)',
        pointerEvents: 'none',
      }} />

      {/* Peek strip: visible in the stack. Title sits high so it reads in the folded pile too. */}
      <span style={{ position: 'relative', display: 'block', padding: '9px 16px 0', height: '64px', boxSizing: 'border-box' }}>
        <span style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '10px' }}>
          <span style={{ color: '#fff', fontSize: '15px', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>
            {title}
          </span>
          <span style={{ color: '#fff', fontSize: '15px', fontWeight: 600, flexShrink: 0 }}>
            {formatUsd(figures.equity)}
          </span>
        </span>
        <span style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '10px', marginTop: '6px', fontSize: '11px' }}>
          <span style={{ color: freshness.color, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>
            {freshness.text}
          </span>
          {/* Closed-trade P&L only: deposits aren't performance (D-27). Empty month = nothing to say. */}
          {hasMonthTrades && (
            <span style={{ color: monthPnl > 0 ? '#22c55e' : monthPnl < 0 ? '#ef4444' : '#9ca3af', flexShrink: 0 }}>
              {formatUsd(monthPnl, { signed: true })} this month
            </span>
          )}
        </span>
      </span>

      {/* Body: visible on the front card */}
      <span style={{ position: 'relative', display: 'flex', gap: '28px', padding: '18px 16px 0' }}>
        {share !== undefined && <Stat label="OF NET WORTH" value={`${share.toFixed(1)}%`} />}
        {/* Manual accounts have no live positions, so there's no floating figure to show (not even "—"). */}
        {hasLivePositions && (
          <Stat
            label="FLOATING"
            value={formatUsd(floating, { signed: true })}
            color={floating > 0 ? '#22c55e' : floating < 0 ? '#ef4444' : '#e5e7eb'}
          />
        )}
      </span>

      <span style={{
        position: 'absolute', left: '16px', right: '16px', bottom: '14px',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px',
      }}>
        <span style={{ color: '#9ca3af', fontSize: '12px' }}>
          {native !== null && `${formatMoney(native, account.currency)} at broker`}
        </span>
        {/* The label stays even though the tint shows the category: colour alone isn't reliable for everyone. */}
        <span style={{
          fontSize: '9px', letterSpacing: '1px', padding: '3px 7px', borderRadius: '4px', color: '#e5e7eb',
          backgroundColor: `${category.color}2a`, border: `1px solid ${category.color}66`, flexShrink: 0,
        }}>
          {category.label.toUpperCase()}
        </span>
      </span>
    </button>
  )
}

function Stat({ label, value, color = '#e5e7eb' }) {
  return (
    <span style={{ display: 'block' }}>
      <span style={{ display: 'block', color: '#6b7280', fontSize: '9px', letterSpacing: '1.5px', marginBottom: '4px' }}>{label}</span>
      <span style={{ display: 'block', color, fontSize: '14px' }}>{value}</span>
    </span>
  )
}
