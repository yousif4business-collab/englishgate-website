// S13 — full-page screenshots of every changed page (qa/s13/) + behavioural
// checks: video ended-overlay, Why toggle states, centering of the new
// blocks. Usage: node qa/s13-shots.mjs [--base http://localhost:4173]
import { existsSync, mkdirSync } from 'node:fs'
import { chromium } from 'playwright-core'

const BASE = process.argv.includes('--base')
  ? process.argv[process.argv.indexOf('--base') + 1]
  : 'http://localhost:4173'
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const PAGES = ['/', '/about', '/programs', '/staff', '/contact', '/faq', '/feedback']
const failures = []
const fail = (lang, where, detail) => failures.push(`[${lang} ${where}] ${detail}`)

const browser = await chromium.launch({ headless: true, ...(existsSync(CHROME) ? { executablePath: CHROME } : {}) })
mkdirSync('qa/s13', { recursive: true })

for (const lang of ['en', 'ar']) {
  for (const vp of [{ tag: '1440', width: 1440, height: 900 }, { tag: '390', width: 390, height: 844 }]) {
    const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, reducedMotion: 'reduce' })
    await ctx.addInitScript(l => { try { sessionStorage.setItem('eg_intro_seen', '1'); localStorage.setItem('eg_lang', l) } catch {} }, lang)
    for (const path of PAGES) {
      const p = await ctx.newPage()
      await p.goto(BASE + path, { waitUntil: 'networkidle' }).catch(e => fail(lang, path, 'goto: ' + e.message))
      await p.evaluate(async () => {
        for (let y = 0; y < document.body.scrollHeight; y += 600) { window.scrollTo(0, y); await new Promise(r => setTimeout(r, 40)) }
        window.scrollTo(0, 0)
      })
      await p.waitForTimeout(500)

      // centering: the new invite strip / gate card sit centred in their container
      const centering = await p.evaluate(() => {
        const out = []
        for (const el of document.querySelectorAll('.max-w-3xl.mx-auto, .max-w-2xl.mx-auto')) {
          const r = el.getBoundingClientRect()
          if (r.width === 0) continue
          const off = Math.abs((r.left + r.right) / 2 - innerWidth / 2)
          if (off > 8) out.push(`${el.className.split(' ').slice(0, 3).join('.')} off-centre by ${Math.round(off)}px`)
        }
        return out
      })
      for (const c of centering) fail(lang, `${path}@${vp.tag}`, 'centering: ' + c)

      const slug = (path === '/' ? 'home' : path.slice(1)) + `-${lang}-${vp.tag}`
      // cv-auto sections don't paint in Chromium's expanded fullPage snapshot
      // — force them visible for the capture only (screenshot artifact, not a
      // site bug; scrolled checks above run against the real behaviour).
      await p.addStyleTag({ content: '.cv-auto{content-visibility:visible!important}' })
      await p.waitForTimeout(250)
      await p.screenshot({ path: `qa/s13/${slug}.png`, fullPage: true, timeout: 20000 }).catch(e => fail(lang, path, 'shot: ' + e.message.split('\n')[0]))
      await p.close()
    }

    // ── behavioural: video ended-overlay (home) ──
    if (vp.tag === '1440') {
      const p = await ctx.newPage()
      await p.goto(BASE + '/', { waitUntil: 'networkidle' }).catch(() => {})
      await p.evaluate(() => document.querySelector('#video')?.scrollIntoView({ block: 'center' }))
      await p.waitForTimeout(400)
      try {
        const btn = p.locator('#video button[aria-label^="Play"]').first()
        await btn.click({ timeout: 5000 })
        await p.waitForTimeout(800)
        await p.evaluate(() => {
          const v = document.querySelector('#video video')
          if (v && v.duration) v.currentTime = Math.max(0, v.duration - 0.3)
        })
        await p.waitForTimeout(1800)
        const ov = await p.evaluate(l => {
          const sec = document.querySelector('#video')
          const want = l === 'en' ? 'This could be your child' : 'هذا قد يكون طفلك'
          const has = sec.textContent.includes(want)
          const wa = [...sec.querySelectorAll('a')].some(a => a.href.includes('wa.me'))
          return { has, wa }
        }, lang)
        if (!ov.has) fail(lang, '#video', 'ended overlay title missing after ended event')
        if (!ov.wa) fail(lang, '#video', 'ended overlay WhatsApp CTA missing')
        await p.screenshot({ path: `qa/s13/video-ended-${lang}.png`, timeout: 8000 }).catch(() => {})
      } catch (e) { fail(lang, '#video', 'ended-overlay test: ' + e.message.split('\n')[0]) }
      await p.close()

      // ── behavioural: Why toggles (about) ──
      const w = await ctx.newPage()
      await w.goto(BASE + '/about', { waitUntil: 'networkidle' }).catch(() => {})
      await w.evaluate(() => document.querySelector('#why')?.scrollIntoView({ block: 'center' }))
      await w.waitForTimeout(600)
      try {
        const chips = w.locator('#why button[aria-pressed]')
        const n = await chips.count()
        if (n !== 2) fail(lang, '#why', `expected 2 toggle chips, found ${n}`)
        await chips.first().click()
        await w.waitForTimeout(450)
        const state = await w.evaluate(() => {
          const pressed = [...document.querySelectorAll('#why button[aria-pressed]')].map(b => b.getAttribute('aria-pressed'))
          const dimmed = document.querySelectorAll('#why li.opacity-35').length
          return { pressed, dimmed }
        })
        if (state.pressed[0] !== 'true') fail(lang, '#why', 'first chip not aria-pressed after click')
        if (state.dimmed === 0) fail(lang, '#why', 'no items dimmed when a side is focused')
        await w.screenshot({ path: `qa/s13/why-toggle-${lang}.png`, timeout: 8000 }).catch(() => {})
        await chips.first().click()
        await w.waitForTimeout(450)
        const after = await w.evaluate(() => document.querySelectorAll('#why li.opacity-35').length)
        if (after !== 0) fail(lang, '#why', 'items still dimmed after untoggling')
      } catch (e) { fail(lang, '#why', 'toggle test: ' + e.message.split('\n')[0]) }
      await w.close()
    }
    await ctx.close()
  }
}
await browser.close()

console.log(JSON.stringify({ base: BASE, failures: failures.length }))
for (const f of failures) console.log('FAIL ' + f)
process.exit(failures.length ? 1 : 0)
