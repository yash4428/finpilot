import { AnimatePresence } from 'framer-motion'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { useAuth } from './auth.jsx'
import Layout from './components/Layout.jsx'
import Budgets from './pages/Budgets.jsx'
import CardsLoans from './pages/CardsLoans.jsx'
import Dues from './pages/Dues.jsx'
import Login from './pages/Login.jsx'
import Overview from './pages/Overview.jsx'
import Pilot from './pages/Pilot.jsx'
import Tax from './pages/Tax.jsx'
import Transactions from './pages/Transactions.jsx'

export default function App() {
  const { user, ready } = useAuth()
  const location = useLocation()
  if (!ready) return null
  if (!user) {
    return (
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    )
  }
  return (
    <Layout>
      <AnimatePresence mode="wait">
        <Routes location={location} key={location.pathname}>
          <Route path="/" element={<Overview />} />
          <Route path="/transactions" element={<Transactions />} />
          <Route path="/cards" element={<CardsLoans />} />
          <Route path="/dues" element={<Dues />} />
          <Route path="/budgets" element={<Budgets />} />
          <Route path="/tax" element={<Tax />} />
          <Route path="/pilot" element={<Pilot />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AnimatePresence>
    </Layout>
  )
}
