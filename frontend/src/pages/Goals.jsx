import { motion } from 'framer-motion'
import { CheckCircle2, Pencil, Plus, Target, Trash2, Wand2, AlertTriangle } from 'lucide-react'
import { useState } from 'react'
import { api } from '../api.js'
import { useShell } from '../components/Layout.jsx'
import { Empty, ErrorNote, Modal, Skeleton, page, rise, useApi, useToast } from '../components/ui.jsx'
import { fmtDate, inr } from '../format.js'
import { goalPlan } from './Overview.jsx'

export default function Goals() {
  const { refreshShell } = useShell()
  const goals = useApi('/goals')
  const dash = useApi('/dashboard')
  const [form, setForm] = useState(null)
  const [adding, setAdding] = useState(null)
  const toast = useToast()

  const surplus = dash.data?.health?.monthlySurplus ?? 0
  const plans = (goals.data || []).map((g) => ({ g, p: goalPlan(g, surplus) }))
  const needed = plans.reduce((a, x) => a + (x.p.remaining > 0 ? x.p.perMonth : 0), 0)
  const fits = needed <= surplus

  async function remove(g) {
    if (!window.confirm(`Delete the goal "${g.name}"? The money already saved stays in your goal savings total until you move it.`)) return
    try { await api.del(`/goals/${g.id}`); goals.reload(); toast('Goal deleted') } catch (e) { toast(e.message, 'error') }
  }

  if (goals.error) return <ErrorNote message={goals.error} onRetry={goals.reload} />

  return (
    <motion.div className="stack" variants={page} initial="initial" animate="animate" exit="exit">
      <motion.div className="card" variants={rise}>
        <div className="row" style={{ flexWrap: 'wrap', gap: 24, alignItems: 'center' }}>
          <div>
            <div className="stat-label">Your goals need</div>
            <div className="stat-value num">{inr(needed)}<span style={{ fontSize: 16, WebkitTextFillColor: 'var(--ink-3)' }}> / month</span></div>
          </div>
          <div>
            <div className="stat-label">You free up</div>
            <div className="stat-value num">{inr(surplus)}<span style={{ fontSize: 16, WebkitTextFillColor: 'var(--ink-3)' }}> / month</span></div>
          </div>
          <div className="row" style={{ gap: 8, flex: '1 1 260px', color: fits ? 'var(--mint)' : 'var(--amber)', fontSize: 13.5 }}>
            {fits ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}
            {fits ? `Autopilot is on: every goal fits your monthly surplus, with ${inr(surplus - needed)} to spare.`
              : `You're ${inr(needed - surplus)}/month short. Push a deadline or trim a budget to get back on track.`}
          </div>
          <button className="btn btn-primary" onClick={() => setForm({})}><Plus size={16} /> New goal</button>
        </div>
        <div className="faint" style={{ fontSize: 12, marginTop: 10 }}>Surplus = average monthly income − spending − EMIs over the last 3 months.</div>
      </motion.div>

      <div className="grid">
        {goals.loading && [0, 1, 2].map((i) => <div className="c-4" key={i}><Skeleton h={240} style={{ borderRadius: 24 }} /></div>)}
        {plans.map(({ g, p }) => (
          <motion.div className="card c-4 md-6" key={g.id} variants={rise}>
            <div className="row" style={{ alignItems: 'flex-start' }}>
              <Ring pct={p.pct} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 15 }}>{g.name}</div>
                <div className="faint" style={{ fontSize: 12 }}>{g.deadline ? `by ${fmtDate(g.deadline, { day: 'numeric', month: 'short', year: 'numeric' })}` : 'No deadline'}</div>
                <div className="num" style={{ marginTop: 8, fontSize: 13 }}><b>{inr(g.savedAmount)}</b> <span className="faint">of {inr(g.targetAmount)}</span></div>
              </div>
            </div>
            <div className="card" style={{ marginTop: 16, padding: 14, background: 'var(--sunken)', boxShadow: 'none' }}>
              <div className="row" style={{ gap: 6, fontSize: 12, color: 'var(--brand-ink)' }}><Wand2 size={13} /> <span className="eyebrow" style={{ color: 'var(--brand-ink)' }}>Autopilot</span></div>
              <div style={{ fontSize: 13.5, marginTop: 6 }}>
                {p.remaining === 0 ? 'Goal reached. Time to celebrate 🎉'
                  : <>Save <b>{inr(p.perMonth)}</b>/month for {p.months} month{p.months > 1 ? 's' : ''} to make it.</>}
              </div>
              {p.remaining > 0 && <div style={{ fontSize: 12, marginTop: 4, color: p.onTrack ? 'var(--mint)' : 'var(--amber)' }}>
                {p.onTrack ? 'Fits in your monthly surplus.' : 'More than you free up each month.'}</div>}
            </div>
            <div className="row" style={{ marginTop: 14, gap: 6 }}>
              <button className="btn btn-sm btn-primary" onClick={() => setAdding(g)} disabled={p.remaining === 0}><Plus size={14} /> Add money</button>
              <button className="icon-btn" style={{ marginLeft: 'auto', width: 32, height: 32 }} onClick={() => setForm(g)} aria-label={`Edit ${g.name}`}><Pencil size={14} /></button>
              <button className="icon-btn" style={{ width: 32, height: 32 }} onClick={() => remove(g)} aria-label={`Delete ${g.name}`}><Trash2 size={14} /></button>
            </div>
          </motion.div>
        ))}
        {!goals.loading && !goals.data?.length && <div className="c-12 card"><Empty icon={Target} title="No goals yet">Add a goal and FinPilot works out how much to save each month.</Empty></div>}
      </div>

      <GoalForm item={form} onClose={() => setForm(null)} onSaved={() => { goals.reload(); refreshShell(); toast('Goal saved') }} />
      <AddMoney goal={adding} onClose={() => setAdding(null)} onDone={(g, amt) => { goals.reload(); dash.reload(); refreshShell(); toast(`${inr(amt)} moved to ${g.name}`) }} />
    </motion.div>
  )
}

