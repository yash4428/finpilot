import { AnimatePresence, motion } from 'framer-motion'
import { CheckCircle2, Keyboard, MessageSquare, Mic, MicOff, Volume2, VolumeX, X, XCircle, AlertTriangle } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api.js'
import { inr } from '../format.js'

const SpeechRecognition = typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition)

const LANGS = [
  { id: 'en-IN', label: 'English / Hinglish' },
  { id: 'hi-IN', label: 'हिंदी' },
]
const TRY = [
  'Kya main 20 hazaar ka phone le sakta hoon?',
  'Can I afford a ₹90,000 laptop?',
  'Mahine ke end tak kitna bachega?',
  'Mera bill kab bharna hai?',
  'Pichle mahine khane pe kitna kharcha kiya?',
  'Tax kaise bachaye?',
]
// Which screen shows the answer best.
const ROUTE = { tax: '/tax', payoff: '/cards', knowledge: null }

/**
 * Talk to Pilot. Speech → /agent/chat (same grounded agent as the chat) → spoken reply,
 * while the dashboard section behind the answer animates (see Overview's pilot listener).
 */
export default function VoicePilot({ onEvent, openChat }) {
  const nav = useNavigate()
  const [open, setOpen] = useState(false)
  const [phase, setPhase] = useState('idle') // idle | listening | thinking | answered | error
  const [lang, setLang] = useState(() => { try { return localStorage.getItem('fp-voice-lang') || 'en-IN' } catch { return 'en-IN' } })
  const [interim, setInterim] = useState('')
  const [heard, setHeard] = useState('')
  const [reply, setReply] = useState(null)
  const [error, setError] = useState('')
  const [typed, setTyped] = useState('')
  const [muted, setMuted] = useState(false)
  const [speaking, setSpeaking] = useState(false)
  const rec = useRef(null)
  const finalText = useRef('')

  const speak = useCallback((text, replyLang) => {
    if (muted || !window.speechSynthesis || !text) return
    window.speechSynthesis.cancel()
    const u = new SpeechSynthesisUtterance(text.replace(/₹/g, '₹ '))
    const voices = window.speechSynthesis.getVoices()
    // An Indian-English voice reads romanised Hinglish naturally.
    u.voice = voices.find((v) => v.lang === 'en-IN') || voices.find((v) => v.lang?.startsWith('hi')) || voices.find((v) => v.lang?.startsWith('en')) || null
    u.lang = u.voice?.lang || (replyLang === 'hi' ? 'en-IN' : 'en-IN')
    u.rate = 1.02
    u.onstart = () => setSpeaking(true)
    u.onend = () => setSpeaking(false)
    u.onerror = () => setSpeaking(false)
    window.speechSynthesis.speak(u)
  }, [muted])

  const ask = useCallback(async (q) => {
    const question = q.trim()
    if (!question) return
    setHeard(question)
    setInterim('')
    setPhase('thinking')
    try {
      const r = await api.post('/agent/chat', { message: question })
      const meta = r.meta || {}
      setReply({ ...r, meta })
      setPhase('answered')
      setOpen(false)
      const target = ROUTE[meta.intent]
      if (target !== undefined && target !== null) nav(target)
      else if (target === undefined) nav('/')
      onEvent?.({ intent: meta.intent, verdict: meta.verdict, amount: meta.verdict?.amount, at: Date.now() })
      speak(meta.speech || r.answer, meta.lang)
    } catch (e) {
      setError(e.message)
      setPhase('error')
    }
  }, [nav, onEvent, speak])

  const listen = useCallback(() => {
    setError('')
    if (!SpeechRecognition) {
      setPhase('error')
      setError("This browser can't listen. Use Chrome, Edge or Safari, or type your question below.")
      return
    }
    try { rec.current?.abort() } catch { /* ignore */ }
    const r = new SpeechRecognition()
    r.lang = lang
    r.interimResults = true
    r.continuous = false
    r.maxAlternatives = 1
    finalText.current = ''
    r.onresult = (e) => {
      let fin = '', mid = ''
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript
        if (e.results[i].isFinal) fin += t
        else mid += t
      }
      if (fin) finalText.current += fin
      setInterim(finalText.current + mid)
    }
    r.onerror = (e) => {
      setPhase('error')
      setError(e.error === 'not-allowed' || e.error === 'service-not-allowed'
        ? 'Microphone access is blocked. Allow it in the browser, or type your question below.'
        : e.error === 'no-speech' ? "I didn't catch that. Tap the orb and try again." : `Voice input failed (${e.error}). Type your question below.`)
    }
    r.onend = () => {
      const t = finalText.current.trim()
      if (t) ask(t)
      else setPhase((p) => (p === 'listening' ? 'idle' : p))
    }
    rec.current = r
    setInterim('')
    setPhase('listening')
    try { r.start() } catch { /* already started */ }
  }, [lang, ask])

  const start = () => {
    setOpen(true)
    setReply(null)
    window.speechSynthesis?.cancel()
    listen()
  }
  const close = () => {
    try { rec.current?.abort() } catch { /* ignore */ }
    setOpen(false)
    if (phase !== 'answered') setPhase('idle')
  }

  useEffect(() => {
    // Some browsers load voices lazily.
    window.speechSynthesis?.getVoices()
    const k = (e) => { if (e.key === 'Escape') close() }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  })
  useEffect(() => { try { localStorage.setItem('fp-voice-lang', lang) } catch { /* ignore */ } }, [lang])

  const v = reply?.meta?.verdict
  const kind = v ? (!v.ok ? 'no' : v.comfort === 'comfortable' ? 'ok' : 'tight') : null

  return (
    <>
      <motion.button className="voice-fab" onClick={start} aria-label="Talk to Pilot" whileHover={{ scale: 1.06 }} whileTap={{ scale: 0.94 }}>
        <Mic size={26} strokeWidth={2.2} />
      </motion.button>
      <span className="voice-fab-label" aria-hidden>Talk to Pilot</span>

      <AnimatePresence>
        {open && (
          <motion.div className="voice-scrim" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} role="dialog" aria-modal="true" aria-label="Talk to Pilot">
            <button className="icon-btn" onClick={close} aria-label="Close" style={{ position: 'absolute', top: 22, right: 22, background: 'rgba(255,255,255,0.06)', color: '#fff', borderColor: 'rgba(255,255,255,0.12)' }}><X size={18} /></button>
            <div className="voice-panel">
              <div className="segmented" style={{ background: 'rgba(255,255,255,0.06)', marginBottom: 26 }}>
                {LANGS.map((l) => (
                  <button key={l.id} className={lang === l.id ? 'on' : ''} style={lang === l.id ? { background: '#F5F5F4', color: '#0A0A0B' } : { color: '#A3A3AD' }}
                    onClick={() => { setLang(l.id); if (phase === 'listening') setTimeout(listen, 50) }}>{l.label}</button>
                ))}
              </div>

              <motion.button className="orb" onClick={listen} aria-label={phase === 'listening' ? 'Listening' : 'Tap to speak'}
                style={{ border: 0, cursor: 'pointer', display: 'block' }}
                animate={phase === 'listening' ? { scale: [1, 1.08, 1] } : phase === 'thinking' ? { rotate: 360, scale: 0.92 } : { scale: 1 }}
                transition={phase === 'listening' ? { duration: 1.4, repeat: Infinity, ease: 'easeInOut' } : phase === 'thinking' ? { duration: 2.2, repeat: Infinity, ease: 'linear' } : { duration: 0.4 }}>
                <span style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', color: '#2A1D05' }}>
                  {phase === 'error' ? <MicOff size={40} /> : <Mic size={40} />}
                </span>
              </motion.button>

              <div className="voice-transcript" aria-live="polite">
                {phase === 'listening' && (interim || <span style={{ color: '#6A6A75' }}>Listening…</span>)}
                {phase === 'thinking' && <>“{heard}”</>}
                {phase === 'idle' && <span style={{ color: '#6A6A75' }}>Tap the orb and ask anything</span>}
                {phase === 'error' && <span style={{ color: '#FF8A7E', fontSize: 18 }}>{error}</span>}
              </div>
              {phase === 'listening' && <div className="bars" aria-hidden><i /><i /><i /><i /><i /></div>}
              {phase === 'thinking' && <div className="voice-sub">Checking your accounts, dues and forecast…</div>}
              {(phase === 'idle' || phase === 'listening') && <div className="voice-sub">Speak in English, Hinglish or Hindi. Pilot answers from your real data.</div>}

              {phase !== 'thinking' && (
                <>
                  <div className="voice-chips">{TRY.map((t) => <button key={t} onClick={() => ask(t)}>{t}</button>)}</div>
                  <form className="voice-type" onSubmit={(e) => { e.preventDefault(); ask(typed); setTyped('') }}>
                    <input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="Or type here…" aria-label="Type your question" />
                    <button className="btn btn-primary" style={{ height: 42 }} disabled={!typed.trim()}><Keyboard size={15} /> Ask</button>
                  </form>
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {!open && phase === 'answered' && reply && (
          <motion.div className="voice-caption" initial={{ opacity: 0, y: 30, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 20 }}
            transition={{ type: 'spring', damping: 26, stiffness: 260 }} role="status">
            <span className={`mini-orb ${speaking ? 'speaking' : ''}`} aria-hidden />
            <div style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
              <div style={{ fontSize: 12, color: '#9C9CA6', marginBottom: 4 }}>“{heard}”</div>
              {kind && (
                <div className="row" style={{ gap: 6, marginBottom: 4, fontWeight: 700, color: kind === 'ok' ? '#6EE7B7' : kind === 'tight' ? '#F1D59A' : '#FF8A7E' }}>
                  {kind === 'ok' ? <CheckCircle2 size={16} /> : kind === 'tight' ? <AlertTriangle size={16} /> : <XCircle size={16} />}
                  {kind === 'ok' ? 'Affordable' : kind === 'tight' ? 'Affordable, but tight' : 'Not this month'} · {inr(v.amount)}
                </div>
              )}
              <div style={{ fontSize: 15, lineHeight: 1.45 }}>{reply.meta.speech || reply.answer.split('\n')[0].replace(/\*\*/g, '')}</div>
              <div className="row" style={{ gap: 14, marginTop: 8, fontSize: 12 }}>
                <button className="trace-toggle" style={{ color: '#C9C9CF', margin: 0 }} onClick={() => speak(reply.meta.speech || reply.answer, reply.meta.lang)}><Volume2 size={13} /> Replay</button>
                <button className="trace-toggle" style={{ color: '#C9C9CF', margin: 0 }} onClick={() => openChat?.()}><MessageSquare size={13} /> Full answer</button>
                <button className="trace-toggle" style={{ color: '#C9C9CF', margin: 0 }} onClick={() => { setMuted((m) => !m); window.speechSynthesis?.cancel() }}>
                  {muted ? <VolumeX size={13} /> : <Volume2 size={13} />} {muted ? 'Unmute' : 'Mute'}
                </button>
                <button className="trace-toggle" style={{ color: '#E2BF78', margin: 0 }} onClick={start}><Mic size={13} /> Ask again</button>
              </div>
            </div>
            <button className="icon-btn" style={{ width: 30, height: 30, background: 'transparent', borderColor: 'rgba(255,255,255,0.12)', color: '#C9C9CF' }}
              onClick={() => { setPhase('idle'); window.speechSynthesis?.cancel() }} aria-label="Dismiss"><X size={14} /></button>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
