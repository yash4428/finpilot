import { motion } from 'framer-motion'
import { AlertTriangle, ArrowDownRight, ArrowRight, ArrowUpRight, Repeat, ShieldCheck, Target } from 'lucide-react'
import { Link } from 'react-router-dom'
import { CategoryDonut, ScoreGauge, SpendChart } from '../components/Charts.jsx'
import { useShell } from '../components/Layout.jsx'
import Runway from '../components/Runway.jsx'
import { CategoryPill, ErrorNote, MerchantBadge, Money, Skeleton, page, rise, useApi } from '../components/ui.jsx'
import { daysUntil, fmtDate, inr, relDays, toDate } from '../format.js'

export default function Overview() {
  const { bump } = useShell()
  const { data: d, error, loading, reload } = useApi('/dashboard', [bump])

  if (error) return <ErrorNote message={error} onRetry={reload} />
  if (loading || !d) return <OverviewSkeleton />

  const delta = Number(d.spend.changePct)
  return (
    <motion.div className="grid" variants={page} initial="initial" animate="animate" exit="exit">
      <motion.div className="c-8" variants={rise}><Runway sts={d.safeToSpend} /></motion.div>

      <motion.div className="c-4 stack" variants={rise}>
        <div className="card">
          <div className="card-head">
            <span className="card-title">Credit health</span>
            <span className="pill" title="Estimated from your cards and payments. Not a bureau score.">Simulated</span>
          </div>
          <ScoreGauge score={d.creditScore.score} band={d.creditScore.band} />
          <div className="row between" style={{ marginTop: 10, fontSize: 13 }}>
            <span className="muted">Card utilisation</span>
            <b className="num" style={{ color: d.creditScore.utilization >= 30 ? 'var(--amber)' : 'var(--mint)' }}>{d.creditScore.utilization}%</b>
          </div>
          <div className="progress" style={{ marginTop: 6 }}>
            <i style={{ width: `${Math.min(100, d.creditScore.utilization)}%`, background: d.creditScore.utilization >= 30 ? 'var(--amber)' : 'var(--mint)' }} />
          </div>
          <p className="muted" style={{ fontSize: 12.5, margin: '10px 0 0' }}>{d.creditScore.tips[0]}</p>
        </div>
        <div className="card">
          <div className="stat-label">Net position</div>
          <div className="stat-value"><Money value={d.totals.netWorth} /></div>
          <div className="list" style={{ marginTop: 10, fontSize: 13 }}>
            <Line label="Cash in accounts" value={d.totals.liquid} />
            <Line label="Goal savings" value={d.totals.goalSavings} />
            <Line label="Card balances" value={-d.totals.cardOutstanding} />
            <Line label="Loans remaining" value={-d.totals.loanOutstanding} />
          </div>
        </div>
      </motion.div>

      <motion.div className="card c-8" variants={rise}>
        <div className="card-head" style={{ alignItems: 'flex-start' }}>
          <div>
            <div className="stat-label">Spent this month</div>
            <div className="row" style={{ gap: 12, alignItems: 'baseline' }}>
              <div className="stat-value"><Money value={d.spend.thisMonth} /></div>
              <span className={`delta ${delta > 0 ? 'danger' : 'pos'}`}>
                {delta > 0 ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
                {Math.abs(delta)}% vs same point last month
              </span>
            </div>
          </div>
          <span className="spacer" />
          <div className="row hide-sm" style={{ gap: 14, fontSize: 12, color: 'var(--ink-2)' }}>
            <span className="row" style={{ gap: 6 }}><i style={{ width: 14, height: 2.5, background: 'var(--brand)', borderRadius: 2 }} />This month</span>
            <span className="row" style={{ gap: 6 }}><i style={{ width: 14, height: 0, borderTop: '2px dashed var(--ink-3)' }} />Last month</span>
          </div>
        </div>
        <SpendChart data={d.dailySpend} today={d.today} />
      </motion.div>

      <motion.div className="card c-4" variants={rise}>
        <div className="card-head"><span className="card-title">Where it went</span><span className="spacer" />
          <Link className="link-btn" to="/transactions">Details <ArrowRight size={13} /></Link></div>
        {d.categorySpend.length ? <CategoryDonut data={d.categorySpend} /> : <p className="muted">No spending yet this month.</p>}
      </motion.div>

      <motion.div className="card c-5" variants={rise}>
        <div className="card-head"><span className="card-title">Coming up</span><span className="spacer" />
          <Link className="link-btn" to="/dues">All dues <ArrowRight size={13} /></Link></div>
        <div className="list">
          {d.upcomingDues.slice(0, 4).map((x) => {
            const n = daysUntil(x.dueDate)
            return (
              <div className="list-row" key={x.id}>
                <div className={`date-tile ${x.status === 'overdue' ? 'hot' : x.status === 'due_soon' ? 'soon' : ''}`}>
                  <b>{toDate(x.dueDate).getDate()}</b><span>{fmtDate(x.dueDate, { month: 'short' })}</span>
                </div>
                <div className="grow">
                  <div className="title">{x.label}</div>
                  <div className="meta">{x.sourceType === 'card' ? 'Card bill' : 'EMI'} · {n < 0 ? 'overdue' : relDays(x.dueDate)}</div>
                </div>
                <b className="num">{inr(x.amount)}</b>
              </div>
            )
          })}
          {!d.upcomingDues.length && <p className="muted">Nothing due in the next 30 days.</p>}
        </div>
      </motion.div>

      <motion.div className="card c-4" variants={rise}>
        <div className="card-head"><span className="card-title">Budgets</span><span className="spacer" />
          <Link className="link-btn" to="/budgets">Manage <ArrowRight size={13} /></Link></div>
        <div className="stack" style={{ gap: 14 }}>
          {d.budgets.slice().sort((a, b) => b.percent - a.percent).slice(0, 4).map((b) => <BudgetBar key={b.id} b={b} />)}
        </div>
      </motion.div>

      <motion.div className="card c-3" variants={rise}>
        <div className="card-head"><AlertTriangle size={16} style={{ color: 'var(--chilli)' }} /><span className="card-title">Unusual activity</span></div>
        {d.anomalies.length === 0 && <div className="row muted" style={{ fontSize: 13 }}><ShieldCheck size={16} className="pos" /> Nothing unusual spotted.</div>}
        <div className="list">
          {d.anomalies.slice(0, 3).map((t) => (
            <Link to="/transactions?flagged=1" className="list-row" key={t.id} style={{ alignItems: 'flex-start' }}>
              <div className="grow">
                <div className="row between"><span className="title" style={{ fontSize: 13 }}>{t.merchant}</span><b className="num" style={{ fontSize: 13 }}>{inr(Math.abs(t.amount))}</b></div>
                <div className="meta" style={{ whiteSpace: 'normal' }}>{t.anomalyReason}</div>
              </div>
            </Link>
          ))}
        </div>
      </motion.div>

      <motion.div className="card c-8" variants={rise}>
        <div className="card-head"><span className="card-title">Recent transactions</span><span className="spacer" />
          <Link className="link-btn" to="/transactions">See all <ArrowRight size={13} /></Link></div>
        <div className="list">
          {d.recent.map((t) => (
            <div className="list-row" key={t.id}>
              <MerchantBadge name={t.merchant} category={t.category} />
              <div className="grow">
                <div className="title">{t.merchant}</div>
                <div className="meta row" style={{ gap: 6 }}>{fmtDate(t.date)} {t.isRecurring && <><Repeat size={11} /> recurring</>}</div>
              </div>
              <span className="hide-sm"><CategoryPill name={t.category} /></span>
              <b className={`num ${t.amount > 0 ? 'pos' : ''}`} style={{ minWidth: 90, textAlign: 'right' }}>{inr(t.amount, { sign: true })}</b>
            </div>
          ))}
        </div>
      </motion.div>

      <motion.div className="card c-4" variants={rise}>
        <div className="card-head"><Target size={16} style={{ color: 'var(--brand)' }} /><span className="card-title">Goals</span></div>
        <div className="stack" style={{ gap: 16 }}>
          {d.goals.map((g) => {
            const pct = Math.min(100, (g.savedAmount / g.targetAmount) * 100)
            return (
              <div key={g.id}>
                <div className="row between" style={{ fontSize: 13 }}><b style={{ fontWeight: 500 }}>{g.name}</b><span className="faint">{g.deadline ? 'by ' + fmtDate(g.deadline, { month: 'short', year: 'numeric' }) : ''}</span></div>
                <div className="progress" style={{ margin: '7px 0 5px' }}><i style={{ width: `${pct}%`, background: 'var(--saffron)' }} /></div>
                <div className="row between" style={{ fontSize: 12 }}><span className="num">{inr(g.savedAmount)}</span><span className="faint num">of {inr(g.targetAmount)}</span></div>
              </div>
            )
          })}
        </div>
      </motion.div>
    </motion.div>
  )
}

function Line({ label, value }) {
  return (
    <div className="row between" style={{ padding: '4px 0' }}>
      <span className="muted">{label}</span><span className="num" style={{ color: value < 0 ? 'var(--ink-2)' : 'var(--ink)' }}>{inr(value)}</span>
    </div>
  )
}

export function BudgetBar({ b, big }) {
  const pct = Number(b.percent)
  const color = pct >= 100 ? 'var(--chilli)' : pct >= 80 ? 'var(--amber)' : 'var(--brand)'
  const today = new Date()
  const pace = (today.getDate() / new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate()) * 100
  return (
    <div>
      <div className="row between" style={{ fontSize: big ? 14 : 13 }}>
        <b style={{ fontWeight: 500 }}>{b.category}</b>
        <span className="num"><b style={{ fontWeight: 600 }}>{inr(b.consumed)}</b> <span className="faint">/ {inr(b.limit)}</span></span>
      </div>
      <div className="progress" style={{ marginTop: 7, height: big ? 10 : 8, overflow: 'visible' }}>
        <i style={{ width: `${Math.min(100, pct)}%`, background: color }} />
        <span title="Where you'd be at an even pace" style={{ position: 'absolute', left: `${pace}%`, top: -3, bottom: -3, width: 2, background: 'var(--ink)', opacity: 0.35, borderRadius: 2 }} />
      </div>
    </div>
  )
}

function OverviewSkeleton() {
  return (
    <div className="grid">
      <div className="c-8"><Skeleton h={330} style={{ borderRadius: 24 }} /></div>
      <div className="c-4 stack"><Skeleton h={200} style={{ borderRadius: 20 }} /><Skeleton h={114} style={{ borderRadius: 20 }} /></div>
      <div className="c-8"><Skeleton h={300} style={{ borderRadius: 20 }} /></div>
      <div className="c-4"><Skeleton h={300} style={{ borderRadius: 20 }} /></div>
    </div>
  )
}
