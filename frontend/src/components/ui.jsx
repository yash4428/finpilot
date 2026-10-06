import { AnimatePresence, animate, motion, useMotionValue, useTransform } from 'framer-motion'
import { CheckCircle2, AlertCircle, X } from 'lucide-react'
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { api } from '../api.js'
import { catColor, inr, num } from '../format.js'

/* ---------- Data loading ---------- */
export function useApi(path, deps = []) {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)
  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true)
    try { setData(await api.get(path)); setError(null) } catch (e) { setError(e.message) } finally { setLoading(false) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, ...deps])
  useEffect(() => { load() }, [load])
  return { data, error, loading, reload: () => load(true), setData }
}

/* ---------- Toasts ---------- */
const ToastCtx = createContext(() => {})
export function ToastProvider({ children }) {
  const [items, setItems] = useState([])
  const push = useCallback((text, kind = 'ok') => {
    const id = Math.random()
    setItems((x) => [...x, { id, text, kind }])
    setTimeout(() => setItems((x) => x.filter((t) => t.id !== id)), 3200)
  }, [])
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        <AnimatePresence>
          {items.map((t) => (
            <motion.div key={t.id} className={`toast ${t.kind === 'error' ? 'error' : ''}`}
              initial={{ opacity: 0, y: 16, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 8 }}>
              {t.kind === 'error' ? <AlertCircle size={16} /> : <CheckCircle2 size={16} />} {t.text}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastCtx.Provider>
  )
}
export const useToast = () => useContext(ToastCtx)

/* ---------- Overlays ---------- */
function useEscape(open, onClose) {
  useEffect(() => {
    if (!open) return
    const h = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [open, onClose])
}

export function Modal({ open, onClose, title, children, footer, width }) {
  useEscape(open, onClose)
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div className="scrim" onClick={onClose} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} />
          <motion.div className="modal" role="dialog" aria-modal="true" aria-label={title} style={width ? { width } : undefined}
            initial={{ opacity: 0, x: '-50%', y: '-46%', scale: 0.97 }} animate={{ opacity: 1, x: '-50%', y: '-50%', scale: 1 }}
            exit={{ opacity: 0, x: '-50%', y: '-48%', scale: 0.98 }} transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}>
            <div className="modal-head">
              <h3>{title}</h3>
              <button className="icon-btn" style={{ marginLeft: 'auto', width: 32, height: 32 }} onClick={onClose} aria-label="Close"><X size={16} /></button>
            </div>
            <div className="modal-body">{children}</div>
            {footer && <div className="modal-foot">{footer}</div>}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}

export function Drawer({ open, onClose, children, label }) {
  useEscape(open, onClose)
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div className="scrim" onClick={onClose} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} />
          <motion.aside className="drawer" role="dialog" aria-modal="true" aria-label={label}
            initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }} transition={{ type: 'spring', damping: 32, stiffness: 320 }}>
            {children}
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  )
}

/* ---------- Money that counts up ---------- */
export function Money({ value, className, sign, duration = 1.1, rupeeClass }) {
  const mv = useMotionValue(0)
  const text = useTransform(mv, (v) => num(Math.round(Math.abs(v))))
  const first = useRef(true)
  useEffect(() => {
    const ctl = animate(mv, Number(value || 0), { duration: first.current ? duration : 0.5, ease: [0.22, 1, 0.36, 1] })
    first.current = false
    return () => ctl.stop()
  }, [value, mv, duration])
  const neg = Number(value) < 0
  return (
    <span className={`num ${className || ''}`} aria-label={inr(value)}>
      {neg ? '−' : sign && value > 0 ? '+' : ''}
      <span className={rupeeClass}>₹</span>
      <motion.span>{text}</motion.span>
    </span>
  )
}

/* ---------- Category + merchant ---------- */
export function CategoryPill({ name }) {
  const c = catColor(name)
  return <span className="pill" style={{ background: `color-mix(in srgb, ${c} 13%, transparent)`, color: `color-mix(in srgb, ${c} 80%, var(--ink))` }}>{name}</span>
}

export function MerchantBadge({ name, category }) {
  const c = catColor(category)
  const letters = (name || '?').replace(/[^A-Za-z0-9 ]/g, '').split(' ').filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase()
  return (
    <span className="merchant-badge" style={{ background: `color-mix(in srgb, ${c} 14%, var(--surface))`, color: `color-mix(in srgb, ${c} 85%, var(--ink))` }} aria-hidden>
      {letters || '₹'}
    </span>
  )
}

export function Skeleton({ h = 16, w = '100%', style }) {
  return <div className="skeleton" style={{ height: h, width: w, ...style }} />
}

export function Empty({ icon: Icon, title, children }) {
  return (
    <div className="empty">
      {Icon && <Icon size={28} />}
      <div style={{ fontWeight: 600, color: 'var(--ink)' }}>{title}</div>
      {children && <div style={{ marginTop: 4, fontSize: 13 }}>{children}</div>}
    </div>
  )
}

export function ErrorNote({ message, onRetry }) {
  return (
    <div className="card row" style={{ borderColor: 'color-mix(in srgb, var(--chilli) 35%, var(--line))' }}>
      <AlertCircle size={18} className="danger" />
      <span>{message}</span>
      {onRetry && <button className="btn btn-sm" style={{ marginLeft: 'auto' }} onClick={onRetry}>Try again</button>}
    </div>
  )
}

/* Staggered page entrance used by every page. */
export const page = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.35, ease: [0.22, 1, 0.36, 1], staggerChildren: 0.05 } },
  exit: { opacity: 0, transition: { duration: 0.12 } },
}
export const rise = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.45, ease: [0.22, 1, 0.36, 1] } },
}
