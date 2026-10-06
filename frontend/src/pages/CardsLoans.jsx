import { motion } from 'framer-motion'
import { CreditCard, Pencil, Plus, Trash2, Wifi, Landmark } from 'lucide-react'
import { useState } from 'react'
import { api } from '../api.js'
import { useShell } from '../components/Layout.jsx'
import { Empty, ErrorNote, Modal, Skeleton, page, rise, useApi, useToast } from '../components/ui.jsx'
import { fmtDate, inr, relDays } from '../format.js'

const issuerClass = (i = '') => {
  const s = i.toLowerCase()
  return s.includes('hdfc') ? 'cc-hdfc' : s.includes('axis') ? 'cc-axis' : s.includes('icici') ? 'cc-icici' : s.includes('sbi') ? 'cc-sbi' : 'cc-other'
}

export default function CardsLoans() {
  const cards = useApi('/cards')
  const loans = useApi('/loans')
  const [cardForm, setCardForm] = useState(null)
  const [loanForm, setLoanForm] = useState(null)
  const { refreshShell } = useShell()
  const toast = useToast()

  async function remove(kind, item) {
    if (!window.confirm(`Remove ${kind === 'cards' ? item.issuer + ' card' : (item.lender || 'this loan')}? Its upcoming dues will be removed too.`)) return
    try { await api.del(`/${kind}/${item.id}`); (kind === 'cards' ? cards : loans).reload(); refreshShell(); toast('Removed') } catch (e) { toast(e.message, 'error') }
  }

  const totalLimit = (cards.data || []).reduce((a, c) => a + c.creditLimit, 0)
  const totalUsed = (cards.data || []).reduce((a, c) => a + c.outstanding, 0)

  return (
    <motion.div className="stack" style={{ gap: 28 }} variants={page} initial="initial" animate="animate" exit="exit">
      <section>
        <div className="row" style={{ marginBottom: 14 }}>
          <div>
            <h2 style={{ margin: 0, fontFamily: 'var(--f-display)', fontWeight: 600, fontSize: 19, letterSpacing: '-0.02em' }}>Credit cards</h2>
            {totalLimit > 0 && <div className="muted" style={{ fontSize: 13 }}>{inr(totalUsed)} used of {inr(totalLimit)} across cards · {Math.round((totalUsed / totalLimit) * 100)}% utilisation</div>}
          </div>
          <button className="btn btn-primary" style={{ marginLeft: 'auto' }} onClick={() => setCardForm({})}><Plus size={16} /> Add card</button>
        </div>
        {cards.error && <ErrorNote message={cards.error} onRetry={cards.reload} />}
        <div className="grid">
          {cards.loading && [0, 1].map((i) => <div className="c-4 md-6" key={i}><Skeleton h={220} style={{ borderRadius: 18 }} /></div>)}
          {(cards.data || []).map((c) => {
            const util = c.creditLimit ? (c.outstanding / c.creditLimit) * 100 : 0
            return (
              <motion.div className="c-4 md-6 stack" style={{ gap: 12 }} key={c.id} variants={rise}>
                <div className={`cc ${issuerClass(c.issuer)}`}>
                  <div className="row between" style={{ position: 'relative', zIndex: 1 }}>
                    <div><div className="cc-issuer">{c.issuer}</div><div className="cc-nick">{c.nickname}</div></div>
                    <Wifi size={18} style={{ transform: 'rotate(90deg)', opacity: 0.7 }} />
                  </div>
                  <div className="cc-chip" />
                  <div className="row between" style={{ position: 'relative', zIndex: 1 }}>
                    <span className="cc-num">•••• {c.last4 || '0000'}</span>
                    <span style={{ fontSize: 11, opacity: 0.8 }}>{c.apr}% APR</span>
                  </div>
                </div>
                <div className="card" style={{ padding: 16 }}>
                  <div className="row between"><span className="muted" style={{ fontSize: 13 }}>Outstanding</span><b className="num">{inr(c.outstanding)}</b></div>
                  <div className="progress" style={{ margin: '8px 0' }}><i style={{ width: `${Math.min(100, util)}%`, background: util >= 30 ? 'var(--amber)' : 'var(--brand)' }} /></div>
                  <div className="row between faint" style={{ fontSize: 12 }}><span>{util.toFixed(0)}% of {inr(c.creditLimit)}</span><span>{c.dueDate ? `Due ${fmtDate(c.dueDate)} · ${relDays(c.dueDate)}` : 'No bill due'}</span></div>
                  <div className="row" style={{ marginTop: 10, gap: 6 }}>
                    <span className="faint" style={{ fontSize: 12 }}>Min due {inr(c.minDue)}</span>
                    <button className="icon-btn" style={{ marginLeft: 'auto', width: 30, height: 30 }} onClick={() => setCardForm(c)} aria-label="Edit card"><Pencil size={14} /></button>
                    <button className="icon-btn" style={{ width: 30, height: 30 }} onClick={() => remove('cards', c)} aria-label="Remove card"><Trash2 size={14} /></button>
                  </div>
                </div>
              </motion.div>
            )
          })}
          {!cards.loading && !cards.data?.length && <div className="c-12 card"><Empty icon={CreditCard} title="No cards yet">Add a card to track its bill and due date.</Empty></div>}
        </div>
      </section>

      <section>
        <div className="row" style={{ marginBottom: 14 }}>
          <h2 style={{ margin: 0, fontFamily: 'var(--f-display)', fontWeight: 600, fontSize: 19, letterSpacing: '-0.02em' }}>Loans & EMIs</h2>
          <button className="btn btn-primary" style={{ marginLeft: 'auto' }} onClick={() => setLoanForm({})}><Plus size={16} /> Add loan</button>
        </div>
        <div className="grid">
          {(loans.data || []).map((l) => {
            const paid = l.tenureMonths - l.remainingInstallments
            const pct = (paid / l.tenureMonths) * 100
            return (
              <motion.div className="card c-6" key={l.id} variants={rise}>
                <div className="row" style={{ alignItems: 'flex-start' }}>
                  <span className="merchant-badge" style={{ background: 'var(--brand-soft)', color: 'var(--brand-ink)' }}><Landmark size={17} /></span>
                  <div className="grow" style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600 }}>{l.lender}</div>
                    <div className="faint" style={{ fontSize: 12.5, textTransform: 'capitalize' }}>{l.type === 'emi' ? 'Purchase EMI' : `${l.type} loan`} · {l.interestRate}% p.a.</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div className="stat-value" style={{ fontSize: 22 }}>{inr(l.installmentAmount)}</div>
                    <div className="faint" style={{ fontSize: 12 }}>per month</div>
                  </div>
                </div>
                <div className="progress" style={{ margin: '16px 0 8px' }}><i style={{ width: `${pct}%`, background: 'var(--mint)' }} /></div>
                <div className="row between" style={{ fontSize: 12.5 }}>
                  <span className="muted">{paid} of {l.tenureMonths} EMIs paid</span>
                  <span className="muted">Next {fmtDate(l.nextDueDate)} · {relDays(l.nextDueDate)}</span>
                </div>
                <div className="row" style={{ marginTop: 12, gap: 6 }}>
                  <span className="faint" style={{ fontSize: 12 }}>{inr(l.installmentAmount * l.remainingInstallments)} left to repay · principal {inr(l.principal)}</span>
                  <button className="icon-btn" style={{ marginLeft: 'auto', width: 30, height: 30 }} onClick={() => setLoanForm(l)} aria-label="Edit loan"><Pencil size={14} /></button>
                  <button className="icon-btn" style={{ width: 30, height: 30 }} onClick={() => remove('loans', l)} aria-label="Remove loan"><Trash2 size={14} /></button>
                </div>
              </motion.div>
            )
          })}
          {!loans.loading && !loans.data?.length && <div className="c-12 card"><Empty icon={Landmark} title="No loans">Add a loan or EMI to get reminders before each instalment.</Empty></div>}
        </div>
      </section>

      <CardForm item={cardForm} onClose={() => setCardForm(null)} onSaved={() => { cards.reload(); refreshShell(); toast('Card saved. Its bill is now in your dues.') }} />
      <LoanForm item={loanForm} onClose={() => setLoanForm(null)} onSaved={() => { loans.reload(); refreshShell(); toast('Loan saved. Next EMI added to your dues.') }} />
    </motion.div>
  )
}

