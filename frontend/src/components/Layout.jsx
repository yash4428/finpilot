import { AnimatePresence, motion } from 'framer-motion'
import {
  Bell, CalendarClock, CreditCard, LayoutGrid, LogOut, Moon, PiggyBank, Receipt, Sparkles, Sun, Landmark,
  AlertTriangle, BellRing, Info, Wallet,
} from 'lucide-react'
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { api } from '../api.js'
import { useAuth } from '../auth.jsx'
import { relDays } from '../format.js'
import Chat from './Chat.jsx'
import { Mark } from './Logo.jsx'
import { Drawer } from './ui.jsx'

const NAV = [
  { to: '/', label: 'Overview', icon: LayoutGrid },
  { to: '/transactions', label: 'Transactions', icon: Receipt },
  { to: '/cards', label: 'Cards & loans', icon: CreditCard },
  { to: '/dues', label: 'Dues', icon: CalendarClock },
  { to: '/budgets', label: 'Budgets', icon: PiggyBank },
  { to: '/tax', label: 'Tax', icon: Landmark },
]
const TITLES = {
  '/': null, '/transactions': 'Transactions', '/cards': 'Cards & loans', '/dues': 'Dues',
  '/budgets': 'Budgets', '/tax': 'Tax', '/pilot': 'Ask Pilot',
}

const ShellCtx = createContext({ openPilot: () => {}, bump: 0, refreshShell: () => {} })
export const useShell = () => useContext(ShellCtx)

export default function Layout({ children }) {
  const { user, logout } = useAuth()
  const loc = useLocation()
  const [pilotOpen, setPilotOpen] = useState(false)
  const [pilotSeed, setPilotSeed] = useState(null)
  const [scrolled, setScrolled] = useState(false)
  const [bump, setBump] = useState(0)
  const [theme, setTheme] = useState(() => document.documentElement.dataset.theme ||
    (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'))

  const openPilot = useCallback((q) => { setPilotSeed(q || null); setPilotOpen(true) }, [])
  const refreshShell = useCallback(() => setBump((b) => b + 1), [])

  useEffect(() => {
    const s = () => setScrolled(window.scrollY > 4)
    window.addEventListener('scroll', s)
    const k = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setPilotOpen((o) => !o) }
    }
    window.addEventListener('keydown', k)
    return () => { window.removeEventListener('scroll', s); window.removeEventListener('keydown', k) }
  }, [])

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark'
    setTheme(next)
    document.documentElement.dataset.theme = next
    try { localStorage.setItem('fp-theme', next) } catch { /* ignore */ }
  }

  const first = user?.name?.split(' ')[0] || ''
  const title = TITLES[loc.pathname]
  const today = new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })

  return (
    <ShellCtx.Provider value={{ openPilot, bump, refreshShell }}>
      <div className="shell">
        <aside className="sidebar">
          <div className="brand"><Mark /><span className="brand-word">FinPilot</span></div>
          {NAV.map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} end={to === '/'} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
              <Icon size={18} strokeWidth={1.9} /> {label}
            </NavLink>
          ))}
          <div className="nav-label">Assistant</div>
          <NavLink to="/pilot" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
            <Sparkles size={18} strokeWidth={1.9} /> Ask Pilot <span className="kbd" style={{ marginLeft: 'auto' }}>⌘K</span>
          </NavLink>
          <div className="sidebar-foot">
            <button className="nav-item" style={{ border: 0, background: 'none', cursor: 'pointer', width: '100%' }} onClick={toggleTheme}>
              {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />} {theme === 'dark' ? 'Light mode' : 'Dark mode'}
            </button>
            <div className="user-chip">
              <span className="avatar">{initials(user?.name)}</span>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: 13 }}>{user?.name}</div>
                <div className="faint" style={{ fontSize: 11.5, overflow: 'hidden', textOverflow: 'ellipsis' }}>{user?.email}</div>
              </div>
              <button className="icon-btn" style={{ width: 30, height: 30, border: 0 }} onClick={logout} aria-label="Sign out" title="Sign out">
                <LogOut size={15} />
              </button>
            </div>
          </div>
        </aside>

        <div className="main">
          <header className={`topbar ${scrolled ? 'scrolled' : ''}`}>
            <div>
              <h1>{title || `Hi ${first}`}</h1>
              <div className="sub">{title ? today : `${today} · here's where your money stands`}</div>
            </div>
            <div className="topbar-actions">
              {loc.pathname !== '/pilot' && (
                <button className="btn btn-sm hide-sm" onClick={() => openPilot()}>
                  <Sparkles size={15} /> Ask Pilot <span className="kbd">⌘K</span>
                </button>
              )}
              <Notifications bump={bump} />
            </div>
          </header>
          <main className="content">{children}</main>
        </div>
      </div>

      <nav className="tabbar" aria-label="Primary">
        {[...NAV.slice(0, 4), { to: '/pilot', label: 'Pilot', icon: Sparkles }].map(({ to, label, icon: Icon }) => (
          <NavLink key={to} to={to} end={to === '/'} className={({ isActive }) => (isActive ? 'active' : '')}>
            <Icon size={20} /> {label.split(' ')[0]}
          </NavLink>
        ))}
      </nav>

      <Drawer open={pilotOpen} onClose={() => setPilotOpen(false)} label="Ask Pilot">
        <Chat compact seed={pilotSeed} onClose={() => setPilotOpen(false)} onSeedUsed={() => setPilotSeed(null)} />
      </Drawer>
    </ShellCtx.Provider>
  )
}

