import { motion } from 'framer-motion'
import { Repeat, TrendingUp, Sparkles } from 'lucide-react'
import { useMemo, useState } from 'react'
import { catColor, fmtDate, inr, toDate } from '../format.js'

/* ---------- FinPilot score (0–100) ---------- */
export function HealthCard({ h }) {
  const r = 54, c = 2 * Math.PI * r
  const color = h.score >= 80 ? '#4ADE9F' : h.score >= 65 ? '#E2BF78' : h.score >= 45 ? '#F5C04E' : '#FF7A6B'
  return (
    <div className="card" data-pilot="health">
      <div className="card-head"><span className="card-title">FinPilot score</span><span className="spacer" /><span className="pill pill-brand">{h.grade}</span></div>
      <div className="ring-wrap">
        <svg width="132" height="132" viewBox="0 0 132 132" role="img" aria-label={`FinPilot score ${h.score} out of 100`}>
          <defs>
            <linearGradient id="ringG" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stopColor="#F6DFA8" /><stop offset="100%" stopColor={color} /></linearGradient>
          </defs>
          <circle cx="66" cy="66" r={r} fill="none" stroke="var(--sunken)" strokeWidth="10" />
          <motion.circle cx="66" cy="66" r={r} fill="none" stroke="url(#ringG)" strokeWidth="10" strokeLinecap="round"
            transform="rotate(-90 66 66)" strokeDasharray={c} initial={{ strokeDashoffset: c }}
            animate={{ strokeDashoffset: c * (1 - h.score / 100) }} transition={{ duration: 1.4, ease: [0.22, 1, 0.36, 1], delay: 0.2 }} />
          <text x="66" y="66" textAnchor="middle" dominantBaseline="central" style={{ fontFamily: 'var(--f-display)', fontWeight: 700, fontSize: 38, fill: 'var(--ink)', letterSpacing: '-0.04em' }}>{h.score}</text>
          <text x="66" y="92" textAnchor="middle" style={{ fontSize: 10, fill: 'var(--ink-3)', letterSpacing: '0.12em' }}>OF 100</text>
        </svg>
        <div style={{ fontSize: 13 }}>
          <div className="eyebrow" style={{ marginBottom: 4 }}>Focus next</div>
          <div className="muted">{h.focus}</div>
          <div className="faint" style={{ fontSize: 12, marginTop: 8 }}>You free up <b style={{ color: 'var(--ink)' }}>{inr(h.monthlySurplus)}</b>/month after spending and EMIs.</div>
        </div>
      </div>
      <div className="parts">
        {h.parts.map((p, i) => (
          <div className="part-row" key={p.name} title={p.tip}>
            <span>{p.name} <span className="faint">· {p.detail}</span></span>
            <b className="num">{p.points}<span className="faint" style={{ fontWeight: 400 }}>/{p.max}</span></b>
            <span className="bar"><motion.i initial={{ width: 0 }} animate={{ width: `${(p.points / p.max) * 100}%` }} transition={{ delay: 0.3 + i * 0.1, duration: 0.8 }} /></span>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ---------- Spending calendar heatmap ---------- */
const DAYS = ['Mon', '', 'Wed', '', 'Fri', '', 'Sun']
const WEEKDAY = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

export function Heatmap({ days }) {
  const [hover, setHover] = useState(null)
  const { levels, insight, months, avg } = useMemo(() => {
    const vals = days.map((d) => d.amount).filter((v) => v > 0).sort((a, b) => a - b)
    const q = (p) => vals[Math.min(vals.length - 1, Math.floor(p * vals.length))] || 0
    const cuts = [q(0.25), q(0.5), q(0.75)]
    const levels = days.map((d) => (d.amount <= 0 ? 0 : d.amount <= cuts[0] ? 1 : d.amount <= cuts[1] ? 2 : d.amount <= cuts[2] ? 3 : 4))
    // Average spend by weekday → the "you overspend on…" line.
    const sum = Array(7).fill(0), cnt = Array(7).fill(0)
    days.forEach((d) => { const w = (toDate(d.date).getDay() + 6) % 7; sum[w] += d.amount; cnt[w]++ })
    const avg = sum.map((s, i) => (cnt[i] ? s / cnt[i] : 0))
    const top = avg.indexOf(Math.max(...avg))
    const overall = avg.reduce((a, b) => a + b, 0) / 7
    // One label per month, on the first week column that starts in it.
    const months = []
    let last = ''
    days.forEach((d, i) => {
      if (i % 7 !== 0) return
      const m = fmtDate(d.date, { month: 'short' })
      months.push({ m: m === last ? '' : m, i })
      last = m
    })
    return { levels, months, avg, insight: { day: WEEKDAY[top], top, avg: avg[top], ratio: overall ? avg[top] / overall : 1 } }
  }, [days])
  const shade = ['var(--sunken)', 'rgba(217,180,106,0.22)', 'rgba(217,180,106,0.45)', 'rgba(217,180,106,0.72)', '#F1D59A']
  return (
    <div className="card" data-pilot="heatmap">
      <div className="card-head">
        <span className="card-title">Spending calendar</span><span className="spacer" />
        <span className="heat-legend">Less {shade.map((s, i) => <i key={i} style={{ background: s }} />)} More</span>
      </div>
      <div style={{ display: 'flex', overflowX: 'auto', paddingBottom: 4 }}>
        <div className="heat-days" style={{ paddingTop: 18 }}>{DAYS.map((d, i) => <span key={i}>{d}</span>)}</div>
        <div>
          <div style={{ display: 'grid', gridAutoFlow: 'column', gridAutoColumns: '15px', gap: 4, height: 14, fontSize: 10, color: 'var(--ink-3)', marginBottom: 4 }}>
            {months.map((m, i) => <span key={i} style={{ whiteSpace: 'nowrap' }}>{m.m}</span>)}
          </div>
          <div className="heat" onMouseLeave={() => setHover(null)}>
            {days.map((d, i) => (
              <motion.i key={d.date} style={{ background: shade[levels[i]] }} initial={{ opacity: 0, scale: 0.4 }} animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.004 * i }} onMouseEnter={() => setHover(d)} aria-label={`${d.date}: ${inr(d.amount)}`} />
            ))}
          </div>
        </div>
      </div>
      <div className="row between" style={{ marginTop: 12, fontSize: 13, minHeight: 20, flexWrap: 'wrap', gap: 8 }}>
        <span className="muted">
          {hover ? <><b style={{ color: 'var(--ink)' }}>{inr(hover.amount)}</b> on {fmtDate(hover.date, { weekday: 'short', day: 'numeric', month: 'short' })}</>
            : <><TrendingUp size={13} style={{ verticalAlign: -2, color: 'var(--brand)' }} /> You spend most on <b style={{ color: 'var(--ink)' }}>{insight.day}s</b>, about {inr(insight.avg)} ({insight.ratio.toFixed(1)}× your daily average).</>}
        </span>
        <span className="faint" style={{ fontSize: 11.5 }}>Excludes rent and flagged one-offs</span>
      </div>
      <div className="eyebrow" style={{ marginTop: 18, marginBottom: 8 }}>Average spend by weekday</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 10, alignItems: 'end', height: 92 }}>
        {avg.map((a, i) => {
          const max = Math.max(...avg) || 1
          return (
            <div key={i} style={{ textAlign: 'center' }} title={`${WEEKDAY[i]}: ${inr(a)} on average`}>
              <div className="faint num" style={{ fontSize: 10.5, marginBottom: 4 }}>{inr(a)}</div>
              <motion.div initial={{ height: 0 }} animate={{ height: Math.max(4, (a / max) * 52) }} transition={{ delay: 0.3 + i * 0.05, duration: 0.6 }}
                style={{ borderRadius: 6, background: i === insight.top ? 'linear-gradient(180deg,#F1D59A,#B8893A)' : 'var(--surface-2)', border: '1px solid var(--line)' }} />
              <div className="faint" style={{ fontSize: 10.5, marginTop: 4 }}>{WEEKDAY[i].slice(0, 3)}</div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* ---------- Subscription detective ---------- */
const NOT_SUBS = new Set(['Rent', 'Investments', 'Loan EMI', 'Card Payment', 'Transfers', 'Income'])

export function Subscriptions({ recurring }) {
  // Latest charge, so a price rise shows up in the monthly and yearly cost.
  const subs = (recurring || []).filter((r) => r.direction === 'out' && !NOT_SUBS.has(r.category))
    .map((r) => ({ ...r, amount: r.last_amount || r.amount }))
  const monthly = subs.reduce((a, r) => a + r.amount, 0)
  return (
    <div className="card" data-pilot="subs">
      <div className="card-head"><Repeat size={15} style={{ color: 'var(--brand)' }} /><span className="card-title">Autopay detective</span></div>
      {subs.length === 0 ? <p className="muted" style={{ margin: 0 }}>No recurring bills or subscriptions spotted yet.</p> : (
        <>
          <div className="stat-value num" style={{ marginTop: 0 }}>{inr(monthly * 12)}<span className="faint" style={{ fontSize: 14, WebkitTextFillColor: 'var(--ink-3)' }}> / year</span></div>
          <div className="faint" style={{ fontSize: 12.5, marginBottom: 10 }}>{subs.length} bills and subscriptions found automatically · {inr(monthly)}/month</div>
          <div className="list">
            {subs.map((r) => (
              <div className="list-row" key={r.merchant} style={{ padding: '9px 2px' }}>
                <span className="merchant-badge" style={{ width: 32, height: 32, fontSize: 12, background: `color-mix(in srgb, ${catColor(r.category)} 18%, var(--surface))`, color: catColor(r.category) }}>
                  {r.merchant.replace(/[^A-Za-z ]/g, '').split(' ').filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase()}
                </span>
                <div className="grow">
                  <div className="title" style={{ fontSize: 13 }}>{r.merchant}</div>
                  <div className="meta">Next {r.next_date ? fmtDate(r.next_date) : `on the ${r.day}th`} · {inr(r.amount * 12)}/yr
                    {r.price_change > 0 && <span className="pill pill-chilli" style={{ height: 18, marginLeft: 6, fontSize: 10.5 }}>+{inr(r.price_change)} price rise</span>}
                  </div>
                </div>
                <b className="num" style={{ fontSize: 13 }}>{inr(r.amount)}</b>
              </div>
            ))}
          </div>
          <div className="row faint" style={{ fontSize: 12, marginTop: 10, gap: 6 }}><Sparkles size={12} style={{ color: 'var(--brand)' }} /> Not using one? Cancelling it adds its yearly cost straight to your savings.</div>
        </>
      )}
    </div>
  )
}
