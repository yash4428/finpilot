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
  // Never hang forever: the agent can take a while, everything else should be quick.
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), path.startsWith('/agent/chat') ? 130000 : 20000)
  let res
  try {
    res = await fetch(BASE + path, { method, headers, signal: ctl.signal, body: isForm ? body : body ? JSON.stringify(body) : undefined })
  } catch {
    throw new Error("Can't reach FinPilot's server. Check that the Java backend is running on port 8080.")
  } finally {
    clearTimeout(timer)
  }
  if (res.status >= 502 && res.status <= 504) {
    throw new Error("Can't reach FinPilot's server. Check that the Java backend is running on port 8080.")
  }
  if (res.status === 401 && !path.startsWith('/auth')) {
    onUnauthorized()
    throw new Error('Your session expired. Sign in again.')
  }
  const text = await res.text()
  let data = null
  try { data = text ? JSON.parse(text) : null } catch {
    throw new Error(res.ok ? 'Unexpected response from the server. Is /api pointing at the Java backend?' : `Server error (${res.status}). Check that the Java backend is running on port 8080.`)
  }
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
