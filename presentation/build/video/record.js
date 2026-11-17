// Records each scene of the FinPilot walkthrough from the live app, paced to its narration clip.
// Output: video/clips/<scene>.webm. Assembly with the audio happens in assemble.py.
const puppeteer = require('puppeteer-core')
const fs = require('fs')
const path = require('path')

const BASE = process.env.APP_URL || 'http://localhost:5175'
const DIR = __dirname
const DUR = JSON.parse(fs.readFileSync(path.join(DIR, 'audio/durations.json'), 'utf8'))
fs.mkdirSync(path.join(DIR, 'clips'), { recursive: true })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// A visible cursor (headless Chrome draws none) plus a soft click ripple.
const CURSOR = `(() => {
  const add = () => {
    if (document.getElementById('__cur')) return
    const c = document.createElement('div'); c.id = '__cur'
    c.innerHTML = '<svg width="26" height="26" viewBox="0 0 24 24"><path d="M4 2l15 9-7 1.6L8.6 20z" fill="#fff" stroke="#111" stroke-width="1.4" stroke-linejoin="round"/></svg>'
    Object.assign(c.style, { position: 'fixed', left: '0', top: '0', zIndex: 2147483647, pointerEvents: 'none', transform: 'translate(720px,450px)', filter: 'drop-shadow(0 2px 3px rgba(0,0,0,.5))' })
    document.documentElement.appendChild(c)
    document.addEventListener('mousemove', (e) => { c.style.transform = 'translate(' + (e.clientX - 3) + 'px,' + (e.clientY - 2) + 'px)' }, true)
    document.addEventListener('mousedown', (e) => {
      const r = document.createElement('div')
      Object.assign(r.style, { position: 'fixed', left: (e.clientX - 18) + 'px', top: (e.clientY - 18) + 'px', width: '36px', height: '36px', borderRadius: '50%',
        border: '2px solid rgba(241,213,154,.95)', zIndex: 2147483646, pointerEvents: 'none', transition: 'transform .45s ease-out, opacity .45s ease-out' })
      document.documentElement.appendChild(r)
      requestAnimationFrame(() => { r.style.transform = 'scale(1.8)'; r.style.opacity = '0' })
      setTimeout(() => r.remove(), 500)
    }, true)
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', add); else add()
})()`

// Headless Chrome has no microphone: this recogniser "hears" the sentence word by word once the
// recorder sets window.__voiceGo, timed to the voice-over. Everything after it is the real app.
const FAKE_SPEECH = `(() => {
  const TEXT = 'Kya main dedh lakh ki bike le sakta hoon?'
  class FakeRec {
    start() {
      const words = TEXT.split(' ')
      const wait = setInterval(() => {
        if (!window.__voiceGo) return
        clearInterval(wait)
        const step = (window.__voiceMs || 2000) / words.length
        words.forEach((_, i) => setTimeout(() => {
          const t = words.slice(0, i + 1).join(' ')
          const last = i === words.length - 1
          this.onresult && this.onresult({ resultIndex: 0, results: [Object.assign([{ transcript: t }], { isFinal: last })] })
          if (last) setTimeout(() => this.onend && this.onend(), 150)
        }, step * (i + 1)))
      }, 40)
    }
    abort() {} stop() {}
  }
  window.SpeechRecognition = FakeRec; window.webkitSpeechRecognition = FakeRec
  if (window.speechSynthesis) window.speechSynthesis.speak = () => {}
})()`

