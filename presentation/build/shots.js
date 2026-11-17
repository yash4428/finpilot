// Captures high-resolution screenshots of the running FinPilot app for the deck.
// Usage: node shots.js [only-name ...]
const puppeteer = require('puppeteer-core')
const fs = require('fs')
const path = require('path')

const BASE = process.env.APP_URL || 'http://localhost:5175'
const API = 'http://localhost:8080'
const OUT = path.join(__dirname, 'shots')
fs.mkdirSync(OUT, { recursive: true })
const only = new Set(process.argv.slice(2))
const want = (n) => only.size === 0 || only.has(n)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function token() {
  const r = await fetch(API + '/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'demo@finpilot.app', password: 'demo1234' }) })
  return (await r.json()).token
}

// Voice input can't use a real microphone in headless Chrome, so the recogniser is
// replaced with one that "hears" a fixed sentence. Everything after that is the real app.
function fakeSpeech(text, finish) {
  return `(() => {
    class FakeRec {
      start() {
        setTimeout(() => this.onresult && this.onresult({ resultIndex: 0, results: [Object.assign([{ transcript: ${JSON.stringify(text)} }], { isFinal: ${finish} })] }), 400)
        ${finish ? 'setTimeout(() => this.onend && this.onend(), 700)' : ''}
      }
      abort() {} stop() {}
    }
    window.SpeechRecognition = FakeRec; window.webkitSpeechRecognition = FakeRec
    window.speechSynthesis && (window.speechSynthesis.speak = () => {})
  })()`
}

;(async () => {
  const browser = await puppeteer.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: 'new', args: ['--no-sandbox', '--hide-scrollbars'],
  })
  const tok = await token()

  async function open(url, { width = 1440, height = 900, auth = true, theme = 'dark', speech = null } = {}) {
    const page = await browser.newPage()
    await page.setViewport({ width, height, deviceScaleFactor: 2 })
    await page.evaluateOnNewDocument((t, th, a) => {
      localStorage.setItem('fp-theme', th)
      if (a) localStorage.setItem('fp-token', t); else localStorage.removeItem('fp-token')
    }, tok, theme, auth)
    if (speech) await page.evaluateOnNewDocument(speech)
    await page.goto(BASE + url, { waitUntil: 'networkidle0' })
    await sleep(2600) // let entrance animations finish
    return page
  }
  async function shot(page, name, el) {
    const file = path.join(OUT, name + '.png')
    if (el) await (await page.$(el)).screenshot({ path: file })
    else await page.screenshot({ path: file })
    console.log('saved', name)
  }

  if (want('login')) { const p = await open('/login', { auth: false }); await shot(p, 'login'); await p.close() }

  if (want('overview')) { const p = await open('/'); await shot(p, 'overview'); await p.close() }

  if (want('runway')) {
    const p = await open('/')
    await p.type('#afford-amt', '90000')
    await sleep(1500)
    await shot(p, 'runway', '[data-pilot="runway"]')
    await p.close()
  }

  if (want('health')) { const p = await open('/'); await shot(p, 'health', '[data-pilot="health"]'); await p.close() }

  if (want('insights')) {
    const p = await open('/', { height: 1100 })
    await p.evaluate(() => document.querySelector('[data-pilot="heatmap"]').scrollIntoView({ block: 'start' }))
    await sleep(1800)
    await shot(p, 'autopay', '[data-pilot="subs"]')
    await shot(p, 'heatmap', '[data-pilot="heatmap"]')
    await p.close()
  }

  if (want('transactions')) { const p = await open('/transactions?flagged=1'); await shot(p, 'transactions'); await p.close() }
  if (want('dues')) { const p = await open('/dues'); await shot(p, 'dues'); await p.close() }
  if (want('goals')) { const p = await open('/goals'); await shot(p, 'goals'); await p.close() }
  if (want('tax')) { const p = await open('/tax'); await shot(p, 'tax'); await p.close() }

  if (want('chat')) {
    const p = await open('/pilot', { height: 1000 })
    await p.type('textarea', 'Can I afford a ₹1,00,000 laptop this month?')
    await p.keyboard.press('Enter')
    await p.waitForSelector('.verdict-card', { timeout: 120000 })
    await sleep(1500)
    const btns = await p.$$('.trace-toggle')
    for (const b of btns) { const t = await b.evaluate((n) => n.textContent); if (t.includes('How Pilot')) { await b.click(); break } }
    await sleep(1200)
    await p.evaluate(() => { const s = document.querySelector('.chat-scroll'); s.scrollTop = 0 })
    await sleep(400)
    await shot(p, 'chat')
    await p.close()
  }

  if (want('voice')) {
    const p = await open('/', { speech: fakeSpeech('Kya main dedh lakh ki bike le sakta hoon?', false) })
    await p.click('.voice-fab')
    await sleep(1600)
    await shot(p, 'voice-listening')
    await p.close()
  }

  if (want('react')) {
    const p = await open('/', { speech: fakeSpeech('Kya main dedh lakh ki bike le sakta hoon?', true) })
    await p.click('.voice-fab')
    await p.waitForSelector('.voice-caption', { timeout: 120000 })
    await sleep(2500)
    await p.evaluate(() => window.scrollTo(0, 0))
    await sleep(800)
    await shot(p, 'voice-react')
    await p.close()
  }

  if (want('mobile')) {
    const p = await open('/', { width: 390, height: 844 })
    await shot(p, 'mobile')
    await p.close()
  }

  await browser.close()
})().catch((e) => { console.error(e); process.exit(1) })
