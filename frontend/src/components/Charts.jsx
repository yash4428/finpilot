import { motion } from 'framer-motion'
import { useState } from 'react'
import { Area, AreaChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis, Bar, BarChart } from 'recharts'
import { catColor, compact, inr } from '../format.js'

const axis = { fontSize: 11, fill: 'var(--ink-3)' }

/** Cumulative spend this month vs last month, by day of month. */
export function SpendChart({ data, today }) {
  const day = new Date(today).getDate()
  return (
    <ResponsiveContainer width="100%" height={230}>
      <AreaChart data={data} margin={{ top: 10, right: 8, left: -8, bottom: 0 }}>
        <defs>
          <linearGradient id="gThis" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--brand)" stopOpacity={0.28} />
            <stop offset="100%" stopColor="var(--brand)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} stroke="var(--line)" strokeDasharray="0" />
        <XAxis dataKey="day" tick={axis} tickLine={false} axisLine={false} interval={4} />
        <YAxis tick={axis} tickLine={false} axisLine={false} tickFormatter={compact} width={52} />
        <Tooltip content={<SpendTip day={day} />} cursor={{ stroke: 'var(--ink-3)', strokeDasharray: '3 3' }} />
        <Area type="monotone" dataKey="lastMonth" name="Last month" stroke="var(--ink-3)" strokeDasharray="4 4" strokeWidth={1.6} fill="none" dot={false} activeDot={{ r: 4 }} isAnimationActive animationDuration={900} />
        <Area type="monotone" dataKey="thisMonth" name="This month" stroke="var(--brand)" strokeWidth={2.2} fill="url(#gThis)" dot={false}
          activeDot={{ r: 5, stroke: 'var(--surface)', strokeWidth: 2 }} isAnimationActive animationDuration={1100} />
      </AreaChart>
    </ResponsiveContainer>
  )
}

function SpendTip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  const t = payload.find((p) => p.dataKey === 'thisMonth')
  const l = payload.find((p) => p.dataKey === 'lastMonth')
  return (
    <div className="card" style={{ padding: '8px 12px', boxShadow: 'var(--shadow-2)', borderRadius: 12 }}>
      <div className="faint" style={{ fontSize: 11.5, marginBottom: 2 }}>By day {label}</div>
      {t && <div className="row" style={{ gap: 6 }}><i style={{ width: 8, height: 8, borderRadius: 2, background: 'var(--brand)' }} />This month <b className="num" style={{ marginLeft: 'auto' }}>{inr(t.value)}</b></div>}
      {l && <div className="row" style={{ gap: 6 }}><i style={{ width: 8, height: 8, borderRadius: 2, background: 'var(--ink-3)' }} />Last month <b className="num" style={{ marginLeft: 'auto' }}>{inr(l.value)}</b></div>}
    </div>
  )
}

