import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// The browser only ever talks to the Java API, via /api.
const proxy = {
  '/api': {
    target: process.env.VITE_API_TARGET || 'http://localhost:8080',
    changeOrigin: true,
    rewrite: (p) => p.replace(/^\/api/, ''),
  },
}

export default defineConfig({
  plugins: [react()],
  server: { port: 5173, proxy },
  preview: { port: 4173, proxy },
})
