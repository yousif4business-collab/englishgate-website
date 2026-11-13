// S13 QA — belt behaviour (with temp dummies OR empty state), new-section
// assertions, and screenshots to qa/s13/. Runs the SAME checks in all three
// engines. Usage: node qa/s13.mjs [--base http://localhost:5177] [--dummies]
import { existsSync, mkdirSync } from 'node:fs'
import { chromium, webkit, firefox } from 'playwright-core'

const BASE = process.argv.includes('--base')
  ? process.argv[process.argv.indexOf('--base') + 1]
  : 'http://localhost:5177'
const DUMMIES = process.argv.includes('--dummies')
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'

const ENGINES = {
  chromium: () => chromium.launch({ headless: true, ...(existsSync(CHROME) ? { executablePath: CHROME } : {}) }),
  webkit: () => webkit.launch({ headless: true }),
  firefox: () => firefox.launch({ headless: true }),
}

const failures = []
const fail = (engine, lang, where, detail) => failures.push({ engine, lang, where, detail })

for (const [engine, launch] of Object.entries(ENGINES)) {
  const browser = await launch()
  for (const lang of ['en', 'ar']) {
    for (const motion of ['no-preference', 'reduce']) {
      for (const vp of [{ name: 'mobile', width: 390, height: 844 }, { name: 'desktop', width: 1440, height: 900 }]) {
        const ctx = await browser.newContext({ viewport: vp, reducedMotion: motion })
        await ctx.addInitScript(l => { try { sessionStorage.setItem('eg_intro_seen', '1'); localStorage.setItem('eg_lang', l) } catch {} }, lang)
        const tag = `${engine}-${lang}-${vp.name}-${motion === 'reduce' ? 'rm' : 'motion'}`

        // ── Home: testimonials belt / strip ──
        const p = await ctx.newPage()
        const errors = []
        p.on('pageerror', e => errors.push(e.message))
        await p.goto(BASE + '/', { waitUntil: 'networkidle' }).catch(e => fail(engine, lang, 'goto /', e.message))
        await p.evaluate(() => document.querySelector('#testimonials')?.scrollIntoView())
        await p.waitForTimeout(600)

        const t = await p.evaluate(() => {
          const sec = document.querySelector('#testimonials')
          if (!sec) return { missing: true }
          const tracks = [...sec.querySelectorAll('.marquee-track')]
          const dirs = tracks.map(tr => getComputedStyle(tr).animationDirection)
          const cards = sec.querySelectorAll('.marquee-track .card').length
          const gridCards = [...sec.querySelectorAll(':scope > div > .card, :scope .grid .card')].length
          const strip = [...sec.querySelectorAll('a')].some(a => a.href.includes('wa.me') || a.href.includes('whatsapp'))
          const overflow = document.documentElement.scrollWidth > window.innerWidth + 1
          return { tracks: tracks.length, dirs, cards, gridCards, strip, overflow }
        })
        if (t.missing) fail(engine, lang, tag, 'no #testimonials section')
        else {
          if (!t.strip) fail(engine, lang, tag, 'no WhatsApp share CTA in testimonials section')
          if (t.overflow) fail(engine, lang, tag, 'horizontal overflow with belt')
          if (DUMMIES) {
            if (motion === 'reduce') {
              if (t.tracks !== 0) fail(engine, lang, tag, `reduced-motion should show static grid, found ${t.tracks} marquee tracks`)
              if (t.gridCards < 5) fail(engine, lang, tag, `static grid has ${t.gridCards} cards, expected 5`)
            } else {
              if (t.tracks !== 2) fail(engine, lang, tag, `expected 2 belt rows, found ${t.tracks}`)
              if (t.dirs.length === 2 && t.dirs[0] === t.dirs[1]) fail(engine, lang, tag, `rows scroll the SAME direction (${t.dirs.join(',')})`)
              if (t.cards < 10) fail(engine, lang, tag, `belt has only ${t.cards} cards`)
            }
          } else if (t.tracks !== 0 || t.cards !== 0) {
            fail(engine, lang, tag, `empty state should have no belt (tracks=${t.tracks})`)
          }
        }

        // ── Home: video section — badge + before/after pills; team belt ──
        const v = await p.evaluate(l => {
          const sec = document.querySelector('#video')
          if (!sec) return { missing: true }
          const txt = sec.textContent
          const need = l === 'en' ? ['Before', 'After', 'English Gate'] : ['قبل', 'بعد', 'English Gate']
          return { missing: false, labels: need.filter(n => !txt.includes(n)) }
        }, lang)
        if (v.missing) fail(engine, lang, tag, 'no #video section')
        else if (v.labels.length) fail(engine, lang, tag, `video section missing: ${v.labels.join(', ')}`)

        const team = await p.evaluate(() => {
          const belts = [...document.querySelectorAll('.marquee-track')]
          // team belt = a track of photo cards (S14: anonymous, images only)
          return belts.some(b => b.querySelector('img'))
        })
        // reduced-motion keeps the team marquee in DOM (animation frozen) — only assert presence with motion
        if (motion === 'no-preference' && !team) fail(engine, lang, tag, 'no team card belt on home')

        if (vp.name === 'desktop' && motion === 'no-preference') {
          for (const [sel, shot] of [['#video', 'video'], ['#testimonials', 'testimonials']]) {
            await p.evaluate(s => document.querySelector(s)?.scrollIntoView({ block: 'center' }), sel)
            await p.waitForTimeout(400)
            const dir = `qa/s13/${DUMMIES ? 'with-dummies' : 'final'}`
            mkdirSync(dir, { recursive: true })
            await p.locator(sel).screenshot({ path: `${dir}/${engine}-${lang}-${shot}.png`, timeout: 8000 }).catch(() => {})
          }
        }
        if (errors.length) fail(engine, lang, tag + ' /', 'pageerror: ' + errors.join(' | '))
        await p.close()

        // ── /feedback: belt or strip ──
        const f = await ctx.newPage()
        const ferrors = []
        f.on('pageerror', e => ferrors.push(e.message))
        await f.goto(BASE + '/feedback', { waitUntil: 'networkidle' }).catch(e => fail(engine, lang, 'goto /feedback', e.message))
        await f.evaluate(async () => {
          for (let y = 0; y < document.body.scrollHeight; y += 500) { window.scrollTo(0, y); await new Promise(r => setTimeout(r, 50)) }
        })
        await f.waitForTimeout(500)
        const fb = await f.evaluate(() => ({
          tracks: document.querySelectorAll('.marquee-track').length,
          cards: document.querySelectorAll('.card').length,
          wa: [...document.querySelectorAll('a')].some(a => a.href.includes('wa.me')),
          videoCards: document.querySelectorAll('button[aria-label]').length,
          badge: document.body.textContent.includes('English Gate'),
          overflow: document.documentElement.scrollWidth > window.innerWidth + 1,
        }))
        if (!fb.wa) fail(engine, lang, tag + ' /feedback', 'no WhatsApp CTA')
        if (fb.overflow) fail(engine, lang, tag + ' /feedback', 'horizontal overflow')
        if (DUMMIES) {
          if (motion === 'reduce' && fb.tracks !== 0) fail(engine, lang, tag + ' /feedback', 'belt not static under reduced motion')
          if (motion === 'no-preference' && fb.tracks !== 2) fail(engine, lang, tag + ' /feedback', `expected 2 belt rows, found ${fb.tracks}`)
          if (!fb.badge) fail(engine, lang, tag + ' /feedback', 'video card badge missing')
        } else if (fb.tracks !== 0) {
          fail(engine, lang, tag + ' /feedback', 'empty state should have no belt')
        }
        if (vp.name === 'desktop' && motion === 'no-preference') {
          const dir = `qa/s13/${DUMMIES ? 'with-dummies' : 'final'}`
          mkdirSync(dir, { recursive: true })
          await f.screenshot({ path: `${dir}/${engine}-${lang}-feedback.png`, fullPage: true, timeout: 10000 }).catch(() => {})
        }
        if (ferrors.length) fail(engine, lang, tag + ' /feedback', 'pageerror: ' + ferrors.join(' | '))
        await f.close()
        await ctx.close()
      }
    }
  }
  await browser.close()
}

console.log(JSON.stringify({ base: BASE, dummies: DUMMIES, failures: failures.length }))
for (const f of failures) console.log(`FAIL [${f.engine} ${f.lang} ${f.where}] ${f.detail}`)
process.exit(failures.length ? 1 : 0)
