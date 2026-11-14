const LOG_ENTRIES = [
  {
    id: 1,
    time: '14:02:11',
    type: 'EXECUTION',
    typeColor: '#22c55e',
    message: 'LONG BTC/USDT @ $64,201.50 - [SUCCESS]',
  },
  {
    id: 2,
    time: '13:58:44',
    type: 'LIQUIDATION_ALERT',
    typeColor: '#f59e0b',
    message: 'ETH POSITION REBALANCED @ 2.5X',
  },
  {
    id: 3,
    time: '13:12:01',
    type: 'HARVEST',
    typeColor: '#22d3ee',
    message: '+2.4 ETH REDEEMED FROM STAKING VAULT',
  },
]

export default function OperationsLog() {
  return (
    <div style={{
      margin: '0.75rem 1rem 0',
      backgroundColor: '#141414',
      borderRadius: '12px',
      padding: '1rem',
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: '12px',
      }}>
        <span style={{ color: '#22c55e', fontSize: '10px', letterSpacing: '1.5px' }}>
          CRITICAL_OPERATIONS
        </span>
        <div style={{
          width: '7px',
          height: '7px',
          borderRadius: '50%',
          backgroundColor: '#22c55e',
        }} />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {LOG_ENTRIES.map(entry => (
          <div key={entry.id} style={{
            display: 'flex',
            gap: '10px',
            borderLeft: `2px solid ${entry.typeColor}33`,
            paddingLeft: '10px',
          }}>
            <span style={{ color: '#444', fontSize: '11px', minWidth: '60px', paddingTop: '1px' }}>
              {entry.time}
            </span>
            <div>
              <span style={{ color: entry.typeColor, fontSize: '11px', letterSpacing: '0.5px' }}>
                {entry.type}:{' '}
              </span>
              <span style={{ color: '#888', fontSize: '11px' }}>
                {entry.message}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}