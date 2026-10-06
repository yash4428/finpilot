// The browser talks only to the Java API (proxied at /api).
const BASE = import.meta.env.VITE_API_BASE || '/api'
let token = null
try { token = localStorage.getItem('fp-token') } catch { /* ignore */ }
let onUnauthorized = () => {}

export function setToken(t) {
  token = t
  try { t ? localStorage.setItem('fp-token', t) : localStorage.removeItem('fp-token') } catch { /* ignore */ }
}
export const getToken = () => token
export function onAuthLost(fn) { onUnauthorized = fn }

async function request(method, path, body, isForm = false) {
  const headers = {}
  if (token) headers.Authorization = `Bearer ${token}`
  if (body && !isForm) headers['Content-Type'] = 'application/json'
  let res
  try {
    res = await fetch(BASE + path, { method, headers, body: isForm ? body : body ? JSON.stringify(body) : undefined })
  } catch {
    throw new Error("Can't reach FinPilot's server. Check that the backend is running.")
  }
  if (res.status === 401 && !path.startsWith('/auth')) {
    onUnauthorized()
    throw new Error('Your session expired. Sign in again.')
  }
  const text = await res.text()
  const data = text ? JSON.parse(text) : null
  if (!res.ok) throw new Error(data?.error || `Request failed (${res.status})`)
  return data
}

export const api = {
  get: (p) => request('GET', p),
  post: (p, b) => request('POST', p, b ?? {}),
  put: (p, b) => request('PUT', p, b),
  del: (p) => request('DELETE', p),
  upload: (p, form) => request('POST', p, form, true),
}
