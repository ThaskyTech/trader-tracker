import { CATEGORIES } from '../../utils/accounts'

// The app's name in one place (D-69, on trial). index.html's <title> and
// public/favicon.svg repeat it, because they're plain files outside React.
export const APP_NAME = 'Summa'

// What Summa is, in one line: everything you own added into one figure (D-02).
export const TAGLINE = 'Everything you own, in one number.'

// The mark: three cards stacked like the wallet (D-46), in the category colours
// (D-17). It's the app's own picture of what it does: separate accounts adding up to
// one total. On first show the cards drop into place one after another, once.
const LAYERS = [
  { key: 'STOCKS', y: 0 },
  { key: 'FOREX', y: 8 },
  { key: 'CRYPTO', y: 16 },
]

export function SummaMark({ size = 44, animate = true }) {
  return (
    <svg width={size} height={(size * 40) / 44} viewBox="0 0 44 40" role="img" aria-label={`${APP_NAME} logo`}>
      <style>{`
        @keyframes summa-drop { from { transform: translateY(-10px); opacity: 0 } to { transform: none; opacity: 1 } }
        @media (prefers-reduced-motion: reduce) { .summa-layer { animation: none !important } }
      `}</style>
      {LAYERS.map(({ key, y }, i) => {
        const color = CATEGORIES[key].color
        const front = i === LAYERS.length - 1
        // Each card has a solid backing, so the edges of the cards behind don't show through.
        return (
          <g key={key} className="summa-layer" style={animate ? { animation: `summa-drop 0.5s ${0.12 + i * 0.1}s ease both` } : undefined}>
            <rect x="0.75" y={y + 0.75} width="42.5" height="22.5" rx="5" fill="#0a0a0a" />
            <rect
              x="0.75" y={y + 0.75} width="42.5" height="22.5" rx="5"
              fill={color} fillOpacity={front ? 1 : 0.28}
              stroke={color} strokeWidth="1.5"
            />
          </g>
        )
      })}
    </svg>
  )
}

// Top of the sign-in and sign-up pages: the mark, the name as the only heading, and
// the tagline. Nothing else: the button says what the page does.
export function BrandHeader() {
  return (
    <div style={{ marginBottom: '2.5rem' }}>
      <SummaMark />
      <h1 style={{ margin: '18px 0 0', color: '#fff', fontSize: '34px', fontWeight: 600, letterSpacing: '-1px', lineHeight: 1.1 }}>
        {APP_NAME}
      </h1>
      <div style={{ color: '#777', fontSize: '13px', marginTop: '8px' }}>{TAGLINE}</div>
    </div>
  )
}
