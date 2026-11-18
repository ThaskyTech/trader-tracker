import { Link } from 'react-router-dom'
import Header from '../components/dashboard/Header'
import PnlCard from '../components/dashboard/PnLCard'
import WinRateCard from '../components/dashboard/WinRateCard'
import SystemStatusCard from '../components/dashboard/SystemStatusCard'
import CalendarGrid from '../components/calendar/CalendarGrid'
import OperationsLog from '../components/dashboard/OperationsLog'
import MarketAtmosphere from '../components/dashboard/MarketAtmosphere'

export default function Dashboard() {
  return (
    <div style={{ paddingBottom: '1.5rem' }}>
      <Header />
      <PnlCard />
      <WinRateCard />
      <SystemStatusCard />
      <CalendarGrid />
      <OperationsLog />
      <MarketAtmosphere />

      {/* Floating "log a trade" button, sitting just above the bottom nav. The right
          offset keeps it inside the 430px app column on wide screens. */}
      <Link
        to="/trades/new"
        aria-label="Log a trade"
        style={{
          position: 'fixed',
          bottom: 'calc(64px + 16px + env(safe-area-inset-bottom))',
          right: 'max(16px, calc(50vw - 215px + 16px))',
          width: '56px',
          height: '56px',
          borderRadius: '50%',
          backgroundColor: '#16a34a',
          color: '#fff',
          fontSize: '28px',
          lineHeight: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          textDecoration: 'none',
          boxShadow: '0 4px 16px #00000088',
        }}
      >
        +
      </Link>
    </div>
  )
}