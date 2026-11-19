import { useState } from 'react'
import WalletCard from './WalletCard'
import { CARD_HEIGHT, CARD_PEEK, isAutoSync, syncState } from '../../utils/accounts'
import { useCurrency } from '../../context/CurrencyContext'

// The quick-look panel is taller only when it has a problem to explain.
const PANEL_HEIGHT = 104
const PANEL_HEIGHT_WITH_PROBLEM = 132
const hasProblem = account => ['ERROR', 'RECONNECT', 'STALE'].includes(syncState(account))
const GAP = 12
// Each folded card shows enough of its top for the name to be read.
const PILE_STEP = 30
const EASE = 'cubic-bezier(0.2, 0.8, 0.2, 1)'

// Wallet-style stack (D-46).
//   Nothing selected: cards overlap, each showing its top strip.
//   Tap a card: it rises to the top with a quick-look panel; the rest fold into a pile below.
//   Tap the raised card again (or VIEW ACCOUNT): open its detail page.
//   Tap the pile: put the raised card back.
// items: [{ account, title, figures, share }]
export default function WalletStack({ items, onOpen, onAddTrade }) {
  const [selectedId, setSelectedId] = useState(null)
  const selectedIndex = items.findIndex(i => i.account.id === selectedId)
  const hasSelection = selectedIndex !== -1
  const panelHeight = hasSelection && hasProblem(items[selectedIndex].account) ? PANEL_HEIGHT_WITH_PROBLEM : PANEL_HEIGHT

  const pileTop = CARD_HEIGHT + GAP + panelHeight + GAP
  const height = hasSelection
    ? pileTop + Math.max(0, items.length - 2) * PILE_STEP + (items.length > 1 ? CARD_PEEK : 0)
    : Math.max(0, items.length - 1) * CARD_PEEK + CARD_HEIGHT

  const positionOf = index => {
    if(!hasSelection) return { top: index * CARD_PEEK, scale: 1 }
    if(index === selectedIndex) return { top: 0, scale: 1 }
    const pileIndex = index < selectedIndex ? index : index - 1
    // Slight shrink gives depth; kept small so the names in the pile stay legible.
    return { top: pileTop + pileIndex * PILE_STEP, scale: 0.97 + pileIndex * 0.005 }
  }

  return (
    // overflow hidden: when a card is raised, the pile shows only strips, not whole cards.
    // isolation: the cards' z-indexes order them against each other only. Without it they
    // compete with the rest of the page and paint over the fixed bottom nav.
    <div style={{ position: 'relative', height: `${height}px`, overflow: 'hidden', isolation: 'isolate', transition: `height 0.35s ${EASE}` }}>
      {items.map((item, index) => {
        const { top, scale } = positionOf(index)
        const isSelected = index === selectedIndex
        const handleClick = () => {
          if(isSelected) onOpen(item.account.id)
          else if(hasSelection) setSelectedId(null)
          else setSelectedId(item.account.id)
        }
        return (
          <div
            key={item.account.id}
            style={{
              position: 'absolute', left: 0, right: 0, top: 0,
              transform: `translateY(${top}px) scale(${scale})`,
              transformOrigin: 'top center',
              transition: `transform 0.35s ${EASE}`,
              zIndex: isSelected ? 100 : index,
            }}
          >
            <WalletCard
              account={item.account}
              title={item.title}
              figures={item.figures}
              share={item.share}
              onClick={handleClick}
              ariaLabel={
                isSelected ? `Open ${item.title}`
                  : hasSelection ? 'Put the card back'
                    : `Show ${item.title}`
              }
            />
          </div>
        )
      })}

      {hasSelection && (
        <QuickLook
          key={selectedId}
          item={items[selectedIndex]}
          height={panelHeight}
          onOpen={() => onOpen(selectedId)}
          onAddTrade={() => onAddTrade(selectedId)}
          onClose={() => setSelectedId(null)}
        />
      )}
    </div>
  )
}

// Quick look under a raised card: only figures the card doesn't already show, plus the
// two actions. The card has this month's P&L, so the panel completes the month (win
// rate, trade count) and adds net cash in, which tells how much of the equity is the
// user's own money rather than profit.
function QuickLook({ item, height, onOpen, onAddTrade, onClose }) {
  const { formatUsd } = useCurrency()
  const { account, figures } = item
  const { month } = figures
  const netCashIn = figures.deposits + figures.withdrawals
  const state = syncState(account)
  // Healthy accounts get no status row: the card's second line already says "synced 4 min ago".
  const problem = state === 'ERROR' || state === 'RECONNECT' ? account.lastError
    : state === 'STALE' ? 'Figures are older than expected. The next sync should refresh them.'
      : null

  return (
    <div style={{
      position: 'absolute', left: 0, right: 0, top: `${CARD_HEIGHT + GAP}px`, height: `${height}px`,
      backgroundColor: '#141414', borderRadius: '12px', padding: '12px 14px', boxSizing: 'border-box',
      display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
      animation: 'tt-fade-in 0.3s ease both', zIndex: 101,
    }}>
      <style>{'@keyframes tt-fade-in { from { opacity: 0; transform: translateY(-6px) } to { opacity: 1; transform: none } }'}</style>

      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px' }}>
        <Figure label="WIN RATE · MONTH" value={month.totalTrades ? `${month.winRate.toFixed(0)}%` : '—'} />
        <Figure label="TRADES · MONTH" value={String(month.totalTrades)} />
        <Figure label="NET CASH IN" value={formatUsd(netCashIn, { signed: true })} />
      </div>

      {problem && (
        <div style={{
          color: state === 'STALE' ? '#f59e0b' : '#ef4444', fontSize: '11px', lineHeight: 1.4,
          display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
        }}>
          {problem}
        </div>
      )}

      {/* No "+ TRADE" on a synced account: its trades come from the broker (D-63). */}
      <div style={{ display: 'grid', gridTemplateColumns: isAutoSync(account) ? '1fr auto' : '1fr 1fr auto', gap: '8px' }}>
        <button type="button" onClick={onOpen} style={buttonStyle(true)}>VIEW ACCOUNT</button>
        {!isAutoSync(account) && <button type="button" onClick={onAddTrade} style={buttonStyle(false)}>+ TRADE</button>}
        <button type="button" onClick={onClose} aria-label="Put the card back" style={{ ...buttonStyle(false), padding: '9px 12px' }}>✕</button>
      </div>
    </div>
  )
}

function Figure({ label, value }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ color: '#555', fontSize: '9px', letterSpacing: '1.5px', marginBottom: '4px' }}>{label}</div>
      <div style={{ color: '#e5e7eb', fontSize: '13px', whiteSpace: 'nowrap' }}>{value}</div>
    </div>
  )
}

const buttonStyle = primary => ({
  backgroundColor: primary ? '#16a34a' : 'transparent',
  border: primary ? 'none' : '1px solid #2a2a2a',
  borderRadius: '8px',
  color: primary ? '#fff' : '#9ca3af',
  fontSize: '11px',
  letterSpacing: '1px',
  padding: '9px 6px',
  cursor: 'pointer',
  fontFamily: 'monospace',
})
