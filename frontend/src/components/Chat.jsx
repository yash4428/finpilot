import { AnimatePresence, motion } from 'framer-motion'
import { ArrowUp, BookOpen, ChevronDown, ShieldCheck, Sparkles, X, CheckCircle2, AlertTriangle, XCircle } from 'lucide-react'
import { Fragment, useEffect, useRef, useState } from 'react'
import { api } from '../api.js'
import { inr } from '../format.js'
import { useToast } from './ui.jsx'

const SUGGESTIONS = [
  'Can I afford a ₹20,000 phone this month?',
  'How much did I spend on food last month?',
  'Which debt should I pay off first?',
  'How can I save tax?',
  'What bills are due soon?',
  'What is 80C?',
]
const WORKING = ['Reading your question', 'Fetching your data', 'Running the numbers', 'Checking every figure']

export default function Chat({ compact, seed, onClose, onSeedUsed }) {
  const [msgs, setMsgs] = useState([])
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [step, setStep] = useState(0)
  const scroller = useRef(null)
  const inputRef = useRef(null)
  const toast = useToast()

  useEffect(() => {
    api.get('/agent/history').then((h) => setMsgs(h.slice(compact ? -6 : -20))).catch(() => {})
  }, [compact])

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: 'smooth' })
  }, [msgs, busy])

  useEffect(() => {
    if (!busy) return
    setStep(0)
    const t = setInterval(() => setStep((s) => Math.min(s + 1, WORKING.length - 1)), 900)
    return () => clearInterval(t)
  }, [busy])

  useEffect(() => { if (seed) { send(seed); onSeedUsed?.() } }, [seed]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { inputRef.current?.focus() }, [])

  async function send(q) {
    const question = (q ?? text).trim()
    if (!question || busy) return
    setText('')
    const tempId = 'tmp' + Date.now()
    setMsgs((m) => [...m, { id: tempId, query: question, pending: true }])
    setBusy(true)
    try {
      const r = await api.post('/agent/chat', { message: question })
      setMsgs((m) => m.map((x) => (x.id === tempId ? { ...r, fresh: true } : x)))
    } catch (e) {
      setMsgs((m) => m.filter((x) => x.id !== tempId))
      setText(question)
      toast(e.message, 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="chat">
      <div className="row" style={{ padding: compact ? '16px 18px' : '4px 22px 12px', borderBottom: '1px solid var(--line)' }}>
        <span className="pilot-mark"><Sparkles size={15} color="#F2A33A" /></span>
        <div>
          <div style={{ fontWeight: 600 }}>Pilot</div>
          <div className="faint" style={{ fontSize: 12 }}>Answers from your own data. Every figure is checked.</div>
        </div>
        {onClose && <button className="icon-btn" style={{ marginLeft: 'auto', width: 32, height: 32 }} onClick={onClose} aria-label="Close"><X size={16} /></button>}
      </div>

      <div className="chat-scroll" ref={scroller}>
        {msgs.length === 0 && !busy && (
          <div style={{ margin: 'auto 0', textAlign: 'center', padding: '20px 10px' }}>
            <div style={{ fontFamily: 'var(--f-display)', fontSize: 22, fontWeight: 600, letterSpacing: '-0.02em' }}>Ask about your money</div>
            <p className="muted" style={{ maxWidth: '38ch', margin: '6px auto 0' }}>
              Pilot looks up your balances, dues and spending before it answers, and cites sources for advice.
            </p>
          </div>
        )}
        {msgs.map((m) => (
          <Fragment key={m.id}>
            <motion.div className="msg-user" initial={m.pending ? { opacity: 0, y: 8 } : false} animate={{ opacity: 1, y: 0 }}>{m.query}</motion.div>
            {m.pending ? (
              <div className="msg-pilot">
                <span className="pilot-mark"><Sparkles size={14} color="#F2A33A" /></span>
                <div className="body">
                  <div className="typing"><i /><i /><i /></div>
                  <AnimatePresence mode="wait">
                    <motion.div key={step} className="faint" style={{ fontSize: 12.5 }} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                      {WORKING[step]}…
                    </motion.div>
                  </AnimatePresence>
                </div>
              </div>
            ) : (
              <Answer m={m} />
            )}
          </Fragment>
        ))}
      </div>

      <div className="composer">
        {msgs.length < 2 && !busy && (
          <div className="suggest">
            {SUGGESTIONS.slice(0, compact ? 4 : 6).map((s) => <button key={s} onClick={() => send(s)}>{s}</button>)}
          </div>
        )}
        <form className="composer-box" onSubmit={(e) => { e.preventDefault(); send() }}>
          <textarea ref={inputRef} rows={1} value={text} placeholder="Ask anything about your money…" aria-label="Your question"
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }} />
          <button className="btn btn-brand" style={{ width: 38, padding: 0, borderRadius: 11 }} disabled={busy || !text.trim()} aria-label="Send">
            <ArrowUp size={17} />
          </button>
        </form>
      </div>
    </div>
  )
}