;(async () => {
  const tok = await (await fetch('http://localhost:8080/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'demo@finpilot.app', password: 'demo1234' }) })).json()

  const browser = await puppeteer.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: 'new', args: ['--hide-scrollbars', '--window-size=1440,900'],
  })
  const page = await browser.newPage()
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 })
  await page.evaluateOnNewDocument(() => { localStorage.removeItem('fp-token'); localStorage.setItem('fp-theme', 'dark') })
  await page.evaluateOnNewDocument(CURSOR)
  await page.evaluateOnNewDocument(FAKE_SPEECH)
  void tok

  let mx = 720, my = 450
  const move = async (x, y, steps = 28) => { await page.mouse.move(x, y, { steps }); mx = x; my = y }
  const center = async (sel) => {
    const el = typeof sel === 'string' ? await page.waitForSelector(sel, { timeout: 15000 }) : sel
    const b = await el.boundingBox()
    return [b.x + b.width / 2, b.y + b.height / 2]
  }
  const moveTo = async (sel, steps) => { const [x, y] = await center(sel); await move(x, y, steps) }
  const clickSel = async (sel) => { await moveTo(sel); await sleep(120); await page.mouse.click(mx, my) }
  const byText = async (selector, text) => {
    const h = await page.evaluateHandle((s, t) => [...document.querySelectorAll(s)].find((e) => e.textContent.trim().includes(t)), selector, text)
    return h.asElement()
  }
  const clickText = async (selector, text) => { const el = await byText(selector, text); await moveTo(el); await sleep(120); await page.mouse.click(mx, my) }
  const smoothScroll = (to, ms, container) => page.evaluate((to, ms, cs) => new Promise((done) => {
    const el = cs ? document.querySelector(cs) : document.scrollingElement
    const from = el.scrollTop, target = typeof to === 'number' ? to : from, t0 = performance.now()
    const tick = (now) => {
      const p = Math.min(1, (now - t0) / ms), e = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2
      el.scrollTop = from + (target - from) * e
      p < 1 ? requestAnimationFrame(tick) : done()
    }
    requestAnimationFrame(tick)
  }), to, ms, container || null)
  const scrollBy = async (dy, ms) => { const y = await page.evaluate(() => document.scrollingElement.scrollTop); await smoothScroll(y + dy, ms) }
  const topOf = (sel, offset = 90) => page.evaluate((s, o) => document.querySelector(s).getBoundingClientRect().top + document.scrollingElement.scrollTop - o, sel, offset)

  async function scene(id, fn, { extra = 0 } = {}) {
    const dur = DUR[id].dur + extra
    const rec = await page.screencast({ path: path.join(DIR, 'clips', id + '.webm') })
    const t0 = Date.now()
    const at = async (s) => { const w = t0 + s * 1000 - Date.now(); if (w > 0) await sleep(w) }
    await fn(at)
    await at(dur)
    await rec.stop()
    console.log('recorded', id, ((Date.now() - t0) / 1000).toFixed(1) + 's (audio ' + DUR[id].dur + 's)')
  }

  // ---- 1. Login ----
  await page.goto(BASE + '/login', { waitUntil: 'networkidle0' })
  await sleep(1800)
  await scene('s01_login', async (at) => {
    await at(1.5); await move(1000, 300, 40)
    await at(9); const demo = await byText('button', 'Explore the demo account'); await moveTo(demo, 40)
    await at(13.2); await page.mouse.click(mx, my)
    await page.waitForSelector('[data-pilot="runway"]', { timeout: 20000 })
  })

  // ---- 2. Safe to spend ----
  await scene('s02_safe', async (at) => {
    await at(1); await moveTo('.runway-figure', 35)
    await at(9.5); const second = await page.$('.runway-second .runway-figure'); await moveTo(second, 35)
    await at(17)
    const segs = await page.$$('.strip-track .seg')
    for (const s of segs.slice(0, 6)) { await moveTo(s, 14); await sleep(380) }
    await at(23.2); await clickText('button', 'See the full breakdown')
    await at(24.4); await scrollBy(380, 1400)
  })

  // ---- 3. Can I buy this ----
  await scene('s03_buy', async (at) => {
    await smoothScroll(0, 700)
    await at(0.9); await clickSel('#afford-amt')
    await at(2.4); await page.keyboard.type('20000', { delay: 90 })
    await at(5.4); for (let i = 0; i < 6; i++) await page.keyboard.press('Backspace')
    await page.keyboard.type('90000', { delay: 90 })
    await at(8.5); const hint = await page.$('.emi-hint'); if (hint) await moveTo(hint, 30)
  })

  // ---- 4. Score + insights ----
  await scene('s04_insights', async (at) => {
    await at(0.4); await moveTo('[data-pilot="health"] svg', 35)
    await at(4.5); await moveTo('.parts', 25)
    await at(7.5); await smoothScroll(await topOf('[data-pilot="spend"]'), 1600)
    await move(700, 520, 30)
    await at(11.5); await smoothScroll(await topOf('[data-pilot="heatmap"]'), 1500)
    await at(13.5)
    const cells = await page.$$('.heat i')
    for (const i of [20, 34, 41, 55, 62, 76]) { if (cells[i]) { await moveTo(cells[i], 10); await sleep(250) } }
    await at(17.5)
    const spot = await byText('[data-pilot="subs"] .list-row', 'Spotify')
    if (spot) await moveTo(spot, 35)
  })

  // ---- 5. Rest of overview ----
  await scene('s05_more', async (at) => {
    await at(0.3); await smoothScroll(await topOf('[data-pilot="dues"]'), 1800)
    await at(3.6); await smoothScroll(await topOf('[data-pilot="goals"]', 300), 2200)
  })

  // ---- 6. Transactions ----
  await scene('s06_txn', async (at) => {
    await smoothScroll(0, 500)
    await at(0.6); await clickText('.sidebar .nav-item', 'Transactions')
    await at(4); await move(560, 470, 40)
    await at(8); const imp = await byText('button', 'Import CSV'); await moveTo(imp, 35)
    await at(11.8); await clickText('button', 'Flagged')
    await at(13.5); await move(760, 410, 30)
  })

  // ---- 7. Quick tour ----
  await scene('s07a_cards', async (at) => { await at(0.2); await clickText('.sidebar .nav-item', 'Cards & loans'); await at(1.6); await move(560, 560, 30) })
  await scene('s07b_dues', async (at) => { await at(0.2); await clickText('.sidebar .nav-item', 'Dues'); await at(1.8); await move(700, 470, 30) })
  await scene('s07c_goals', async (at) => { await at(0.2); await clickText('.sidebar .nav-item', 'Goals'); await at(1.4); await move(760, 520, 25) })
  await scene('s07d_tax', async (at) => { await at(0.2); await clickText('.sidebar .nav-item', 'Tax'); await at(1.8); await move(700, 240, 30) })

  // ---- 8. Pilot chat ----
  await scene('s08a_ask', async (at) => {
    await at(0.2); await clickText('.sidebar .nav-item', 'Ask Pilot')
    await at(2.6); await clickSel('.composer textarea')
    await at(3.4); await page.keyboard.type('Can I afford a ₹1,00,000 laptop this month?', { delay: 42 })
    await at(7.6); await page.keyboard.press('Enter')
  }, { extra: 0.6 })
  await page.waitForSelector('.verdict-card', { timeout: 150000 })
  await sleep(700)
  await page.evaluate(() => {
    const s = document.querySelector('.chat-scroll'), last = [...document.querySelectorAll('.msg-pilot')].pop()
    s.scrollTop = last.offsetTop - s.offsetTop - 80
  })
  await sleep(300)
  await scene('s08b_answer', async (at) => {
    await at(1.5); await moveTo('.verdict-card', 35)
    await at(8); const best = await page.$('.emi-table tr.best'); if (best) await moveTo(best, 30)
    await at(11.5); await page.evaluate(() => { const s = document.querySelector('.chat-scroll'); s.scrollTo({ top: s.scrollHeight, behavior: 'smooth' }) })
    await at(12.6); const g = await byText('.trace-toggle', 'figures traced'); if (g) await moveTo(g, 30)
    await at(14.6); await clickText('.trace-toggle', 'How Pilot worked')
    await at(15.4); await page.evaluate(() => { const s = document.querySelector('.chat-scroll'); s.scrollTo({ top: s.scrollHeight, behavior: 'smooth' }) })
  })

  // ---- 9. Voice: the wow moment ----
  await scene('s09a_voice', async (at) => {
    await at(0.2); await clickText('.sidebar .nav-item', 'Overview')
    await page.waitForSelector('[data-pilot="runway"]', { timeout: 20000 })
    await at(2.4); await moveTo('.voice-fab', 35)
    await at(3.6); await page.mouse.click(mx, my)
    await at(DUR.s09a_voice.line1 + 0.3)
    await page.evaluate((ms) => { window.__voiceMs = ms; window.__voiceGo = true }, (DUR.s09a_voice.dur - DUR.s09a_voice.line1 - 0.6) * 1000)
  }, { extra: 0.8 })
  await page.waitForSelector('.voice-caption', { timeout: 150000 })
  await sleep(600)
  await scene('s09b_react', async (at) => {
    await at(1); await move(1180, 600, 30)
    await at(DUR.s09b_react.line1 + 0.6); await moveTo('.seg-short', 35)
    await at(DUR.s09b_react.line1 + 4); await moveTo('.verdict.no', 30)
  })

  // ---- 10. Close ----
  await scene('s10_close', async (at) => {
    await at(0.4); const x = await page.$('.voice-caption button[aria-label="Dismiss"]'); if (x) { await moveTo(x, 25); await page.mouse.click(mx, my) }
    await at(1.4); await move(720, 300, 40)
  })

  await browser.close()
})().catch((e) => { console.error(e); process.exit(1) })
