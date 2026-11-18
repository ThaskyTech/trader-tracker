// Shared input style for the Accounts screens (matches the trade form's inputs).
// 16px font stops iOS Safari zooming in on focus; colorScheme dark styles native pickers.
export const inputStyle = hasError => ({
  width: '100%',
  backgroundColor: '#141414',
  border: `1px solid ${hasError ? '#ef444488' : '#2a2a2a'}`,
  borderRadius: '10px',
  color: '#e5e7eb',
  fontSize: '16px',
  padding: '13px',
  fontFamily: 'monospace',
  boxSizing: 'border-box',
  outline: 'none',
  colorScheme: 'dark',
})
