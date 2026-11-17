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
    </div>
  )
}