export default function SystemStatusCard() {
  return (
    <div style={{
      margin: '0.75rem 1rem 0',
      backgroundColor: '#141414',
      borderRadius: '12px',
      padding: '1rem',
      border: '1px solid #16a34a33',
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        marginBottom: '10px',
      }}>
        <div style={{
          width: '7px',
          height: '7px',
          borderRadius: '50%',
          backgroundColor: '#22c55e',
        }} />
        <span style={{ color: '#22c55e', fontSize: '10px', letterSpacing: '1.5px' }}>
          SYSTEM STATUS
        </span>
      </div>

      <div style={{ color: '#e5e7eb', fontSize: '13px', letterSpacing: '0.5px', marginBottom: '8px' }}>
        ENCRYPTED CONNECTION<br />STABLE
      </div>

      <div style={{ color: '#444', fontSize: '11px', letterSpacing: '0.5px' }}>
        Node: <span style={{ color: '#666' }}>SHANGHAI_04</span>
        {' '}|{' '}
        Latency: <span style={{ color: '#22c55e' }}>14ms</span>
      </div>
    </div>
  )
}