function CardForm({ item, onClose, onSaved }) {
  const editing = item?.id
  const [f, setF] = useState({})
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const v = { issuer: '', nickname: '', last4: '', creditLimit: '', outstanding: '', statementDate: '', dueDate: '', apr: 42, ...item, ...f }
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }))
  const close = () => { setF({}); setErr(''); onClose() }

  async function save(e) {
    e.preventDefault(); setBusy(true); setErr('')
    const body = { issuer: v.issuer, nickname: v.nickname, last4: v.last4, creditLimit: Number(v.creditLimit), outstanding: Number(v.outstanding) || 0,
      statementDate: v.statementDate || null, dueDate: v.dueDate || null, apr: Number(v.apr) || null }
    try { editing ? await api.put(`/cards/${item.id}`, body) : await api.post('/cards', body); onSaved(); close() } catch (e2) { setErr(e2.message) } finally { setBusy(false) }
  }

  return (
    <Modal open={!!item} onClose={close} title={editing ? 'Edit card' : 'Add a credit card'}
      footer={<><button className="btn" onClick={close}>Cancel</button><button className="btn btn-primary" form="card-form" disabled={busy}>{busy ? 'Saving…' : 'Save card'}</button></>}>
      <form id="card-form" className="form-grid" onSubmit={save}>
        <div className="field"><label htmlFor="c-i">Bank</label><input id="c-i" className="input" required value={v.issuer} onChange={set('issuer')} placeholder="HDFC Bank" /></div>
        <div className="field"><label htmlFor="c-n">Card name</label><input id="c-n" className="input" value={v.nickname || ''} onChange={set('nickname')} placeholder="Millennia" /></div>
        <div className="field"><label htmlFor="c-l4">Last 4 digits</label><input id="c-l4" className="input" maxLength={4} inputMode="numeric" pattern="\d{4}" value={v.last4 || ''} onChange={set('last4')} />
          <span className="hint">Only the last four. Never your full card number.</span></div>
        <div className="field"><label htmlFor="c-apr">Interest rate (APR %)</label><input id="c-apr" className="input" inputMode="decimal" value={v.apr} onChange={set('apr')} /></div>
        <div className="field"><label htmlFor="c-lim">Credit limit</label><div className="input-prefix"><span>₹</span><input id="c-lim" className="input" required inputMode="numeric" value={v.creditLimit} onChange={set('creditLimit')} /></div></div>
        <div className="field"><label htmlFor="c-out">Current bill</label><div className="input-prefix"><span>₹</span><input id="c-out" className="input" inputMode="numeric" value={v.outstanding} onChange={set('outstanding')} /></div></div>
        <div className="field"><label htmlFor="c-sd">Statement date</label><input id="c-sd" type="date" className="input" value={v.statementDate || ''} onChange={set('statementDate')} /></div>
        <div className="field"><label htmlFor="c-dd">Payment due date</label><input id="c-dd" type="date" className="input" value={v.dueDate || ''} onChange={set('dueDate')} /></div>
        {err && <div className="full error-text" role="alert">{err}</div>}
      </form>
    </Modal>
  )
}

