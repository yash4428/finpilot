import { motion } from 'framer-motion'
import { AlertTriangle, ChevronDown, Download, FileUp, Plus, Repeat, Search, Sparkles, Check, Receipt } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { api } from '../api.js'
import { useShell } from '../components/Layout.jsx'
import { Empty, ErrorNote, MerchantBadge, Modal, Skeleton, page, useApi, useToast } from '../components/ui.jsx'
import { catColor, fmtDate, inr } from '../format.js'

const RANGES = [
  { id: 'month', label: 'This month' },
  { id: 'last', label: 'Last month' },
  { id: '90', label: '90 days' },
  { id: 'all', label: 'All' },
]

function rangeDates(id) {
  const t = new Date()
  const iso = (d) => d.toLocaleDateString('en-CA')
  if (id === 'month') return [iso(new Date(t.getFullYear(), t.getMonth(), 1)), iso(t)]
  if (id === 'last') return [iso(new Date(t.getFullYear(), t.getMonth() - 1, 1)), iso(new Date(t.getFullYear(), t.getMonth(), 0))]
  if (id === '90') return [iso(new Date(t.getTime() - 89 * 864e5)), iso(t)]
  return [null, null]
}

export default function Transactions() {
  const [params] = useSearchParams()
  const [range, setRange] = useState(params.get('flagged') ? 'all' : 'month')
  const [q, setQ] = useState('')
  const [cat, setCat] = useState('')
  const [flagged, setFlagged] = useState(!!params.get('flagged'))
  const [adding, setAdding] = useState(false)
  const [importing, setImporting] = useState(false)
  const { refreshShell } = useShell()
  const toast = useToast()

  const [from, to] = rangeDates(range)
  const path = `/transactions?${new URLSearchParams(Object.entries({ from, to }).filter(([, v]) => v))}`
  const { data, error, loading, reload, setData } = useApi(path)
  const { data: categories } = useApi('/categories')
  const { data: accounts } = useApi('/accounts')
  const { data: cards } = useApi('/cards')

  const rows = useMemo(() => (data || []).filter((t) =>
    (!cat || t.category === cat) && (!flagged || t.isAnomaly) &&
    (!q || `${t.merchant} ${t.description || ''}`.toLowerCase().includes(q.toLowerCase()))), [data, cat, flagged, q])

  const spent = rows.filter((t) => t.amount < 0 && !['Card Payment', 'Transfers', 'Investments', 'Loan EMI'].includes(t.category)).reduce((a, t) => a - t.amount, 0)
  const income = rows.filter((t) => t.amount > 0).reduce((a, t) => a + t.amount, 0)
  const flaggedCount = (data || []).filter((t) => t.isAnomaly).length

  const grouped = useMemo(() => {
    const g = []
    rows.forEach((t) => {
      const last = g[g.length - 1]
      if (last && last.date === t.date) last.items.push(t)
      else g.push({ date: t.date, items: [t] })
    })
    return g
  }, [rows])

  async function recategorize(t, category) {
    const prev = t.category
    setData((d) => d.map((x) => (x.id === t.id ? { ...x, category } : x)))
    try {
      await api.put(`/transactions/${t.id}`, { category })
      toast(`Saved. Pilot will learn that ${t.merchant} is ${category}.`)
    } catch (e) {
      setData((d) => d.map((x) => (x.id === t.id ? { ...x, category: prev } : x)))
      toast(e.message, 'error')
    }
  }

  async function dismiss(t) {
    try {
      await api.post(`/transactions/${t.id}/dismiss-anomaly`)
      setData((d) => d.map((x) => (x.id === t.id ? { ...x, isAnomaly: false, anomalyReason: 'Reviewed by you' } : x)))
      toast('Marked as expected')
    } catch (e) { toast(e.message, 'error') }
  }

  const sourceName = (t) => t.cardId ? (cards || []).find((c) => c.id === t.cardId)?.issuer?.replace(' Bank', '') + ' card'
    : (accounts || []).find((a) => a.id === t.accountId)?.name || '—'

  return (
    <motion.div className="stack" variants={page} initial="initial" animate="animate" exit="exit">
      <div className="row" style={{ flexWrap: 'wrap', gap: 10 }}>
        <div className="segmented" role="tablist" aria-label="Date range">
          {RANGES.map((r) => <button key={r.id} role="tab" aria-selected={range === r.id} className={range === r.id ? 'on' : ''} onClick={() => setRange(r.id)}>{r.label}</button>)}
        </div>
        <div className="input-prefix" style={{ flex: '1 1 200px', maxWidth: 300 }}>
          <span><Search size={15} /></span>
          <input className="input" placeholder="Search merchants" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search merchants" />
        </div>
        <select className="select" style={{ width: 170 }} value={cat} onChange={(e) => setCat(e.target.value)} aria-label="Category">
          <option value="">All categories</option>
          {(categories || []).map((c) => <option key={c.id}>{c.name}</option>)}
        </select>
        <button className={`chip ${flagged ? 'on' : ''}`} onClick={() => setFlagged((f) => !f)} aria-pressed={flagged}>
          <AlertTriangle size={13} /> Flagged {flaggedCount > 0 && `(${flaggedCount})`}
        </button>
        <span style={{ flex: 1 }} />
        <button className="btn" onClick={() => setImporting(true)}><FileUp size={16} /> Import CSV</button>
        <button className="btn btn-primary" onClick={() => setAdding(true)}><Plus size={16} /> Add</button>
      </div>

      <div className="grid">
        <Summary className="c-4 md-6" label="Spent" value={spent} />
        <Summary className="c-4 md-6" label="Money in" value={income} pos />
        <Summary className="c-4 md-6" label="Transactions" raw={rows.length} />
      </div>

      {error && <ErrorNote message={error} onRetry={reload} />}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {loading ? (
          <div className="stack" style={{ padding: 20 }}>{[...Array(6)].map((_, i) => <Skeleton key={i} h={36} />)}</div>
        ) : rows.length === 0 ? (
          <Empty icon={Receipt} title="No transactions match">Try a different range or clear the filters.</Empty>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="table">
              <thead><tr><th>Merchant</th><th>Category</th><th className="hide-sm">Paid from</th><th className="amt">Amount</th></tr></thead>
              <tbody>
                {grouped.map((g) => (
                  <GroupRows key={g.date} g={g} categories={categories} onCat={recategorize} onDismiss={dismiss} sourceName={sourceName} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <AddTxn open={adding} onClose={() => setAdding(false)} accounts={accounts} cards={cards} categories={categories}
        onDone={(t) => { reload(); refreshShell(); toast(t.isAnomaly ? 'Added, and flagged as unusual' : `Added as ${t.category}`) }} />
      <ImportCsv open={importing} onClose={() => setImporting(false)} accounts={accounts}
        onDone={() => { reload(); refreshShell() }} />
    </motion.div>
  )
}

function GroupRows({ g, categories, onCat, onDismiss, sourceName }) {
  return (
    <>
      <tr className="day-row"><td colSpan={4}>{fmtDate(g.date, { weekday: 'short', day: 'numeric', month: 'short' })}</td></tr>
      {g.items.map((t) => (
        <tr key={t.id} className={t.isAnomaly ? 'flagged' : ''}>
          <td>
            <div className="row" style={{ gap: 12 }}>
              <MerchantBadge name={t.merchant} category={t.category} />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 500 }} className="row">
                  {t.merchant}
                  {t.isRecurring && <span title="Recurring: included in your month-end forecast" style={{ color: 'var(--ink-3)' }}><Repeat size={12} /></span>}
                </div>
                {t.isAnomaly ? (
                  <div className="row" style={{ gap: 8, fontSize: 12, color: 'var(--chilli)', flexWrap: 'wrap' }}>
                    <AlertTriangle size={12} /> {t.anomalyReason}
                    <button className="link-btn" style={{ fontSize: 12 }} onClick={() => onDismiss(t)}><Check size={12} /> Looks fine</button>
                  </div>
                ) : t.description && <div className="faint" style={{ fontSize: 12 }}>{t.description}</div>}
              </div>
            </div>
          </td>
          <td>
            <span className="cat-wrap" style={{ background: `color-mix(in srgb, ${catColor(t.category)} 13%, transparent)`, color: `color-mix(in srgb, ${catColor(t.category)} 80%, var(--ink))` }}>
              <select className="cat-select" value={t.category} onChange={(e) => onCat(t, e.target.value)} aria-label={`Category for ${t.merchant}`}>
                {(categories || [{ name: t.category }]).map((c) => <option key={c.name}>{c.name}</option>)}
              </select>
              <ChevronDown size={12} />
            </span>
          </td>
          <td className="hide-sm muted" style={{ fontSize: 13 }}>{sourceName(t)}</td>
          <td className={`amt ${t.amount > 0 ? 'pos' : ''}`}>{inr(t.amount, { sign: true })}</td>
        </tr>
      ))}
    </>
  )
}

function Summary({ label, value, raw, pos, className }) {
  return (
    <div className={`card ${className}`} style={{ padding: '14px 18px' }}>
      <div className="stat-label">{label}</div>
      <div className="stat-value num" style={{ fontSize: 24, color: pos ? 'var(--mint)' : undefined }}>{raw != null ? raw : inr(value)}</div>
    </div>
  )
}

function AddTxn({ open, onClose, accounts, cards, categories, onDone }) {
  const today = new Date().toLocaleDateString('en-CA')
  const blank = { dir: 'out', amount: '', date: today, merchant: '', description: '', source: '', category: '' }
  const [f, setF] = useState(blank)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }))

  async function save(e) {
    e.preventDefault()
    setBusy(true); setErr('')
    const [kind, id] = (f.source || `acct:${accounts?.[0]?.id}`).split(':')
    try {
      const t = await api.post('/transactions', {
        amount: (f.dir === 'out' ? -1 : 1) * Number(f.amount), date: f.date, merchant: f.merchant, description: f.description || null,
        category: f.category || null, accountId: kind === 'acct' ? Number(id) : null, cardId: kind === 'card' ? Number(id) : null,
      })
      onDone(t); setF(blank); onClose()
    } catch (e2) { setErr(e2.message) } finally { setBusy(false) }
  }

  return (
    <Modal open={open} onClose={onClose} title="Add a transaction"
      footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" form="add-txn" disabled={busy}>{busy ? 'Saving…' : 'Add transaction'}</button></>}>
      <form id="add-txn" className="form-grid" onSubmit={save}>
        <div className="full">
          <div className="segmented">
            <button type="button" className={f.dir === 'out' ? 'on' : ''} onClick={() => setF((x) => ({ ...x, dir: 'out' }))}>Money out</button>
            <button type="button" className={f.dir === 'in' ? 'on' : ''} onClick={() => setF((x) => ({ ...x, dir: 'in' }))}>Money in</button>
          </div>
        </div>
        <div className="field"><label htmlFor="t-amt">Amount</label>
          <div className="input-prefix"><span>₹</span><input id="t-amt" className="input" required inputMode="decimal" value={f.amount} onChange={set('amount')} placeholder="0" /></div></div>
        <div className="field"><label htmlFor="t-date">Date</label><input id="t-date" className="input" type="date" required value={f.date} max={today} onChange={set('date')} /></div>
        <div className="field full"><label htmlFor="t-m">Merchant</label><input id="t-m" className="input" required value={f.merchant} onChange={set('merchant')} placeholder="e.g. Blinkit" /></div>
        <div className="field"><label htmlFor="t-src">Paid from</label>
          <select id="t-src" className="select" value={f.source} onChange={set('source')}>
            {(accounts || []).map((a) => <option key={'a' + a.id} value={`acct:${a.id}`}>{a.name}</option>)}
            {(cards || []).map((c) => <option key={'c' + c.id} value={`card:${c.id}`}>{c.issuer} {c.nickname} card</option>)}
          </select></div>
        <div className="field"><label htmlFor="t-cat">Category</label>
          <select id="t-cat" className="select" value={f.category} onChange={set('category')}>
            <option value="">Detect automatically</option>
            {(categories || []).map((c) => <option key={c.id}>{c.name}</option>)}
          </select></div>
        <div className="field full"><label htmlFor="t-d">Note <span className="faint">(optional)</span></label><input id="t-d" className="input" value={f.description} onChange={set('description')} /></div>
        {!f.category && <div className="full hint row" style={{ gap: 6 }}><Sparkles size={13} /> FinPilot's categorizer will pick the category and check it for anything unusual.</div>}
        {err && <div className="full error-text" role="alert">{err}</div>}
      </form>
    </Modal>
  )
}

function ImportCsv({ open, onClose, accounts, onDone }) {
  const [file, setFile] = useState(null)
  const [over, setOver] = useState(false)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState(null)
  const [err, setErr] = useState('')
  const [account, setAccount] = useState('')
  const input = useRef(null)

  const close = () => { setFile(null); setResult(null); setErr(''); onClose() }
  async function run() {
    if (!file) return
    setBusy(true); setErr('')
    const fd = new FormData()
    fd.append('file', file)
    const acct = account || accounts?.[0]?.id
    if (acct) fd.append('accountId', acct)
    try { setResult(await api.upload('/transactions/import', fd)); onDone() } catch (e) { setErr(e.message) } finally { setBusy(false) }
  }

  return (
    <Modal open={open} onClose={close} title="Import a bank statement"
      footer={result ? <button className="btn btn-primary" onClick={close}>Done</button> :
        <><button className="btn" onClick={close}>Cancel</button><button className="btn btn-primary" onClick={run} disabled={!file || busy}>{busy ? 'Importing…' : 'Import'}</button></>}>
      {result ? (
        <div className="stack" style={{ gap: 10 }}>
          <div className="grid" style={{ gap: 10 }}>
            <Stat n={result.imported} label="imported" />
            <Stat n={result.categorized} label="auto-categorized" />
            <Stat n={result.anomalies} label="flagged unusual" warn={result.anomalies > 0} />
          </div>
          {result.errors.length > 0 && <div className="hint">{result.errors.length} rows skipped: {result.errors.slice(0, 3).join(' · ')}</div>}
        </div>
      ) : (
        <div className="stack" style={{ gap: 14 }}>
          <div className={`dropzone ${over ? 'over' : ''}`} onClick={() => input.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setOver(true) }} onDragLeave={() => setOver(false)}
            onDrop={(e) => { e.preventDefault(); setOver(false); setFile(e.dataTransfer.files[0]) }}
            role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && input.current?.click()}>
            <FileUp size={26} style={{ color: 'var(--brand)' }} />
            <div style={{ fontWeight: 600, marginTop: 6 }}>{file ? file.name : 'Drop a CSV here, or click to choose'}</div>
            <div className="hint">Columns: <span className="mono">date,merchant,description,amount</span> · negative = money out</div>
            <input ref={input} type="file" accept=".csv,text/csv" hidden onChange={(e) => setFile(e.target.files[0])} />
          </div>
          <div className="field"><label htmlFor="imp-acct">Import into</label>
            <select id="imp-acct" className="select" value={account} onChange={(e) => setAccount(e.target.value)}>
              {(accounts || []).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select></div>
          <a className="link-btn" href="/sample_statement.csv" download><Download size={13} /> Download a sample statement</a>
          {err && <div className="error-text" role="alert">{err}</div>}
        </div>
      )}
    </Modal>
  )
}

function Stat({ n, label, warn }) {
  return (
    <div className="card c-4" style={{ padding: 14, textAlign: 'center', gridColumn: 'span 4' }}>
      <div className="stat-value" style={{ color: warn ? 'var(--chilli)' : undefined }}>{n}</div>
      <div className="faint" style={{ fontSize: 12 }}>{label}</div>
    </div>
  )
}
