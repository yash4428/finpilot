import { AnimatePresence, motion } from 'framer-motion'
import { CheckCircle2, ChevronDown, AlertTriangle, XCircle, Info } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { compact, fmtDate, inr } from '../format.js'
import { Money } from './ui.jsx'

/**
 * The runway: your balance laid out as a strip, with each commitment peeling off in the
 * order it will leave your account. What's left at the end (saffron) is the month-end balance.
 * Typing an amount carves a purchase out of that runway and shows the verdict live.
 */
export default function Runway({ sts, pilotAmount }) {
  const [amount, setAmount] = useState('')
  // Voice Pilot sets the purchase amount, so the strip animates the answer.
  useEffect(() => { if (pilotAmount?.value) setAmount(String(Math.round(pilotAmount.value))) }, [pilotAmount])
  const [hover, setHover] = useState(null)
  const [open, setOpen] = useState(false)

  const { segments, total, left } = useMemo(() => build(sts), [sts])
  const buy = Math.max(0, Number(String(amount).replace(/[^0-9.]/g, '')) || 0)
  const headroom = Number(sts.headroom)
  const verdict = buy <= 0 ? null : buy <= headroom * 0.5 ? 'ok' : buy <= headroom ? 'tight' : 'no'
  const buyInLeft = Math.min(buy, Math.max(left, 0))
  const short = Math.max(0, buy - Math.max(left, 0))
  const sliderMax = Math.max(10000, Math.ceil((Math.max(headroom * 1.6, buy)) / 1000) * 1000)
  const emi = verdict && verdict !== 'ok' ? bestEmi(buy, headroom) : null

  return (
    <section className="runway" aria-label="Safe to spend">
      <div className="runway-top">
        <div>
          <div className="runway-eyebrow">Safe to spend now <Info size={13} aria-hidden /></div>
          <div className="runway-figure"><Money value={sts.disposableNow} rupeeClass="rupee" /></div>
          <div className="runway-note">Your balance after every card bill and EMI due by {fmtDate(sts.monthEnd)}.</div>
        </div>
        <div className="runway-divider" />
        <div className="runway-second">
          <div className="runway-eyebrow">Predicted on {fmtDate(sts.monthEnd)}</div>
          <div className="runway-figure"><Money value={sts.predictedMonthEnd} rupeeClass="rupee" /></div>
          <div className="runway-note">After recurring bills and ~{inr(sts.variableDaily)}/day of usual spending over {sts.daysLeft} days.</div>
        </div>
        <div className="allowance" title={`Keeps ${inr(sts.savingsTarget)} (10% of income) aside as savings this month`}>
          <span>Spend today</span>
          <b className="num">{inr(Math.max(0, sts.leftToday))}</b>
          <small>of {inr(sts.dailyAllowance)}/day · {inr(sts.savingsTarget)} saved</small>
        </div>
      </div>

      <div className="strip" onMouseLeave={() => setHover(null)}>
        <div className="strip-track" role="img" aria-label={`Balance ${inr(total)}, month-end ${inr(left)}`}>
          {segments.map((s, i) => (
            <motion.div key={s.key} className={`seg seg-${s.kind}`}
              initial={{ width: 0 }} animate={{ width: `${(s.amount / total) * 100}%` }}
              transition={{ delay: 0.15 + i * 0.12, duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
              onMouseMove={(e) => setHover({ s, x: e.clientX - e.currentTarget.parentElement.getBoundingClientRect().left })}>
              {s.amount / total > 0.09 && <span>{s.short}</span>}
            </motion.div>
          ))}
          {left > 0 && (
            <motion.div className="seg seg-left" style={{ borderRight: 0, flex: 1, padding: 0, display: 'flex' }}
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.15 + segments.length * 0.12 }}
              onMouseMove={(e) => setHover({ s: { label: 'Left at month end', amount: left }, x: e.clientX - e.currentTarget.parentElement.getBoundingClientRect().left })}>
              <motion.div className="seg seg-buy" style={{ padding: buyInLeft ? '0 0 6px 8px' : 0, borderRight: 0 }}
                animate={{ width: `${(buyInLeft / left) * 100}%` }} transition={{ type: 'spring', damping: 30, stiffness: 260 }}>
                {buyInLeft / total > 0.08 && 'Purchase'}
              </motion.div>
              <div style={{ flex: 1, padding: '0 0 6px 8px', display: 'flex', alignItems: 'flex-end', overflow: 'hidden' }}>
                {(left - buyInLeft) / total > 0.07 && compact(left - buyInLeft)}
              </div>
            </motion.div>
          )}
          <AnimatePresence>
            {short > 0 && (
              <motion.div className="seg seg-short" style={{ position: 'absolute', right: 0, top: 0, bottom: 0, borderRight: 0 }}
                initial={{ width: 0 }} animate={{ width: `${Math.min(40, (short / total) * 100)}%` }} exit={{ width: 0 }}>
                short {compact(short)}
              </motion.div>
            )}
          </AnimatePresence>
          {hover && (
            <div className="breakdown-pop" style={{ left: hover.x, top: 0 }}>
              <b>{hover.s.label}</b> · {inr(hover.s.amount)}
            </div>
          )}
        </div>
        <div className="strip-scale"><span>Balance {inr(sts.balance)}</span><span>Month end {inr(left)}</span></div>
        <div className="legend" aria-hidden>
          <span><i style={{ background: 'repeating-linear-gradient(135deg,#2E2E36 0 3px,#4A4A55 3px 6px)' }} />Bills & EMIs</span>
          <span><i style={{ background: '#3A3A44' }} />Recurring</span>
          <span><i style={{ background: '#4C4C58' }} />Usual spending</span>
          <span><i style={{ background: 'linear-gradient(90deg,#B8893A,#F1D59A)' }} />Yours to keep</span>
        </div>
      </div>

      <div className="afford">
        <label htmlFor="afford-amt">Thinking of buying something?</label>
        <div className="row" style={{ gap: 12 }}>
          <div className="afford-input">
            <span style={{ color: 'var(--night-ink-2)' }}>₹</span>
            <input id="afford-amt" inputMode="numeric" placeholder="20,000" value={amount}
              onChange={(e) => setAmount(e.target.value.replace(/[^0-9]/g, ''))} aria-describedby="afford-verdict" />
          </div>
          <input type="range" min="0" max={sliderMax} step="500" value={Math.min(buy, sliderMax)} aria-label="Purchase amount"
            onChange={(e) => setAmount(e.target.value === '0' ? '' : e.target.value)} />
        </div>
        <div id="afford-verdict" aria-live="polite">
          {verdict === 'ok' && <span className="verdict ok"><CheckCircle2 size={16} /> Fits comfortably</span>}
          {verdict === 'tight' && <span className="verdict tight"><AlertTriangle size={16} /> Fits, but tight</span>}
          {verdict === 'no' && <span className="verdict no"><XCircle size={16} /> Over by {inr(buy - headroom)}</span>}
          {!verdict && <span className="verdict" style={{ color: 'var(--night-ink-2)', fontWeight: 500 }}>Up to {inr(headroom)} is safe</span>}
        </div>
        {emi && (
          <div className="emi-hint">
            Smarter: <b>{inr(emi.monthly)}/month</b> on a {emi.label}{emi.interest > 0 ? ` (${inr(emi.interest)} interest)` : ' at no extra cost'}. Only the first instalment hits this month.
          </div>
        )}
      </div>

      <button className="trace-toggle" style={{ color: 'var(--night-ink-2)', marginTop: 14 }} onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        See the full breakdown <ChevronDown size={13} style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }} />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} style={{ overflow: 'hidden' }}>
            <div className="grid" style={{ marginTop: 12, gap: 24 }}>
              <Receipt className="c-6 md-6" title="Safe to spend now" lines={sts.disposableBreakdown} total={sts.disposableNow} />
              <Receipt className="c-6 md-6" title={`Predicted on ${fmtDate(sts.monthEnd)}`} lines={sts.monthEndBreakdown} total={sts.predictedMonthEnd} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  )
}