function emi(p, rate, n) {
  if (!p || !n) return 0
  const r = rate / 1200
  if (!r) return p / n
  const pw = Math.pow(1 + r, n)
  return (p * r * pw) / (pw - 1)
}

function LoanForm({ item, onClose, onSaved }) {
  const editing = item?.id
  const [f, setF] = useState({})
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const v = { type: 'personal', lender: '', principal: '', interestRate: '', tenureMonths: '', nextDueDate: '', remainingInstallments: '', ...item, ...f }
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }))
  const close = () => { setF({}); setErr(''); onClose() }
  const preview = emi(Number(v.principal), Number(v.interestRate), Number(v.tenureMonths))

  async function save(e) {
    e.preventDefault(); setBusy(true); setErr('')
    const body = { type: v.type, lender: v.lender, principal: Number(v.principal), interestRate: Number(v.interestRate), tenureMonths: Number(v.tenureMonths),
      nextDueDate: v.nextDueDate, remainingInstallments: v.remainingInstallments ? Number(v.remainingInstallments) : null,
      installmentAmount: editing && !f.principal && !f.interestRate && !f.tenureMonths ? item.installmentAmount : null }
    try { editing ? await api.put(`/loans/${item.id}`, body) : await api.post('/loans', body); onSaved(); close() } catch (e2) { setErr(e2.message) } finally { setBusy(false) }
  }

  return (
    <Modal open={!!item} onClose={close} title={editing ? 'Edit loan' : 'Add a loan or EMI'}
      footer={<><button className="btn" onClick={close}>Cancel</button><button className="btn btn-primary" form="loan-form" disabled={busy}>{busy ? 'Saving…' : 'Save loan'}</button></>}>
      <form id="loan-form" className="form-grid" onSubmit={save}>
        <div className="field"><label htmlFor="l-t">Type</label>
          <select id="l-t" className="select" value={v.type} onChange={set('type')}>
            <option value="personal">Personal loan</option><option value="education">Education loan</option><option value="emi">Purchase EMI</option>
          </select></div>
        <div className="field"><label htmlFor="l-l">Lender</label><input id="l-l" className="input" required value={v.lender || ''} onChange={set('lender')} placeholder="Bajaj Finserv" /></div>
        <div className="field"><label htmlFor="l-p">Loan amount</label><div className="input-prefix"><span>₹</span><input id="l-p" className="input" required inputMode="numeric" value={v.principal} onChange={set('principal')} /></div></div>
        <div className="field"><label htmlFor="l-r">Interest rate (% a year)</label><input id="l-r" className="input" required inputMode="decimal" value={v.interestRate} onChange={set('interestRate')} /></div>
        <div className="field"><label htmlFor="l-n">Tenure (months)</label><input id="l-n" className="input" required inputMode="numeric" value={v.tenureMonths} onChange={set('tenureMonths')} /></div>
        <div className="field"><label htmlFor="l-d">Next EMI date</label><input id="l-d" type="date" className="input" required value={v.nextDueDate || ''} onChange={set('nextDueDate')} /></div>
        <div className="field"><label htmlFor="l-rem">EMIs left <span className="faint">(optional)</span></label><input id="l-rem" className="input" inputMode="numeric" value={v.remainingInstallments || ''} onChange={set('remainingInstallments')} /></div>
        <div className="field" style={{ justifyContent: 'flex-end' }}>
          <div className="card" style={{ padding: '10px 14px', background: 'var(--surface-2)' }}>
            <div className="faint" style={{ fontSize: 11.5 }}>Monthly EMI</div>
            <div style={{ fontFamily: 'var(--f-display)', fontWeight: 600, fontSize: 20 }} className="num">{preview ? inr(preview) : '—'}</div>
          </div>
        </div>
        {err && <div className="full error-text" role="alert">{err}</div>}
      </form>
    </Modal>
  )
}
