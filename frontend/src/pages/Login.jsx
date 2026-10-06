import { motion } from 'framer-motion'
import { ArrowRight, Loader2 } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../auth.jsx'
import { Mark } from '../components/Logo.jsx'

const DEMO = { email: 'demo@finpilot.app', password: 'demo1234' }

export default function Login() {
  const { login, register } = useAuth()
  const nav = useNavigate()
  const [mode, setMode] = useState('signin')
  const [form, setForm] = useState({ name: '', email: '', password: '', annualIncome: '', openingBalance: '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  async function submit(e, creds) {
    e?.preventDefault()
    setBusy(true); setError('')
    try {
      if (creds || mode === 'signin') await login((creds || form).email, (creds || form).password)
      else await register({
        name: form.name, email: form.email, password: form.password,
        annualIncome: Number(form.annualIncome) || 0, openingBalance: Number(form.openingBalance) || 0,
      })
      nav('/')
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="auth">
      <div className="auth-art">
        <div className="row"><Mark size={32} /><span className="brand-word" style={{ color: 'var(--night-ink)' }}>FinPilot</span></div>
        <h2>Know what's actually yours to spend.</h2>
        <p>Cards, EMIs, budgets and taxes in one place, with a co-pilot that answers from your real numbers and never makes one up.</p>
        <ArtStrip />
        <div className="row" style={{ gap: 22, marginTop: 28, color: 'var(--night-ink-2)', fontSize: 12.5 }}>
          <span>Dues & reminders</span><span>Safe-to-spend forecast</span><span>Tax regime check</span>
        </div>
      </div>

      <div className="auth-form">
        <motion.form onSubmit={submit} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
          <div className="row hide-lg" style={{ marginBottom: 6 }}><Mark size={28} /></div>
          <h1>{mode === 'signin' ? 'Welcome back' : 'Create your account'}</h1>
          <p className="muted" style={{ margin: '-6px 0 6px' }}>
            {mode === 'signin' ? 'Sign in to see where your money stands.' : 'Takes a minute. You can import a bank statement next.'}
          </p>

          <button type="button" className="btn btn-brand" style={{ height: 44 }} disabled={busy} onClick={() => submit(null, DEMO)}>
            Explore the demo account <ArrowRight size={16} />
          </button>
          <div className="divider">or with email</div>

          {mode === 'register' && (
            <div className="field"><label htmlFor="name">Full name</label>
              <input id="name" className="input" required value={form.name} onChange={set('name')} autoComplete="name" /></div>
          )}
          <div className="field"><label htmlFor="email">Email</label>
            <input id="email" className="input" type="email" required value={form.email} onChange={set('email')} autoComplete="email" /></div>
          <div className="field"><label htmlFor="pw">Password</label>
            <input id="pw" className="input" type="password" required minLength={mode === 'register' ? 8 : undefined} value={form.password} onChange={set('password')}
              autoComplete={mode === 'signin' ? 'current-password' : 'new-password'} />
            {mode === 'register' && <span className="hint">At least 8 characters.</span>}
          </div>
          {mode === 'register' && (
            <div className="form-grid">
              <div className="field"><label htmlFor="inc">Annual income</label>
                <div className="input-prefix"><span>₹</span><input id="inc" className="input" inputMode="numeric" value={form.annualIncome} onChange={set('annualIncome')} placeholder="12,00,000" /></div></div>
              <div className="field"><label htmlFor="bal">Bank balance today</label>
                <div className="input-prefix"><span>₹</span><input id="bal" className="input" inputMode="numeric" value={form.openingBalance} onChange={set('openingBalance')} placeholder="50,000" /></div></div>
            </div>
          )}
          {error && <div className="error-text" role="alert">{error}</div>}
          <button className="btn btn-primary" style={{ height: 44 }} disabled={busy}>
            {busy ? <Loader2 size={16} className="spin" /> : mode === 'signin' ? 'Sign in' : 'Create account'}
          </button>
          <div className="muted" style={{ textAlign: 'center', fontSize: 13 }}>
            {mode === 'signin' ? 'New to FinPilot?' : 'Already have an account?'}{' '}
            <button type="button" className="link-btn" onClick={() => { setMode(mode === 'signin' ? 'register' : 'signin'); setError('') }}>
              {mode === 'signin' ? 'Create an account' : 'Sign in'}
            </button>
          </div>
        </motion.form>
      </div>
    </div>
  )
}

function ArtStrip() {
  const segs = [
    { w: 28, c: 'repeating-linear-gradient(135deg,#2B5257 0 6px,#27494E 6px 12px)', t: 'Card bills' },
    { w: 13, c: 'repeating-linear-gradient(135deg,#2B5257 0 6px,#27494E 6px 12px)', t: 'EMIs' },
    { w: 6, c: '#2F6166', t: '' },
    { w: 20, c: '#3A7176', t: 'Usual spending' },
  ]
  return (
    <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid var(--night-line)', borderRadius: 18, padding: 18 }}>
      <div className="row between" style={{ fontSize: 12, color: 'var(--night-ink-2)' }}><span>Balance ₹1,48,520</span><span>Month end</span></div>
      <div style={{ display: 'flex', height: 40, borderRadius: 10, overflow: 'hidden', marginTop: 8, background: 'rgba(255,255,255,0.04)' }}>
        {segs.map((s, i) => (
          <motion.div key={i} initial={{ width: 0 }} animate={{ width: `${s.w}%` }} transition={{ delay: 0.3 + i * 0.15, duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
            style={{ background: s.c, borderRight: '2px solid var(--night)', fontSize: 10.5, color: 'rgba(255,255,255,.8)', display: 'flex', alignItems: 'flex-end', padding: '0 0 5px 7px', whiteSpace: 'nowrap', overflow: 'hidden' }}>{s.t}</motion.div>
        ))}
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.1 }}
          style={{ flex: 1, background: 'linear-gradient(90deg,#E8962C,#F2A33A)', color: '#2A1A04', fontWeight: 600, fontSize: 11, display: 'flex', alignItems: 'flex-end', padding: '0 0 5px 8px' }}>Yours</motion.div>
      </div>
    </div>
  )
}
