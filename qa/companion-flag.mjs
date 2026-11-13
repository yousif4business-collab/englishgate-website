// COMPANION_ENABLED flag assertion — rendered Home, both modes.
// (S22: renamed from murshid-flag.mjs — the service is now «رفيق الرحلة».)
// Usage: node qa/companion-flag.mjs --expect off|on [--base http://localhost:5177]
import { existsSync } from 'node:fs'
import { chromium } from 'playwright-core'

const BASE = process.argv.includes('--base')
  ? process.argv[process.argv.indexOf('--base') + 1]
  : 'http://localhost:5177'
const EXPECT = process.argv[process.argv.indexOf('--expect') + 1] // 'off' | 'on'
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const TITLE = { en: 'Journey Companion — guidance beyond the lesson', ar: 'رفيق الرحلة — توجيه يتجاوز الدرس' }

const browser = await chromium.launch({ headless: true, ...(existsSync(CHROME) ? { executablePath: CHROME } : {}) })
const failures = []

for (const lang of ['en', 'ar']) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' })
  await ctx.addInitScript(l => { try { sessionStorage.setItem('eg_intro_seen', '1'); localStorage.setItem('eg_lang', l) } catch {} }, lang)
  const p = await ctx.newPage()
  await p.goto(BASE + '/', { waitUntil: 'networkidle' })
  await p.evaluate(async () => {
    for (let y = 0; y < document.body.scrollHeight; y += 600) { window.scrollTo(0, y); await new Promise(r => setTimeout(r, 40)) }
  })
  await p.waitForTimeout(400)
  const s = await p.evaluate(title => {
    const sec = document.querySelector('#companion')
    return {
      section: !!sec,
      title: document.body.textContent.includes(title),
      pillars: sec ? sec.querySelectorAll('.card-hover').length : 0,
      cta: sec ? [...sec.querySelectorAll('a')].some(a => a.href.includes('wa.me')) : false,
    }
  }, TITLE[lang])
  if (EXPECT === 'off') {
    if (s.section) failures.push(`[${lang}] #companion rendered while flag is off`)
    if (s.title) failures.push(`[${lang}] Companion title text visible while flag is off`)
  } else {
    if (!s.section) failures.push(`[${lang}] #companion missing while flag is on`)
    if (!s.title) failures.push(`[${lang}] Companion title text missing while flag is on`)
    if (s.pillars !== 3) failures.push(`[${lang}] expected 3 pillar cards, found ${s.pillars}`)
    if (!s.cta) failures.push(`[${lang}] Companion WhatsApp CTA missing`)
  }
  await ctx.close()
}
await browser.close()

console.log(JSON.stringify({ expect: EXPECT, failures: failures.length }))
for (const f of failures) console.log('FAIL ' + f)
process.exit(failures.length ? 1 : 0)
