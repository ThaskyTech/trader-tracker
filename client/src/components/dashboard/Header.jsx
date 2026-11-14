export default function Header() {
  return (
    <div style={{
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      padding: '1rem',
      paddingTop: '1.25rem',
    }}>

      <div>
        <div style={{
          color: '#555',
          fontSize: '13px',
          letterSpacing: '1.5px',
          marginBottom: '4px',
        }}>
          COMMAND CENTER BALANCE
        </div>
        <div style={{
          color: '#22c55e',
          fontSize: '25px',
          fontWeight: '600',
          letterSpacing: '-0.5px',
        }}>
          $142,509.32
        </div>
      </div>

      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        marginTop: '4px',
      }}>
        <div style={{
          width: '8px',
          height: '8px',
          borderRadius: '50%',
          backgroundColor: '#22c55e',
          animation: 'pulse 2s infinite',
        }} />
        <span style={{ color: '#555', fontSize: '10px', letterSpacing: '1px' }}>LIVE</span>
      </div>
    </div>
  )
}