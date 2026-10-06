import { motion } from 'framer-motion'
import { PiggyBank, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { api } from '../api.js'
import { useShell } from '../components/Layout.jsx'
import { Empty, ErrorNote, Modal, Skeleton, page, rise, useApi, useToast } from '../components/ui.jsx'
import { catColor, inr } from '../format.js'
import { BudgetBar } from './Overview.jsx'

const STATE = {
  over: ['pill-chilli', 'Over budget'], warning: ['pill-amber', 'Past 80%'], pace: ['pill-amber', 'Ahead of pace'], ok: ['pill-mint', 'On track'],
}
const SPEND_CATS = ['Groceries', 'Dining', 'Transport', 'Fuel', 'Shopping', 'Utilities', 'Subscriptions', 'Entertainment', 'Health', 'Travel', 'Personal Care', 'Education', 'Other']

export default function Budgets() {
  const { refreshShell } = useShell()
  const { data, error, loading, reload } = useApi('/budgets')
  const [form, setForm] = useState(null)
  const toast = useToast()

  async function remove(b) {
    try { await api.del(`/budgets/${b.id}`); reload(); toast(`${b.category} budget removed`) } catch (e) { toast(e.message, 'error') }
  }

  if (error) return <ErrorNote message={error} onRetry={reload} />
  const total = (data || []).reduce((a, b) => a + b.limit, 0)
  const used = (data || []).reduce((a, b) => a + b.consumed, 0)
  const now = new Date()
  const monthPct = Math.round((now.getDate() / new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()) * 100)

  return (
    <motion.div className="stack" variants={page} initial="initial" animate="animate" exit="exit">
      <motion.div className="card" variants={rise}>
        <div className="row" style={{ flexWrap: 'wrap', gap: 20 }}>
          <div>
            <div className="stat-label">Spent against budgets this month</div>
            <div className="stat-value num">{inr(used)} <span className="faint" style={{ fontSize: 18 }}>/ {inr(total)}</span></div>
          </div>
          <div style={{ flex: '1 1 260px' }}>
            <div className="progress" style={{ height: 12, overflow: 'visible' }}>
              <i style={{ width: `${Math.min(100, total ? (used / total) * 100 : 0)}%` }} />
              <span style={{ position: 'absolute', left: `${monthPct}%`, top: -4, bottom: -4, width: 2, background: 'var(--ink)', opacity: 0.4 }} />
            </div>
            <div className="faint" style={{ fontSize: 12, marginTop: 6 }}>The marker shows how far through the month you are ({monthPct}%).</div>
          </div>
          <button className="btn btn-primary" onClick={() => setForm({})}><Plus size={16} /> Set a budget</button>
        </div>
      </motion.div>

      <div className="grid">
        {loading && [0, 1, 2, 3].map((i) => <div className="c-6" key={i}><Skeleton h={130} style={{ borderRadius: 20 }} /></div>)}
        {(data || []).map((b) => {
          const [cls, label] = STATE[b.state]
          return (
            <motion.div className="card c-6" key={b.id} variants={rise} style={{ borderTop: `3px solid ${catColor(b.category)}` }}>
              <BudgetBar b={b} big />
              <div className="row" style={{ marginTop: 12, gap: 8, flexWrap: 'wrap' }}>
                <span className={`pill ${cls} pill-dot`}>{label}</span>
                <span className="muted" style={{ fontSize: 12.5 }}>
                  {b.remaining >= 0 ? `${inr(b.remaining)} left` : `${inr(-b.remaining)} over`} · on pace for {inr(b.projected)}
                </span>
                <button className="link-btn" style={{ marginLeft: 'auto' }} onClick={() => setForm({ category: b.category, limitAmount: b.limit })}>Edit</button>
                <button className="icon-btn" style={{ width: 30, height: 30 }} onClick={() => remove(b)} aria-label={`Remove ${b.category} budget`}><Trash2 size={14} /></button>
              </div>
            </motion.div>
          )
        })}
        {!loading && !data?.length && <div className="c-12 card"><Empty icon={PiggyBank} title="No budgets yet">Set a monthly limit for a category and FinPilot will warn you at 80%.</Empty></div>}
      </div>

      <BudgetForm item={form} onClose={() => setForm(null)} onSaved={() => { reload(); refreshShell(); toast('Budget saved') }} />
    </motion.div>
  )
}

function BudgetForm({ item, onClose, onSaved }) {
  const [f, setF] = useState({})
  const [err, setErr] = useState('')
  const v = { category: 'Dining', limitAmount: '', ...item, ...f }
  const close = () => { setF({}); setErr(''); onClose() }
  async function save(e) {
    e.preventDefault()
    try { await api.post('/budgets', { category: v.category, limitAmount: Number(v.limitAmount) }); onSaved(); close() } catch (e2) { setErr(e2.message) }
  }
  return (
    <Modal open={!!item} onClose={close} title={item?.category ? `Edit ${item.category} budget` : 'Set a monthly budget'}
      footer={<><button className="btn" onClick={close}>Cancel</button><button className="btn btn-primary" form="b-form">Save budget</button></>}>
      <form id="b-form" className="form-grid" onSubmit={save}>
        <div className="field"><label htmlFor="b-c">Category</label>
          <select id="b-c" className="select" value={v.category} onChange={(e) => setF((x) => ({ ...x, category: e.target.value }))} disabled={!!item?.category}>
            {SPEND_CATS.map((c) => <option key={c}>{c}</option>)}
          </select></div>
        <div className="field"><label htmlFor="b-l">Monthly limit</label>
          <div className="input-prefix"><span>₹</span><input id="b-l" className="input" required inputMode="numeric" value={v.limitAmount} onChange={(e) => setF((x) => ({ ...x, limitAmount: e.target.value }))} /></div></div>
        {err && <div className="full error-text" role="alert">{err}</div>}
      </form>
    </Modal>
  )
}
