import { motion } from 'framer-motion'
import { Check, ClipboardList, Info, Lightbulb, Save, Sparkles } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { api } from '../api.js'
import { useShell } from '../components/Layout.jsx'
import { ErrorNote, Money, Skeleton, page, rise, useApi, useToast } from '../components/ui.jsx'
import { compact, inr } from '../format.js'

const FIELDS = [
  { key: 'sec80C', label: '80C', hint: 'EPF, PPF, ELSS, LIC, tuition', cap: 150000 },
  { key: 'sec80D', label: '80D', hint: 'Health insurance premium', cap: 25000 },
  { key: 'sec80CCD1B', label: '80CCD(1B)', hint: 'Extra NPS contribution', cap: 50000 },
  { key: 'hraExemption', label: 'HRA exemption', hint: 'From your payslip / rent', cap: 400000 },
  { key: 'homeLoanInterest', label: '24(b)', hint: 'Home-loan interest', cap: 200000 },
  { key: 'sec80TTA', label: '80TTA', hint: 'Savings account interest', cap: 10000 },
]

export default function Tax() {
  const { data: saved, error, loading, reload } = useApi('/tax/estimate')
  const [gross, setGross] = useState(null)
  const [ded, setDed] = useState(null)
  const [est, setEst] = useState(null)
  const [view, setView] = useState('new')
  const [saving, setSaving] = useState(false)
  const timer = useRef(null)
  const { openPilot } = useShell()
  const toast = useToast()

  useEffect(() => {
    if (saved && gross == null) {
      setGross(saved.grossIncome); setDed(Object.fromEntries(FIELDS.map((f) => [f.key, Number(saved.deductions?.[f.key] || 0)])))
      setEst(saved); setView(saved.recommended)
    }
  }, [saved, gross])

  // Live what-if: recompute on the server (rules live in Java), debounced.
  useEffect(() => {
    if (gross == null || !ded) return
    clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      api.post('/tax/estimate', { grossIncome: Number(gross) || 0, deductions: ded, save: false }).then(setEst).catch(() => {})
    }, 250)
    return () => clearTimeout(timer.current)
  }, [gross, ded])

  async function save() {
    setSaving(true)
    try {
      const r = await api.post('/tax/estimate', { grossIncome: Number(gross) || 0, deductions: ded, regime: est.recommended, save: true })
      setEst(r); reload(); toast(`Saved. Filing under the ${r.recommended} regime.`)
    } catch (e) { toast(e.message, 'error') } finally { setSaving(false) }
  }

  if (error) return <ErrorNote message={error} onRetry={reload} />
  if (loading || !est || !ded) return <div className="grid"><div className="c-8"><Skeleton h={260} style={{ borderRadius: 20 }} /></div><div className="c-4"><Skeleton h={260} style={{ borderRadius: 20 }} /></div></div>

  const oldT = est.old.totalTax, newT = est.new.totalTax
  const max = Math.max(oldT, newT, 1)
  const sel = est[view]

  return (
    <motion.div className="grid" variants={page} initial="initial" animate="animate" exit="exit">
      <motion.div className="c-8 stack" variants={rise}>
        <div className="card">
          <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
            <div>
              <div className="stat-label">Estimated income tax · FY {est.fy}</div>
              <div className="row" style={{ alignItems: 'baseline', gap: 10 }}>
                <div className="stat-value" style={{ fontSize: 34 }}><Money value={Math.min(oldT, newT)} /></div>
                <span className="pill pill-brand">{est.recommended} regime</span>
              </div>
              <div className="muted" style={{ fontSize: 13 }}>
                The {est.recommended} regime saves you <b className="pos">{inr(est.savingWithRecommended)}</b> on a gross income of {inr(est.grossIncome)}.
              </div>
            </div>
            <button className="btn btn-sm" style={{ marginLeft: 'auto' }} onClick={() => openPilot('How can I save tax?')}><Sparkles size={14} /> Ask Pilot</button>
          </div>

          <div className="stack" style={{ gap: 14, marginTop: 22 }}>
            {[['new', 'New regime', newT, est.new], ['old', 'Old regime', oldT, est.old]].map(([k, label, t, r]) => (
              <button key={k} onClick={() => setView(k)} className="row" aria-pressed={view === k}
                style={{ all: 'unset', cursor: 'pointer', display: 'grid', gridTemplateColumns: '110px 1fr 110px', alignItems: 'center', gap: 12, padding: '8px 10px', borderRadius: 12, background: view === k ? 'var(--surface-2)' : 'transparent', outline: view === k ? '1px solid var(--line)' : 'none' }}>
                <span style={{ fontWeight: 500 }}>{label}{est.recommended === k && <Check size={14} className="pos" style={{ marginLeft: 6, verticalAlign: -2 }} />}</span>
                <span className="progress" style={{ height: 14, background: 'var(--sunken)' }}>
                  <i style={{ width: `${(t / max) * 100}%`, background: est.recommended === k ? 'var(--brand)' : 'var(--ink-3)' }} />
                </span>
                <span style={{ textAlign: 'right' }}><b className="num">{inr(t)}</b><div className="faint" style={{ fontSize: 11.5 }}>{r.effectiveRate}% effective</div></span>
              </button>
            ))}
          </div>
        </div>

        <div className="card">
          <div className="card-head"><span className="card-title">How the {view} regime gets to {inr(sel.totalTax)}</span></div>
          <div className="list" style={{ fontSize: 13 }}>
            <Row l="Gross income" v={est.grossIncome} />
            <Row l="Standard deduction" v={-sel.standardDeduction} />
            {view === 'old' && sel.deductions.filter((x) => x.allowed > 0).map((x) => <Row key={x.key} l={x.label} v={-x.allowed} note={x.claimed > x.allowed ? `capped from ${inr(x.claimed)}` : null} />)}
            <Row l="Taxable income" v={sel.taxableIncome} strong />
            {sel.slabs.filter((s) => s.tax > 0).map((s, i) => (
              <Row key={i} l={`${s.rate}% on ${compact(s.from)}–${s.to ? compact(s.to) : 'above'}`} v={s.tax} faint />
            ))}
            {sel.rebate87A > 0 && <Row l="Rebate u/s 87A" v={-sel.rebate87A} />}
            <Row l="Health & education cess (4%)" v={sel.cess} />
            <Row l="Total tax" v={sel.totalTax} strong />
          </div>
          <div className="faint" style={{ fontSize: 12, marginTop: 8 }}>About {inr(sel.monthly)} a month via TDS.</div>
        </div>

        <div className="card">
          <div className="card-head"><Lightbulb size={16} style={{ color: 'var(--saffron)' }} /><span className="card-title">Ways to pay less</span></div>
          <div className="list">
            {est.suggestions.map((s) => (
              <div className="list-row" key={s.section} style={{ alignItems: 'flex-start' }}>
                <div className="grow">
                  <div style={{ fontWeight: 500 }}>{s.title}</div>
                  <div className="muted" style={{ fontSize: 12.5, whiteSpace: 'normal' }}>{s.note}</div>
                </div>
                {s.gap > 0 && <div style={{ textAlign: 'right', flex: 'none' }}>
                  <div className="num pos" style={{ fontWeight: 600 }}>up to {inr(s.potentialSaving)}</div>
                  <div className="faint" style={{ fontSize: 11.5 }}>{inr(s.gap)} unused · old regime</div>
                </div>}
              </div>
            ))}
            {!est.suggestions.length && <p className="muted">You're already using every deduction FinPilot tracks.</p>}
          </div>
        </div>
      </motion.div>

      <motion.div className="c-4 stack" variants={rise}>
        <div className="card">
          <div className="card-head"><span className="card-title">Try what-ifs</span><span className="spacer" />
            <button className="btn btn-sm" onClick={save} disabled={saving}><Save size={14} /> {saving ? 'Saving' : 'Save'}</button></div>
          <div className="field" style={{ marginBottom: 14 }}>
            <label htmlFor="gross">Gross annual income</label>
            <div className="input-prefix"><span>₹</span>
              <input id="gross" className="input num" inputMode="numeric" value={gross} onChange={(e) => setGross(e.target.value.replace(/[^0-9]/g, ''))} /></div>
          </div>
          <div className="stack" style={{ gap: 14 }}>
            {FIELDS.map((f) => (
              <div key={f.key}>
                <div className="row between" style={{ fontSize: 13 }}>
                  <label htmlFor={f.key}><b style={{ fontWeight: 500 }}>{f.label}</b> <span className="faint">· {f.hint}</span></label>
                  <span className="num" style={{ fontWeight: 500 }}>{inr(ded[f.key])}</span>
                </div>
                <input id={f.key} type="range" min={0} max={f.cap} step={1000} value={ded[f.key]} style={{ width: '100%', accentColor: 'var(--brand)' }}
                  onChange={(e) => setDed((d) => ({ ...d, [f.key]: Number(e.target.value) }))} />
              </div>
            ))}
          </div>
          <div className="row hint" style={{ gap: 6, marginTop: 10 }}><Info size={13} /> Deductions only change the old regime's number.</div>
        </div>

        <div className="card">
          <div className="card-head"><ClipboardList size={16} style={{ color: 'var(--brand)' }} /><span className="card-title">Return prep</span></div>
          <div style={{ fontSize: 13 }}>
            <div className="row between"><span className="muted">Form</span><span style={{ textAlign: 'right', maxWidth: '62%' }}>ITR-1 (Sahaj)</span></div>
            <div className="row between" style={{ marginTop: 4 }}><span className="muted">File under</span><b style={{ textTransform: 'capitalize' }}>{est.returnPrep.regimeToFile} regime</b></div>
            <div className="row between" style={{ marginTop: 4 }}><span className="muted">Tax payable</span><b className="num">{inr(est.returnPrep.taxPayable)}</b></div>
          </div>
          <ul style={{ margin: '12px 0 0', paddingLeft: 18, fontSize: 13, color: 'var(--ink-2)', display: 'flex', flexDirection: 'column', gap: 5 }}>
            {est.returnPrep.checklist.map((c) => <li key={c}>{c}</li>)}
          </ul>
        </div>
        <p className="faint" style={{ fontSize: 12, margin: 0 }}>{est.disclaimer}</p>
      </motion.div>
    </motion.div>
  )
}

function Row({ l, v, strong, faint, note }) {
  return (
    <div className="row between" style={{ padding: '7px 2px', borderTop: strong ? '1px solid var(--line-2)' : '1px solid var(--line)', fontWeight: strong ? 600 : 400, color: faint ? 'var(--ink-2)' : undefined }}>
      <span>{l}{note && <span className="faint" style={{ fontSize: 11.5, fontWeight: 400 }}> · {note}</span>}</span>
      <span className="num">{v < 0 ? '−' : ''}{inr(Math.abs(v))}</span>
    </div>
  )
}