function Answer({ m }) {
  const [showTrace, setShowTrace] = useState(false)
  const meta = m.meta || {}
  const v = meta.verdict
  const g = meta.grounding
  const sources = m.sources || []
  return (
    <motion.div className="msg-pilot" initial={m.fresh ? { opacity: 0, y: 10 } : false} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
      <span className="pilot-mark"><Sparkles size={14} color="#F2A33A" /></span>
      <div className="body">
        {v?.type === 'afford' && <Verdict v={v} />}
        <div className="answer">{renderMarkdown(m.answer, sources)}</div>
        {meta.facts?.length > 0 && (
          <div className="facts">
            {meta.facts.map((f) => <div className="fact" key={f.label}><span>{f.label}</span><b className="num">{inr(f.value)}</b></div>)}
          </div>
        )}
        {sources.length > 0 && (
          <div className="sources">
            {sources.map((s) => (
              <div className="source" key={s.id}>
                <span className="cite">{s.n}</span>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 500 }}><BookOpen size={12} style={{ verticalAlign: -1, marginRight: 4 }} />{s.title} · {s.section}</div>
                  <div className="faint" style={{ fontSize: 11.5 }}>{s.source}</div>
                </div>
              </div>
            ))}
          </div>
        )}
        <div className="row" style={{ gap: 14, flexWrap: 'wrap' }}>
          {g?.checked && (
            <span className="trace-toggle" style={{ cursor: 'default', color: g.ok ? 'var(--mint)' : 'var(--amber)' }}>
              <ShieldCheck size={13} /> {g.ok ? `${g.numbers} figure${g.numbers === 1 ? '' : 's'} traced to your data` : 'Some figures could not be traced'}
            </span>
          )}
          {meta.trace?.length > 0 && (
            <button className="trace-toggle" onClick={() => setShowTrace((s) => !s)} aria-expanded={showTrace}>
              How Pilot worked this out <ChevronDown size={13} style={{ transform: showTrace ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }} />
            </button>
          )}
        </div>
        <AnimatePresence>
          {showTrace && (
            <motion.div className="trace" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
              {meta.trace.map((t, i) => <div className="trace-step" key={i}><b>{t.step}</b>{t.detail}</div>)}
              <div className="trace-step"><b>Mode</b>{meta.mode === 'llm' ? 'LLM with tool calls' : 'Deterministic planner (no LLM key set)'}</div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  )
}

function Verdict({ v }) {
  const kind = !v.ok ? 'no' : v.comfort === 'comfortable' ? 'ok' : 'tight'
  const Icon = kind === 'ok' ? CheckCircle2 : kind === 'tight' ? AlertTriangle : XCircle
  const label = kind === 'ok' ? 'Affordable' : kind === 'tight' ? 'Affordable, but tight' : 'Not this month'
  return (
    <div className={`verdict-card ${kind}`}>
      <Icon size={22} />
      <div>
        <b>{label}</b>
        <div style={{ fontSize: 12.5, opacity: 0.9 }}>{inr(v.amount)} vs {inr(v.headroom)} safe headroom</div>
      </div>
    </div>
  )
}

/* Minimal, safe markdown: paragraphs, bullets, numbered lists, **bold**, _italic_, [n] citations. */
function renderMarkdown(src = '', sources = []) {
  const blocks = src.split(/\n{2,}/)
  return blocks.map((b, i) => {
    const lines = b.split('\n')
    if (lines.every((l) => /^\s*[-*] /.test(l))) {
      return <ul key={i}>{lines.map((l, j) => <li key={j}>{inline(l.replace(/^\s*[-*] /, ''), sources)}</li>)}</ul>
    }
    if (lines.every((l) => /^\s*\d+\. /.test(l))) {
      return <ol key={i}>{lines.map((l, j) => <li key={j}>{inline(l.replace(/^\s*\d+\. /, ''), sources)}</li>)}</ol>
    }
    if (lines.length > 1 && lines.slice(1).every((l) => /^\s*([-*]|\d+\.) /.test(l))) {
      const ordered = /^\s*\d+\. /.test(lines[1])
      const items = lines.slice(1).map((l, j) => <li key={j}>{inline(l.replace(/^\s*([-*]|\d+\.) /, ''), sources)}</li>)
      return <div key={i}><p style={{ marginBottom: 2 }}>{inline(lines[0], sources)}</p>{ordered ? <ol>{items}</ol> : <ul>{items}</ul>}</div>
    }
    return <p key={i}>{lines.map((l, j) => <Fragment key={j}>{j > 0 && <br />}{inline(l, sources)}</Fragment>)}</p>
  })
}

function inline(text, sources) {
  const parts = text.split(/(\*\*[^*]+\*\*|_[^_]+_|\*[^*]+\*|\[\d+\])/g)
  return parts.map((p, i) => {
    if (/^\*\*[^*]+\*\*$/.test(p)) return <strong key={i}>{p.slice(2, -2)}</strong>
    if (/^(_[^_]+_|\*[^*]+\*)$/.test(p)) return <em key={i}>{p.slice(1, -1)}</em>
    const c = p.match(/^\[(\d+)\]$/)
    if (c) {
      const s = sources.find((x) => String(x.n) === c[1])
      return <span key={i} className="cite" title={s ? `${s.title} · ${s.section}` : ''}>{c[1]}</span>
    }
    return p
  })
}
