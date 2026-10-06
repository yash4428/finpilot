// Indian number formatting: ₹1,23,456
const inrFmt = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 })
const inrFmt2 = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export const inr = (v, { sign = false, paise = false } = {}) => {
  const n = Number(v || 0)
  const s = (paise ? inrFmt2 : inrFmt).format(Math.abs(n))
  const pre = n < 0 ? '−' : sign && n > 0 ? '+' : ''
  return `${pre}₹${s}`
}
export const num = (v) => inrFmt.format(Number(v || 0))

// Compact: 1.2L, 45.6k
export const compact = (v) => {
  const n = Math.abs(Number(v || 0))
  const s = n >= 1e7 ? (n / 1e7).toFixed(1) + 'Cr' : n >= 1e5 ? (n / 1e5).toFixed(n >= 1e6 ? 0 : 1) + 'L' : n >= 1e3 ? (n / 1e3).toFixed(n >= 1e4 ? 0 : 1) + 'k' : String(Math.round(n))
  return (v < 0 ? '−' : '') + '₹' + s.replace('.0', '')
}

export const toDate = (iso) => new Date(iso + (iso.length === 10 ? 'T00:00:00' : ''))
export const fmtDate = (iso, opts = { day: 'numeric', month: 'short' }) => toDate(iso).toLocaleDateString('en-IN', opts)
export const daysUntil = (iso) => {
  const t = new Date(); t.setHours(0, 0, 0, 0)
  return Math.round((toDate(iso) - t) / 86400000)
}
export const relDays = (iso) => {
  const d = daysUntil(iso)
  if (d === 0) return 'today'
  if (d === 1) return 'tomorrow'
  if (d === -1) return 'yesterday'
  return d > 0 ? `in ${d} days` : `${-d} days ago`
}

export const greeting = () => {
  const h = new Date().getHours()
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'
}

// Fixed category → colour mapping (identity never changes with rank).
export const CATEGORY_COLORS = {
  Dining: '#E07A3F', Groceries: '#2F9E6B', Transport: '#3D7DD8', Shopping: '#A65BC2', Utilities: '#C49A1E',
  Subscriptions: '#D24C6A', Entertainment: '#6F5BD9', Health: '#16A0A0', Fuel: '#8C6D52', Travel: '#2BA8CF',
  'Personal Care': '#DB7FAA', Education: '#5E7E3A', Rent: '#5E6B7D', Investments: '#0F6E6A', 'Loan EMI': '#7A8594',
  'Card Payment': '#7A8594', Transfers: '#9AA3AF', Income: '#1E9E6A', Other: '#9AA3AF',
}
export const catColor = (c) => CATEGORY_COLORS[c] || '#9AA3AF'