/** Category share donut with an interactive legend. Top 5 + Other. */
export function CategoryDonut({ data }) {
  const [active, setActive] = useState(null)
  const top = data.slice(0, 5)
  const rest = data.slice(5).reduce((a, c) => a + Number(c.amount), 0)
  const rows = rest > 0 ? [...top, { category: 'Other', amount: rest }] : top
  const total = rows.reduce((a, c) => a + Number(c.amount), 0)
  const shown = active != null ? rows[active] : null
  return (
    <div>
      <div style={{ position: 'relative', height: 190 }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={rows} dataKey="amount" nameKey="category" innerRadius={62} outerRadius={86} paddingAngle={2} stroke="var(--surface)" strokeWidth={2}
              onMouseEnter={(_, i) => setActive(i)} onMouseLeave={() => setActive(null)} animationDuration={900}>
              {rows.map((r, i) => <Cell key={r.category} fill={catColor(r.category)} opacity={active == null || active === i ? 1 : 0.35} />)}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', pointerEvents: 'none', textAlign: 'center' }}>
          <div>
            <div className="faint" style={{ fontSize: 11.5 }}>{shown ? shown.category : 'This month'}</div>
            <div style={{ fontFamily: 'var(--f-display)', fontWeight: 600, fontSize: 21, letterSpacing: '-0.02em' }} className="num">
              {inr(shown ? shown.amount : total)}
            </div>
            {shown && <div className="faint" style={{ fontSize: 11.5 }}>{Math.round((shown.amount / total) * 100)}%</div>}
          </div>
        </div>
      </div>
      <div className="list" style={{ marginTop: 8 }}>
        {rows.map((r, i) => (
          <div key={r.category} className="row" style={{ padding: '5px 4px', borderRadius: 8, background: active === i ? 'var(--surface-2)' : 'transparent', cursor: 'default' }}
            onMouseEnter={() => setActive(i)} onMouseLeave={() => setActive(null)}>
            <i style={{ width: 9, height: 9, borderRadius: 3, background: catColor(r.category), flex: 'none' }} />
            <span style={{ flex: 1 }}>{r.category}</span>
            <span className="num muted">{inr(r.amount)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

/** Monthly income vs spend, side-by-side bars. */
export function TrendBars({ data }) {
  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={data} margin={{ top: 8, right: 4, left: -10, bottom: 0 }} barGap={3}>
        <CartesianGrid vertical={false} stroke="var(--line)" />
        <XAxis dataKey="month" tick={axis} tickLine={false} axisLine={false} />
        <YAxis tick={axis} tickLine={false} axisLine={false} tickFormatter={compact} width={50} />
        <Tooltip cursor={{ fill: 'var(--surface-2)' }} formatter={(v, n) => [inr(v), n]} contentStyle={{ borderRadius: 12, border: '1px solid var(--line)', background: 'var(--surface)' }} />
        <Bar dataKey="income" name="Income" fill="var(--mint)" radius={[4, 4, 0, 0]} maxBarSize={22} />
        <Bar dataKey="spend" name="Spend" fill="var(--brand)" radius={[4, 4, 0, 0]} maxBarSize={22} />
      </BarChart>
    </ResponsiveContainer>
  )
}

/** Simulated credit score on the 300–900 scale. */
export function ScoreGauge({ score, band }) {
  const pct = (score - 300) / 600
  const r = 70, c = Math.PI * r
  const color = score >= 750 ? 'var(--mint)' : score >= 650 ? 'var(--amber)' : 'var(--chilli)'
  return (
    <svg viewBox="0 0 180 104" width="100%" style={{ maxWidth: 220, display: 'block', margin: '0 auto' }} role="img" aria-label={`Estimated score ${score}, ${band}`}>
      <path d="M20 94 A70 70 0 0 1 160 94" fill="none" stroke="var(--sunken)" strokeWidth="12" strokeLinecap="round" />
      <motion.path d="M20 94 A70 70 0 0 1 160 94" fill="none" stroke={color} strokeWidth="12" strokeLinecap="round"
        strokeDasharray={c} initial={{ strokeDashoffset: c }} animate={{ strokeDashoffset: c * (1 - pct) }} transition={{ duration: 1.3, ease: [0.22, 1, 0.36, 1], delay: 0.2 }} />
      <text x="90" y="80" textAnchor="middle" style={{ fontFamily: 'var(--f-display)', fontWeight: 600, fontSize: 32, fill: 'var(--ink)', letterSpacing: '-0.03em' }}>{score}</text>
      <text x="90" y="98" textAnchor="middle" style={{ fontSize: 11, fill: 'var(--ink-3)' }}>{band}</text>
      <text x="20" y="104" textAnchor="middle" style={{ fontSize: 9, fill: 'var(--ink-3)' }}>300</text>
      <text x="160" y="104" textAnchor="middle" style={{ fontSize: 9, fill: 'var(--ink-3)' }}>900</text>
    </svg>
  )
}
