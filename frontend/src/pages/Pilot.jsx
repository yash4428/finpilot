import { motion } from 'framer-motion'
import Chat from '../components/Chat.jsx'
import { page } from '../components/ui.jsx'

export default function Pilot() {
  return (
    <motion.div className="card" style={{ padding: 0, height: 'calc(100vh - 120px)', minHeight: 480, maxWidth: 880, margin: '0 auto', overflow: 'hidden', paddingTop: 14 }}
      variants={page} initial="initial" animate="animate" exit="exit">
      <Chat />
    </motion.div>
  )
}
