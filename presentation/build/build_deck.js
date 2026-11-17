// Builds presentation/FinPilot_Presentation.pptx from the approved script and app screenshots.
const path = require('path')
const fs = require('fs')
const pptxgen = require('pptxgenjs')
const React = require('react')
const ReactDOMServer = require('react-dom/server')
const sharp = require('sharp')
const Fi = require('react-icons/fi')
const { applyTheme } = require(path.join(process.env.PPTX_SKILL, 'scripts/apply_theme.js'))

const ROOT = path.resolve(__dirname, '..')
const SHOT = (n) => path.join(__dirname, 'shots', n + '.png')
const OUT = path.join(ROOT, 'FinPilot_Presentation.pptx')

const THEME = {
  name: 'FinPilot Cream',
  headFontFace: 'Cambria',
  bodyFontFace: 'Calibri',
  colors: {
    dk1: '1F1B16', lt1: 'FFFBF3', dk2: '2B2620', lt2: 'F5EFE3',
    accent1: 'B8893A', accent2: '7A5A14', accent3: '3F7D5C', accent4: 'C2553F', accent5: '6B6257', accent6: 'E3D9C6',
    hlink: '7A5A14', folHlink: '6B6257',
  },
}
const HEX = THEME.colors

// Speaker notes come straight from the approved script (the > quoted paragraphs per slide).
function loadNotes() {
  const md = fs.readFileSync(path.join(ROOT, 'FinPilot_slide_script.md'), 'utf8')
  const parts = md.split(/^## Slide \d+ — /m).slice(1)
  return parts.map((p) => p.split('\n').filter((l) => l.startsWith('> ')).map((l) => l.slice(2).replace(/\*\*/g, '').replace(/(^|\s)\*([^*]+)\*/g, '$1$2')).join('\n'))
}

async function icon(Comp, color = HEX.accent2) {
  const svg = ReactDOMServer.renderToStaticMarkup(React.createElement(Comp, { size: 256, color }))
  const buf = await sharp(Buffer.from(svg)).resize(256, 256).png().toBuffer()
  return 'image/png;base64,' + buf.toString('base64')
}

async function main() {
  const pres = new pptxgen()
  pres.layout = 'LAYOUT_WIDE' // 13.333 x 7.5
  pres.title = 'FinPilot'
  pres.author = 'FinPilot team'
  pres.theme = { headFontFace: THEME.headFontFace, bodyFontFace: THEME.bodyFontFace }
  const C = pres.SchemeColor
  const notes = loadNotes()

  // ---- Layouts ----
  pres.defineSlideMaster({
    title: 'FP Title',
    background: { color: C.background2 },
    objects: [],
  })
  pres.defineSlideMaster({
    title: 'FP Content',
    background: { color: C.background2 },
    margin: [0.5, 0.6, 0.5, 0.6],
    objects: [
      { placeholder: { options: { name: 'eyebrow', type: 'body', x: 0.6, y: 0.32, w: 9, h: 0.32, fontSize: 11, bold: true,
        color: C.accent2, charSpacing: 3, margin: 0, valign: 'middle' }, text: '' } },
      { placeholder: { options: { name: 'title', type: 'title', x: 0.6, y: 0.62, w: 12.13, h: 0.8, fontSize: 32, bold: true,
        color: C.text1, margin: 0, valign: 'middle', align: 'left', fontFace: THEME.headFontFace }, text: '' } },
      { text: { text: 'FinPilot · Know what’s actually yours to spend', options: { x: 0.6, y: 7.02, w: 6, h: 0.3, fontSize: 10,
        color: C.accent5, margin: 0, valign: 'middle' } } },
    ],
    slideNumber: { x: 12.33, y: 7.02, w: 0.4, h: 0.3, fontSize: 10, color: C.accent5, align: 'right' },
  })

  const shadow = () => ({ type: 'outer', color: '000000', opacity: 0.18, blur: 8, offset: 3, angle: 90 })
  const cardShadow = () => ({ type: 'outer', color: '6B6257', opacity: 0.12, blur: 6, offset: 2, angle: 90 })

  // A screenshot in a dark device frame (the deck's visual motif).
  function framed(slide, name, x, y, w, aspect, alt) {
    const h = w / aspect
    slide.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: x - 0.07, y: y - 0.07, w: w + 0.14, h: h + 0.14, rectRadius: 0.1,
      fill: { color: C.text2 }, line: { color: C.text2 }, shadow: shadow(), objectName: name + ' frame' })
    slide.addImage({ path: SHOT(name), x, y, w, h, altText: alt, objectName: name + ' screenshot' })
    return h
  }
  function card(slide, x, y, w, h, opts = {}) {
    slide.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y, w, h, rectRadius: 0.12,
      fill: { color: opts.dark ? C.text2 : C.background1 }, line: { color: opts.dark ? C.text2 : C.accent6, width: 1 },
      shadow: cardShadow(), objectName: opts.name || 'card' })
  }
  function iconCircle(slide, data, x, y, d = 0.55, dark = false) {
    slide.addShape(pres.shapes.OVAL, { x, y, w: d, h: d, fill: { color: dark ? C.accent1 : C.accent6 },
      line: { color: dark ? C.accent1 : C.accent6 }, objectName: 'icon circle' })
    slide.addImage({ data, x: x + d * 0.24, y: y + d * 0.24, w: d * 0.52, h: d * 0.52, objectName: 'icon' })
  }
  function content(eyebrow, title, i) {
    const s = pres.addSlide({ masterName: 'FP Content' })
    s.addText(eyebrow.toUpperCase(), { placeholder: 'eyebrow' })
    s.addText(title, { placeholder: 'title' })
    s.addNotes(notes[i])
    return s
  }
  function iconRow(slide, data, x, y, w, head, desc, opts = {}) {
    iconCircle(slide, data, x, y + 0.02, 0.55)
    slide.addText([
      { text: head, options: { bold: true, fontSize: 17, color: C.text1, breakLine: true } },
      { text: desc, options: { fontSize: 14, color: C.accent5 } },
    ], { x: x + 0.75, y, w: w - 0.75, h: opts.h || 1.1, margin: 0, valign: 'top', paraSpaceAfter: 3, isTextBox: true })
  }

  const I = {
    layers: await icon(Fi.FiLayers), shield: await icon(Fi.FiShield), alert: await icon(Fi.FiAlertTriangle),
    card: await icon(Fi.FiCreditCard), cal: await icon(Fi.FiCalendar), chat: await icon(Fi.FiMessageCircle),
    wallet: await icon(Fi.FiDollarSign), mic: await icon(Fi.FiMic), tag: await icon(Fi.FiTag),
    upload: await icon(Fi.FiUpload), repeat: await icon(Fi.FiRepeat), lock: await icon(Fi.FiLock),
    check: await icon(Fi.FiCheckCircle), terminal: await icon(Fi.FiTerminal), info: await icon(Fi.FiInfo),
    eye: await icon(Fi.FiEyeOff), link: await icon(Fi.FiLink), phone: await icon(Fi.FiSmartphone),
    bell: await icon(Fi.FiBell), users: await icon(Fi.FiUsers), globe: await icon(Fi.FiGlobe),
    target: await icon(Fi.FiTarget), trend: await icon(Fi.FiTrendingDown),
  }

  // ---- 1. Title ----
  {
    const s = pres.addSlide({ masterName: 'FP Title' })
    s.addText('SOFTWARE ENGINEERING PROJECT', { x: 0.7, y: 1.45, w: 5.4, h: 0.35, fontSize: 12, bold: true, color: C.accent2,
      charSpacing: 3, margin: 0, isTextBox: true })
    s.addText('FinPilot', { x: 0.7, y: 1.85, w: 5.6, h: 1.15, fontSize: 64, bold: true, color: C.text1, fontFace: THEME.headFontFace,
      margin: 0, valign: 'middle', isTextBox: true })
    s.addText('Know what’s actually yours to spend.', { x: 0.7, y: 3.05, w: 5.6, h: 0.55, fontSize: 24, italic: true,
      color: C.accent2, fontFace: THEME.headFontFace, margin: 0, isTextBox: true })
    s.addText('A personal-finance app with an AI co-pilot that never makes up a number.', { x: 0.7, y: 3.75, w: 5.4, h: 0.8,
      fontSize: 17, color: C.accent5, margin: 0, valign: 'top', isTextBox: true })
    s.addText([
      { text: '[Team members]', options: { bold: true, fontSize: 15, color: C.text1, breakLine: true } },
      { text: '[Course · College · Semester]', options: { fontSize: 14, color: C.accent5 } },
    ], { x: 0.7, y: 5.4, w: 5.4, h: 0.8, margin: 0, isTextBox: true })
    framed(s, 'login', 6.65, 1.55, 6.0, 1.6, 'FinPilot sign-in screen with the tagline and safe-to-spend strip')
    s.addNotes(notes[0])
  }

  // ---- 2. Problem ----
  {
    const s = content('01 · The problem', 'Your bank balance is not your spending money', 1)
    const items = [
      [I.layers, 'Money is scattered', '2–3 credit cards, EMIs, UPI apps and bank SMS, all in different places.'],
      [I.wallet, 'The balance misleads', 'Card bills and EMIs due this month are already spent.'],
      [I.cal, 'Due dates get missed', 'Late fees, card interest and a lower credit score.'],
      [I.chat, 'AI chatbots guess', 'They answer money questions confidently, with numbers they made up.'],
    ]
    items.forEach(([ic, h, d], k) => {
      const x = 0.6 + (k % 2) * 3.6, y = 1.75 + Math.floor(k / 2) * 2.45
      card(s, x, y, 3.3, 2.2, { name: h + ' card' })
      iconCircle(s, ic, x + 0.3, y + 0.3, 0.55)
      s.addText([
        { text: h, options: { bold: true, fontSize: 17, color: C.text1, breakLine: true } },
        { text: d, options: { fontSize: 14, color: C.accent5 } },
      ], { x: x + 0.3, y: y + 1.0, w: 2.75, h: 1.05, margin: 0, valign: 'top', paraSpaceAfter: 3, isTextBox: true })
    })
    card(s, 8.15, 1.75, 4.58, 4.65, { dark: true, name: 'balance callout' })
    s.addText('In the bank', { x: 8.6, y: 2.15, w: 3.8, h: 0.35, fontSize: 14, color: C.accent6, margin: 0, isTextBox: true })
    s.addText('₹1,48,520', { x: 8.6, y: 2.5, w: 3.8, h: 0.85, fontSize: 44, bold: true, color: C.background1,
      fontFace: THEME.headFontFace, margin: 0, isTextBox: true })
    s.addText('Actually safe to spend', { x: 8.6, y: 3.7, w: 3.8, h: 0.35, fontSize: 14, color: C.accent6, margin: 0, isTextBox: true })
    s.addText('₹93,150', { x: 8.6, y: 4.05, w: 3.8, h: 0.85, fontSize: 44, bold: true, color: C.accent1,
      fontFace: THEME.headFontFace, margin: 0, isTextBox: true })
    s.addText('Demo user: ₹55,370 of card bills and EMIs are due before month end.', { x: 8.6, y: 5.2, w: 3.8, h: 0.8,
      fontSize: 13, italic: true, color: C.accent6, margin: 0, valign: 'top', isTextBox: true })
  }

  // ---- 3. Solution ----
  {
    const s = content('02 · Our solution', 'One app, one honest number, one co-pilot', 2)
    iconRow(s, I.layers, 0.6, 1.85, 5.0, 'One dashboard', 'Cards, loans, dues, spending, budgets, goals and tax in one place.')
    iconRow(s, I.wallet, 0.6, 3.25, 5.0, 'Safe-to-spend', 'Your real spendable money, not just your balance.')
    iconRow(s, I.mic, 0.6, 4.65, 5.0, 'Pilot, the AI co-pilot', 'Ask in English, Hinglish or Hindi, by text or voice. Every figure comes from your data.', { h: 1.4 })
    framed(s, 'overview', 5.95, 1.85, 6.78, 1.6, 'FinPilot overview dashboard')
  }

  // ---- 4. Architecture ----
  {
    const s = content('03 · How it’s built', 'Two backends, one source of truth', 3)
    const box = (x, y, w, h, title, sub, opts = {}) => {
      card(s, x, y, w, h, { dark: opts.dark, name: title + ' box' })
      s.addText([
        { text: title, options: { bold: true, fontSize: 17, color: opts.dark ? C.background1 : C.text1, breakLine: true } },
        { text: sub, options: { fontSize: 13, color: opts.dark ? C.accent6 : C.accent5 } },
      ], { x: x + 0.2, y: y + 0.15, w: w - 0.4, h: h - 0.3, margin: 0, valign: 'middle', paraSpaceAfter: 2, isTextBox: true })
    }
    const arrow = (x1, y1, x2, y2, label, ly) => {
      s.addShape(pres.shapes.LINE, { x: Math.min(x1, x2), y: y1, w: Math.abs(x2 - x1), h: y2 - y1, flipH: x2 < x1,
        line: { color: C.accent2, width: 2, endArrowType: 'triangle' }, objectName: 'arrow' })
      if (label) s.addText(label, { x: Math.min(x1, x2) + 0.05, y: ly, w: Math.abs(x2 - x1) - 0.1, h: 0.3, fontSize: 11,
        color: C.accent2, align: 'center', margin: 0, isTextBox: true })
    }
    box(0.6, 1.9, 2.3, 1.45, 'React web app', 'Dashboard, charts, voice')
    box(3.45, 1.9, 2.95, 1.45, 'Java Spring Boot', 'JWT login · business rules · dues engine · daily 8 AM job', { dark: true })
    box(7.75, 1.9, 2.8, 1.45, 'Python FastAPI', 'ML models · AI agent · RAG search', { dark: true })
    box(11.1, 1.9, 1.63, 1.45, 'Gemini', 'Hosted LLM')
    box(3.45, 4.15, 2.95, 1.0, 'PostgreSQL', 'System of record')
    box(7.75, 4.15, 2.8, 1.0, 'FAISS index', '8 trusted finance docs')
    arrow(2.9, 2.62, 3.45, 2.62)
    arrow(6.4, 2.35, 7.75, 2.35, 'ML + agent', 2.0)
    arrow(7.75, 2.95, 6.4, 2.95, 'tools call back', 3.0)
    arrow(10.55, 2.62, 11.1, 2.62)
    s.addShape(pres.shapes.LINE, { x: 4.925, y: 3.35, w: 0, h: 0.8, line: { color: C.accent2, width: 2, beginArrowType: 'triangle', endArrowType: 'triangle' } })
    s.addShape(pres.shapes.LINE, { x: 9.15, y: 3.35, w: 0, h: 0.8, line: { color: C.accent2, width: 2, endArrowType: 'triangle' } })
    s.addText('Pilot never guesses a number: its tools call back into the Java API with the user’s own login.', {
      x: 0.6, y: 5.45, w: 12.13, h: 0.4, fontSize: 15, italic: true, color: C.text1, margin: 0, isTextBox: true })
    const chips = ['React', 'Recharts', 'Spring Boot', 'JWT', 'PostgreSQL', 'FastAPI', 'scikit-learn', 'FAISS', 'Gemini', 'Docker Compose']
    let cx = 0.6
    chips.forEach((t) => {
      const w = 0.32 + t.length * 0.095
      s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: cx, y: 6.1, w, h: 0.42, rectRadius: 0.21, fill: { color: C.background1 },
        line: { color: C.accent6 }, objectName: t + ' chip' })
      s.addText(t, { x: cx, y: 6.1, w, h: 0.42, fontSize: 12, color: C.text1, align: 'center', valign: 'middle', margin: 0, isTextBox: true })
      cx += w + 0.12
    })
  }

  // ---- 5. Safe-to-spend ----
  {
    const s = content('04 · The headline feature', 'Safe-to-spend: what’s actually yours', 4)
    const rows = [
      ['Safe to spend now', 'Bank balance minus card bills and EMIs due this month.'],
      ['Predicted month-end', 'Also minus recurring bills and usual spending, forecast by an ML regression model.'],
      ['Spend today', 'A daily allowance that still keeps 10% of income as savings.'],
      ['“Can I buy this?”', 'An instant verdict, plus a smarter no-cost EMI when it doesn’t fit.'],
    ]
    rows.forEach(([h, d], k) => {
      const y = 1.85 + k * 1.2
      s.addText([
        { text: h, options: { bold: true, fontSize: 17, color: C.text1, breakLine: true } },
        { text: d, options: { fontSize: 14, color: C.accent5 } },
      ], { x: 0.6, y, w: 4.85, h: 1.05, margin: 0, valign: 'top', paraSpaceAfter: 3, isTextBox: true })
    })
    const h = framed(s, 'runway', 5.85, 1.85, 6.88, 1.606, 'Safe-to-spend card with a ₹90,000 purchase that does not fit and a no-cost EMI suggestion')
    s.addText('Live: a ₹90,000 purchase is ₹12,965 over the safe amount, so FinPilot suggests a 6-month no-cost EMI.', {
      x: 5.85, y: 1.85 + h + 0.2, w: 6.88, h: 0.45, fontSize: 12, italic: true, color: C.accent5, margin: 0, isTextBox: true })
  }

  // ---- 6. Smart transactions ----
  {
    const s = content('05 · Smart transactions', 'Transactions that explain themselves', 5)
    const cards = [
      [I.tag, 'Auto-categorisation', 'Rules + ML classifier that learns from your corrections.'],
      [I.upload, 'CSV import', 'Upload a bank statement; every row categorised and checked.'],
      [I.alert, 'Unusual charges', 'Isolation Forest flags duplicates and spikes, with a reason.'],
      [I.repeat, 'Autopay detective', 'Finds subscriptions, their yearly cost and price rises.'],
    ]
    cards.forEach(([ic, h, d], k) => {
      const x = 0.6 + k * 3.11
      card(s, x, 1.75, 2.85, 1.75, { name: h + ' card' })
      iconCircle(s, ic, x + 0.22, 1.95, 0.48)
      s.addText(h, { x: x + 0.82, y: 1.95, w: 1.95, h: 0.48, fontSize: 16, bold: true, color: C.text1, margin: 0, valign: 'middle', isTextBox: true })
      s.addText(d, { x: x + 0.22, y: 2.55, w: 2.45, h: 0.85, fontSize: 14, color: C.accent5, margin: 0, valign: 'top', isTextBox: true })
    })
    framed(s, 'transactions', 0.67, 3.82, 4.7, 1.6, 'Transactions page showing flagged unusual charges with reasons')
    framed(s, 'autopay', 5.75, 3.82, 2.24, 0.761, 'Autopay detective card with yearly cost and a Spotify price rise')
    card(s, 8.6, 3.75, 4.13, 3.06, { dark: true, name: 'csv stat' })
    s.addText('CSV IMPORT, LIVE', { x: 8.9, y: 3.95, w: 3.6, h: 0.3, fontSize: 11, bold: true, charSpacing: 3, color: C.accent1, margin: 0, isTextBox: true })
    const stats = [['11', 'rows imported'], ['11', 'auto-categorised'], ['1', 'flagged unusual']]
    stats.forEach(([n, l], k) => {
      s.addText(n, { x: 8.9 + k * 1.2, y: 4.35, w: 1.1, h: 0.75, fontSize: 36, bold: true, color: C.background1, fontFace: THEME.headFontFace, margin: 0, isTextBox: true })
      s.addText(l, { x: 8.9 + k * 1.2, y: 5.1, w: 1.15, h: 0.55, fontSize: 12, color: C.accent6, margin: 0, valign: 'top', isTextBox: true })
    })
    s.addText('A sample bank statement: a ₹48,500 jewellery purchase was flagged in seconds.', { x: 8.9, y: 5.85, w: 3.6, h: 0.75,
      fontSize: 13, italic: true, color: C.accent6, margin: 0, valign: 'top', isTextBox: true })
  }

  // ---- 7. Dues, budgets, goals ----
  {
    const s = content('06 · Stay on track', 'Never miss a due date, never miss a goal', 6)
    framed(s, 'dues', 0.67, 1.85, 5.6, 1.6, 'Dues page grouped by week with due-soon tags')
    framed(s, 'goals', 7.06, 1.85, 5.6, 1.6, 'Goals page with autopilot monthly savings')
    const items = [
      [I.cal, 'Dues engine', 'Every card bill and EMI on one timeline.'],
      [I.bell, 'Daily reminders', '8 AM job; alerts 5 days before each due date.'],
      [I.trend, 'Budgets with pace', 'A marker shows where you should be today.'],
      [I.target, 'Goals on autopilot', 'Monthly saving needed, checked against your surplus.'],
    ]
    items.forEach(([ic, h, d], k) => {
      const x = 0.6 + k * 3.11
      iconCircle(s, ic, x, 5.78, 0.45)
      s.addText([
        { text: h, options: { bold: true, fontSize: 15, color: C.text1, breakLine: true } },
        { text: d, options: { fontSize: 13, color: C.accent5 } },
      ], { x: x + 0.58, y: 5.72, w: 2.4, h: 1.1, margin: 0, valign: 'top', paraSpaceAfter: 2, isTextBox: true })
    })
  }

  // ---- 8. Tax & health ----
  {
    const s = content('07 · Tax and financial health', 'Tax made simple, health made visible', 7)
    const h = framed(s, 'tax', 0.67, 1.85, 7.0, 1.6, 'Tax page comparing old and new regimes with what-if sliders')
    s.addText('Old vs new regime · FY 2026-27 slabs · 87A rebate and cess · what-if sliders · return-prep checklist', {
      x: 0.6, y: 1.85 + h + 0.2, w: 7.15, h: 0.45, fontSize: 12, italic: true, color: C.accent5, margin: 0, isTextBox: true })
    const hh = framed(s, 'health', 8.86, 1.85, 3.8, 0.944, 'FinPilot score of 88 out of 100 with four parts')
    s.addText('FinPilot score: four parts × 25 points, plus a clearly labelled simulated credit score (300–900).', {
      x: 8.79, y: 1.85 + hh + 0.2, w: 3.94, h: 0.65, fontSize: 12, italic: true, color: C.accent5, margin: 0, valign: 'top', isTextBox: true })
  }

  // ---- 9. Pilot ----
  {
    const s = content('08 · Pilot, the AI agent', 'An AI agent that can’t make numbers up', 8)
    framed(s, 'chat', 0.67, 1.85, 6.3, 1.44, 'Pilot chat answer with verdict, EMI comparison, figures traced and the step-by-step trace')
    const steps = ['Interpret', 'Plan', 'Act (tools)', 'Compute', 'Write', 'Verify']
    steps.forEach((t, k) => {
      const x = 7.45 + (k % 3) * 1.8, y = 1.85 + Math.floor(k / 3) * 0.72
      s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y, w: 1.65, h: 0.56, rectRadius: 0.1,
        fill: { color: k === 5 ? C.text2 : C.background1 }, line: { color: k === 5 ? C.text2 : C.accent6 }, objectName: t + ' step' })
      s.addText(`${k + 1}  ${t}`, { x, y, w: 1.65, h: 0.56, fontSize: 13, bold: true, color: k === 5 ? C.accent1 : C.text1,
        align: 'center', valign: 'middle', margin: 0, isTextBox: true })
    })
    const facts = [
      [I.layers, '7 tools fetch your real data', 'Transactions, dues, budgets, forecast, payoff, tax, knowledge.'],
      [I.info, 'RAG with citations', 'Advice comes from 8 trusted documents, cited as [1] [2].'],
      [I.check, 'Every figure checked', 'An invented number gets the answer rejected and rewritten.'],
      [I.shield, 'Never breaks', 'AI busy? A rule-based planner answers with the same tools.'],
    ]
    facts.forEach(([ic, h, d], k) => {
      const y = 3.45 + k * 0.85
      iconCircle(s, ic, 7.45, y + 0.03, 0.45)
      s.addText([
        { text: h, options: { bold: true, fontSize: 15, color: C.text1, breakLine: true } },
        { text: d, options: { fontSize: 13, color: C.accent5 } },
      ], { x: 8.05, y, w: 4.68, h: 0.8, margin: 0, valign: 'top', paraSpaceAfter: 1, isTextBox: true })
    })
  }

  // ---- 10. Wow ----
  {
    const s = content('09 · The wow moment', 'Just ask, in Hinglish', 9)
    card(s, 0.6, 1.85, 4.6, 2.85, { dark: true, name: 'conversation' })
    s.addText('YOU SAY', { x: 0.9, y: 2.05, w: 4.0, h: 0.28, fontSize: 11, bold: true, charSpacing: 3, color: C.accent1, margin: 0, isTextBox: true })
    s.addText('“Kya main dedh lakh ki bike le sakta hoon?”', { x: 0.9, y: 2.35, w: 4.0, h: 0.75, fontSize: 19, italic: true,
      color: C.background1, fontFace: THEME.headFontFace, margin: 0, valign: 'top', isTextBox: true })
    s.addText('PILOT SAYS, OUT LOUD', { x: 0.9, y: 3.2, w: 4.0, h: 0.28, fontSize: 11, bold: true, charSpacing: 3, color: C.accent1, margin: 0, isTextBox: true })
    s.addText('“Abhi nahi. ₹72,965 kam pad rahe hain. Lekin 6 mahine ki no-cost EMI pe ₹25,000 mahina, wo aaram se chal jayega.”', {
      x: 0.9, y: 3.5, w: 4.0, h: 1.05, fontSize: 14, color: C.accent6, margin: 0, valign: 'top', isTextBox: true })
    framed(s, 'voice-listening', 0.67, 5.0, 2.95, 1.6, 'Voice screen listening to a Hinglish question')
    s.addText('English, Hinglish or Hindi', { x: 3.85, y: 5.05, w: 1.35, h: 1.6, fontSize: 13, italic: true, color: C.accent5,
      margin: 0, valign: 'middle', isTextBox: true })
    const h = framed(s, 'voice-react', 5.6, 1.85, 7.06, 1.6, 'Dashboard reacting: purchase carved out of the safe-to-spend strip with the shortfall in red, and the spoken reply caption')
    s.addText('The dashboard reacts: the bike is carved out of the safe-to-spend strip and the shortfall turns red.', {
      x: 5.53, y: 1.85 + h + 0.2, w: 7.2, h: 0.45, fontSize: 12, italic: true, color: C.accent5, margin: 0, isTextBox: true })
  }

  // ---- 11. Trust ----
  {
    const s = content('10 · Trust', 'Built to be trusted', 10)
    const items = [
      [I.check, 'No invented numbers', 'Enforced in code; every answer logged with its tools and sources.'],
      [I.eye, 'Privacy first', 'Only card last-4 stored; personal data masked before anything reaches the AI.'],
      [I.lock, 'Secure by design', 'JWT login; every query scoped to the logged-in user.'],
      [I.shield, 'Tested', '30 automated tests across Java and Python.'],
      [I.terminal, 'One command to run', './run.sh locally, or Docker Compose.'],
      [I.info, 'Honest scope', 'CSV import instead of bank linking (RBI licensing); simulated credit score.'],
    ]
    items.forEach(([ic, h, d], k) => {
      const x = 0.6 + (k % 3) * 4.14, y = 1.85 + Math.floor(k / 3) * 2.45
      card(s, x, y, 3.85, 2.2, { name: h + ' card' })
      iconCircle(s, ic, x + 0.3, y + 0.3, 0.55)
      s.addText([
        { text: h, options: { bold: true, fontSize: 17, color: C.text1, breakLine: true } },
        { text: d, options: { fontSize: 14, color: C.accent5 } },
      ], { x: x + 0.3, y: y + 1.0, w: 3.3, h: 1.1, margin: 0, valign: 'top', paraSpaceAfter: 3, isTextBox: true })
    })
  }

  // ---- 12. Next & thanks ----
  {
    const s = content('11 · What’s next', 'What’s next, and thank you', 11)
    const next = [
      [I.link, 'Bank linking via the Account Aggregator framework'],
      [I.phone, 'A mobile app'],
      [I.bell, 'SMS and email reminders'],
      [I.users, 'Shared family budgets'],
      [I.globe, 'More Indian languages for voice'],
    ]
    next.forEach(([ic, t], k) => {
      const y = 1.9 + k * 0.62
      iconCircle(s, ic, 0.6, y, 0.45)
      s.addText(t, { x: 1.2, y, w: 4.9, h: 0.45, fontSize: 16, color: C.text1, margin: 0, valign: 'middle', isTextBox: true })
    })
    s.addText('Thank you', { x: 0.6, y: 5.25, w: 5.5, h: 0.75, fontSize: 40, bold: true, color: C.text1, fontFace: THEME.headFontFace, margin: 0, isTextBox: true })
    s.addText('Questions? Live demo next.', { x: 0.6, y: 6.0, w: 5.5, h: 0.4, fontSize: 17, italic: true, color: C.accent2, margin: 0, isTextBox: true })
    framed(s, 'overview', 6.55, 1.95, 3.9, 1.6, 'FinPilot on desktop')
    framed(s, 'mobile', 10.8, 1.95, 1.9, 0.462, 'FinPilot on a phone')
  }

  await pres.writeFile({ fileName: OUT })
  await applyTheme(OUT, THEME)
  console.log('wrote', OUT)
}

main().catch((e) => { console.error(e); process.exit(1) })
