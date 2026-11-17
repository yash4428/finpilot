const puppeteer = require('puppeteer-core')
;(async () => {
  const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new' })
  const p = await b.newPage()
  await p.goto('file://' + __dirname + '/team_guide_print.html', { waitUntil: 'networkidle0' })
  await p.pdf({ path: __dirname + '/../FinPilot_Team_Guide.pdf', format: 'A4', printBackground: true, preferCSSPageSize: true })
  await b.close()
})()