function Receipt({ title, lines, total, className }) {
  return (
    <div className={className}>
      <div style={{ fontSize: 12, color: 'var(--night-ink-2)', marginBottom: 6 }}>{title}</div>
      {lines.map((l, i) => (
        <div key={i} className="row between" style={{ padding: '5px 0', borderBottom: '1px dashed var(--night-line)', fontSize: 13 }}>
          <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {l.label}{l.detail && <span style={{ color: 'var(--night-ink-2)', fontSize: 11.5 }}> · {l.detail}</span>}
          </span>
          <span className="num" style={{ color: l.amount < 0 ? 'var(--night-ink)' : '#7FE0C2' }}>{inr(l.amount, { sign: true })}</span>
        </div>
      ))}
      <div className="row between" style={{ paddingTop: 8, fontWeight: 600 }}>
        <span>Total</span><span className="num" style={{ color: 'var(--saffron)' }}>{inr(total)}</span>
      </div>
    </div>
  )
}

function build(sts) {
  const total = Math.max(1, Number(sts.balance))
  const lines = sts.monthEndBreakdown || []
  const sum = (kind) => lines.filter((l) => l.kind === kind).reduce((a, l) => a + Math.abs(Number(l.amount)), 0)
  const dues = lines.filter((l) => l.kind === 'due')
  const segments = []
  dues.forEach((d, i) => segments.push({ key: 'd' + i, kind: 'due', label: d.label, short: shortLabel(d.label), amount: Math.abs(Number(d.amount)) }))
  const rec = sum('recurring')
  if (rec > 0) segments.push({ key: 'r', kind: 'recurring', label: 'Recurring bills & subscriptions', short: 'Recurring', amount: rec })
  const v = sum('variable')
  if (v > 0) segments.push({ key: 'v', kind: 'variable', label: 'Usual day-to-day spending', short: 'Usual spending', amount: v })
  // Scale down if commitments exceed the balance, so the strip still fits.
  const committed = segments.reduce((a, s) => a + s.amount, 0)
  const scale = committed > total ? total / committed : 1
  segments.forEach((s) => { s.amount *= scale })
  return { segments, total, left: Number(sts.predictedMonthEnd) }
}

/** Same plans the agent compares (no-cost 3/6 months, 12 months at 15%): the cheapest that fits. */
function bestEmi(amount, headroom) {
  const plans = [
    { label: '3-month no-cost EMI', months: 3, rate: 0 },
    { label: '6-month no-cost EMI', months: 6, rate: 0 },
    { label: '12-month EMI at 15%', months: 12, rate: 15 },
  ].map((p) => {
    const r = p.rate / 1200
    const monthly = r ? (amount * r * (1 + r) ** p.months) / ((1 + r) ** p.months - 1) : amount / p.months
    return { ...p, monthly, interest: monthly * p.months - amount }
  })
  // Same rule as the agent: cheapest in interest, then the gentlest monthly amount.
  return plans.filter((p) => p.monthly <= headroom)
    .sort((a, b) => a.interest - b.interest || b.months - a.months)[0] || null
}

function shortLabel(label) {
  return label.replace(/ bill$/, '').replace(/personal loan EMI/, 'EMI').replace(/Bank /, '').split(' ').slice(0, 2).join(' ')
}
