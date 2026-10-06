import { motion } from 'framer-motion'
import { BellRing, CalendarCheck2, CheckCircle2, CreditCard, Landmark } from 'lucide-react'
import { useState } from 'react'
import { api } from '../api.js'
import { useShell } from '../components/Layout.jsx'
import { Empty, ErrorNote, Modal, Money, Skeleton, page, rise, useApi, useToast } from '../components/ui.jsx'
import { daysUntil, fmtDate, inr, relDays, toDate } from '../format.js'

function bucket(d) {
  const n = daysUntil(d.dueDate)
  if (n < 0) return 'Overdue'
  if (n <= 7) return 'This week'
  const due = toDate(d.dueDate), now = new Date()
  return due.getMonth() === now.getMonth() ? 'Later this month' : 'Next month'
}
const ORDER = ['Overdue', 'This week', 'Later this month', 'Next month']

export default function Dues() {
  const { bump, refreshShell } = useShell()
  const { data, error, loading, reload } = useApi('/dues?horizon=45d&includePaid=true', [bump])
  const { data: accounts } = useApi('/accounts', [bump])
  const [paying, setPaying] = useState(null)
  const [busy, setBusy] = useState(false)
  const toast = useToast()

  async function pay() {
    setBusy(true)
    try {
      await api.post(`/dues/${paying.id}/pay`)
      toast(`${paying.label} marked paid`)
      setPaying(null); reload(); refreshShell()
    } catch (e) { toast(e.message, 'error') } finally { setBusy(false) }
  }

  if (error) return <ErrorNote message={error} onRetry={reload} />
  if (loading || !data) return <div className="stack"><Skeleton h={120} style={{ borderRadius: 20 }} /><Skeleton h={320} style={{ borderRadius: 20 }} /></div>

  const groups = ORDER.map((name) => ({ name, items: data.dues.filter((d) => bucket(d) === name) })).filter((g) => g.items.length)
  const next = data.dues[0]
  const bank = accounts?.find((a) => a.type === 'bank')

  return (
    <motion.div className="stack" variants={page} initial="initial" animate="animate" exit="exit">
      <div className="grid">
        <motion.div className="card c-4 md-6" variants={rise}>
          <div className="stat-label">Due in the next 45 days</div>
          <div className="stat-value"><Money value={data.total} /></div>
          <div className="faint" style={{ fontSize: 12.5, marginTop: 4 }}>{data.dues.length} payments across cards and loans</div>
        </motion.div>
        <motion.div className="card c-4 md-6" variants={rise}>
          <div className="stat-label">Next payment</div>
          {next ? <>
            <div className="stat-value" style={{ fontSize: 22 }}>{inr(next.amount)}</div>
            <div className="faint" style={{ fontSize: 12.5, marginTop: 4 }}>{next.label} · {fmtDate(next.dueDate)} ({relDays(next.dueDate)})</div>
          </> : <div className="stat-value" style={{ fontSize: 22 }}>Nothing due</div>}
        </motion.div>
        <motion.div className="card c-4" variants={rise}>
          <div className="row" style={{ gap: 8 }}><BellRing size={16} style={{ color: 'var(--brand)' }} /><b style={{ fontWeight: 600 }}>Reminders are on</b></div>
          <p className="muted" style={{ fontSize: 13, margin: '6px 0 0' }}>FinPilot checks every morning at 8 and alerts you 5 days before each due date, and again if anything goes overdue.</p>
        </motion.div>
      </div>

      <motion.div className="card" variants={rise}>
        {groups.length === 0 && <Empty icon={CalendarCheck2} title="You're clear">No card bills or EMIs due in the next 45 days.</Empty>}
        {groups.map((g) => (
          <div key={g.name} style={{ marginBottom: 8 }}>
            <div className="row" style={{ padding: '10px 4px 4px', gap: 8 }}>
              <b style={{ fontSize: 13, color: g.name === 'Overdue' ? 'var(--chilli)' : 'var(--ink)' }}>{g.name}</b>
              <span className="faint" style={{ fontSize: 12 }}>{inr(g.items.reduce((a, d) => a + d.amount, 0))}</span>
            </div>
            <div className="list">
              {g.items.map((d) => {
                const Icon = d.sourceType === 'card' ? CreditCard : Landmark
                return (
                  <motion.div layout className="list-row" key={d.id}>
                    <div className={`date-tile ${d.status === 'overdue' ? 'hot' : d.status === 'due_soon' ? 'soon' : ''}`}>
                      <b>{toDate(d.dueDate).getDate()}</b><span>{fmtDate(d.dueDate, { month: 'short' })}</span>
                    </div>
                    <div className="grow">
                      <div className="title row" style={{ gap: 6 }}><Icon size={14} className="faint" />{d.label}</div>
                      <div className="meta">
                        {d.status === 'overdue' ? <span className="danger">Overdue by {-daysUntil(d.dueDate)} days</span> : relDays(d.dueDate)}
                        {d.sourceType === 'card' && d.minAmount > 0 && <> · minimum {inr(d.minAmount)}</>}
                      </div>
                    </div>
                    {d.status === 'due_soon' && <span className="pill pill-amber pill-dot hide-sm">Due soon</span>}
                    {d.status === 'overdue' && <span className="pill pill-chilli pill-dot hide-sm">Overdue</span>}
                    <b className="num" style={{ minWidth: 90, textAlign: 'right' }}>{inr(d.amount)}</b>
                    <button className="btn btn-sm" onClick={() => setPaying(d)}>Mark paid</button>
                  </motion.div>
                )
              })}
            </div>
          </div>
        ))}
      </motion.div>

      {data.paid?.length > 0 && (
        <motion.div className="card" variants={rise}>
          <div className="card-head"><span className="card-title">Recently paid</span></div>
          <div className="list">
            {data.paid.slice().reverse().map((d) => (
              <div className="list-row" key={d.id}>
                <CheckCircle2 size={18} className="pos" />
                <div className="grow"><div className="title">{d.label}</div><div className="meta">Due {fmtDate(d.dueDate)} · paid {fmtDate(d.paidAt.slice(0, 10))}</div></div>
                <span className="num muted">{inr(d.amount)}</span>
              </div>
            ))}
          </div>
        </motion.div>
      )}

      <Modal open={!!paying} onClose={() => setPaying(null)} title="Mark as paid?"
        footer={<><button className="btn" onClick={() => setPaying(null)}>Cancel</button><button className="btn btn-primary" onClick={pay} disabled={busy}>{busy ? 'Recording…' : `Mark ${paying ? inr(paying.amount) : ''} paid`}</button></>}>
        {paying && (
          <div className="stack" style={{ gap: 10 }}>
            <p style={{ margin: 0 }}>This records <b>{inr(paying.amount)}</b> for <b>{paying.label}</b> as paid from <b>{bank?.name || 'your bank account'}</b>.</p>
            <p className="muted" style={{ margin: 0, fontSize: 13 }}>
              FinPilot doesn't move real money; pay through your bank app, then mark it here.{' '}
              {paying.sourceType === 'loan' ? 'The next EMI will be scheduled automatically.' : 'The card balance resets and the next statement is scheduled.'}
            </p>
          </div>
        )}
      </Modal>
    </motion.div>
  )
}