function Ring({ pct }) {
  const r = 30, c = 2 * Math.PI * r
  return (
    <svg className="goal-ring" width="76" height="76" viewBox="0 0 76 76" style={{ marginRight: 14 }} aria-hidden>
      <circle cx="38" cy="38" r={r} fill="none" stroke="var(--sunken)" strokeWidth="7" />
      <motion.circle cx="38" cy="38" r={r} fill="none" stroke="#E2BF78" strokeWidth="7" strokeLinecap="round" transform="rotate(-90 38 38)"
        strokeDasharray={c} initial={{ strokeDashoffset: c }} animate={{ strokeDashoffset: c * (1 - pct / 100) }} transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1] }} />
      <text x="38" y="38" textAnchor="middle" dominantBaseline="central" style={{ fontSize: 14, fontWeight: 700, fill: 'var(--ink)' }}>{Math.round(pct)}%</text>
    </svg>
  )
}

function GoalForm({ item, onClose, onSaved }) {
  const editing = item?.id
  const [f, setF] = useState({})
  const [err, setErr] = useState('')
  const v = { name: '', targetAmount: '', savedAmount: '', deadline: '', ...item, ...f }
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }))
  const close = () => { setF({}); setErr(''); onClose() }
  async function save(e) {
    e.preventDefault()
    const body = { name: v.name, targetAmount: Number(v.targetAmount), savedAmount: Number(v.savedAmount) || 0, deadline: v.deadline || null }
    try { editing ? await api.put(`/goals/${item.id}`, body) : await api.post('/goals', body); onSaved(); close() } catch (e2) { setErr(e2.message) }
  }
  return (
    <Modal open={!!item} onClose={close} title={editing ? 'Edit goal' : 'New goal'}
      footer={<><button className="btn" onClick={close}>Cancel</button><button className="btn btn-primary" form="goal-form">Save goal</button></>}>
      <form id="goal-form" className="form-grid" onSubmit={save}>
        <div className="field full"><label htmlFor="g-n">What are you saving for?</label><input id="g-n" className="input" required value={v.name} onChange={set('name')} placeholder="Goa trip, new laptop, emergency fund…" /></div>
        <div className="field"><label htmlFor="g-t">Target</label><div className="input-prefix"><span>₹</span><input id="g-t" className="input" required inputMode="numeric" value={v.targetAmount} onChange={set('targetAmount')} /></div></div>
        <div className="field"><label htmlFor="g-s">Already saved</label><div className="input-prefix"><span>₹</span><input id="g-s" className="input" inputMode="numeric" value={v.savedAmount} onChange={set('savedAmount')} /></div></div>
        <div className="field full"><label htmlFor="g-d">Deadline</label><input id="g-d" type="date" className="input" value={v.deadline || ''} onChange={set('deadline')} /></div>
        {err && <div className="full error-text" role="alert">{err}</div>}
      </form>
    </Modal>
  )
}

function AddMoney({ goal, onClose, onDone }) {
  const [amt, setAmt] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const close = () => { setAmt(''); setErr(''); onClose() }
  async function save(e) {
    e.preventDefault(); setBusy(true); setErr('')
    try { await api.post(`/goals/${goal.id}/contribute`, { amount: Number(amt) }); onDone(goal, Number(amt)); close() } catch (e2) { setErr(e2.message) } finally { setBusy(false) }
  }
  return (
    <Modal open={!!goal} onClose={close} title={goal ? `Add money to ${goal.name}` : ''}
      footer={<><button className="btn" onClick={close}>Cancel</button><button className="btn btn-primary" form="add-money" disabled={busy || !amt}>{busy ? 'Moving…' : 'Move money'}</button></>}>
      <form id="add-money" className="stack" style={{ gap: 12 }} onSubmit={save}>
        <div className="field"><label htmlFor="am">Amount</label><div className="input-prefix"><span>₹</span><input id="am" className="input" autoFocus inputMode="numeric" value={amt} onChange={(e) => setAmt(e.target.value.replace(/[^0-9]/g, ''))} /></div></div>
        <div className="hint">Moves money from your bank account into this goal and records it as a transfer, so your safe-to-spend updates too.</div>
        {err && <div className="error-text" role="alert">{err}</div>}
      </form>
    </Modal>
  )
}
