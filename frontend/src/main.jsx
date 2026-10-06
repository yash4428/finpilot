import React from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App.jsx'
import { AuthProvider } from './auth.jsx'
import { ToastProvider } from './components/ui.jsx'
import './styles.css'

try {
  const t = localStorage.getItem('fp-theme')
  if (t) document.documentElement.dataset.theme = t
} catch { /* storage unavailable: follow the OS theme */ }

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <ToastProvider>
        <AuthProvider>
          <App />
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  </React.StrictMode>
)