function initials(name = '') {
  return name.split(' ').filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase()
}

const KIND_ICON = { due: CalendarClock, budget: Wallet, anomaly: AlertTriangle, info: Info }
const KIND_COLOR = { due: 'var(--amber)', budget: 'var(--brand)', anomaly: 'var(--chilli)', info: 'var(--ink-3)' }

function Notifications({ bump }) {
  const [open, setOpen] = useState(false)
  const [data, setData] = useState({ items: [], unread: 0 })
  const ref = useRef(null)

  const load = useCallback(() => api.get('/notifications').then(setData).catch(() => {}), [])
  useEffect(() => { load() }, [load, bump])
  useEffect(() => {
    const h = (e) => ref.current && !ref.current.contains(e.target) && setOpen(false)
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  const toggle = async () => {
    const next = !open
    setOpen(next)
    if (next && data.unread > 0) {
      await api.post('/notifications/read-all').catch(() => {})
      setTimeout(() => setData((d) => ({ ...d, unread: 0, items: d.items.map((n) => ({ ...n, read: true })) })), 1200)
    }
  }

  return (
    <div style={{ position: 'relative' }} ref={ref}>
      <button className="icon-btn" onClick={toggle} aria-label={`Notifications${data.unread ? `, ${data.unread} unread` : ''}`}>
        {data.unread ? <BellRing size={17} /> : <Bell size={17} />}
        {data.unread > 0 && <span className="dot-badge" />}
      </button>
      <AnimatePresence>
        {open && (
          <motion.div className="popover" initial={{ opacity: 0, y: -6, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.18 }}>
            <div className="row between" style={{ padding: '14px 16px 8px' }}>
              <b>Alerts</b><span className="faint" style={{ fontSize: 12 }}>Reminders run daily at 8 AM</span>
            </div>
            {data.items.length === 0 && <div className="empty" style={{ padding: 24 }}>You're all caught up.</div>}
            {data.items.map((n) => {
              const Icon = KIND_ICON[n.kind] || Info
              return (
                <div key={n.id} className="row" style={{ alignItems: 'flex-start', padding: '10px 16px', borderTop: '1px solid var(--line)', background: n.read ? 'transparent' : 'var(--surface-2)' }}>
                  <Icon size={16} style={{ color: KIND_COLOR[n.kind], marginTop: 3, flex: 'none' }} />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 500, fontSize: 13 }}>{n.title}</div>
                    <div className="muted" style={{ fontSize: 12.5 }}>{n.body}</div>
                    <div className="faint" style={{ fontSize: 11, marginTop: 2 }}>{relDays(n.createdAt.slice(0, 10))}</div>
                  </div>
                </div>
              )
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
