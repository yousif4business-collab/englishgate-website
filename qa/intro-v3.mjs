// Intro v3 "Through the Gate" verification — full 3-engine matrix (SVG + 3D
// transforms are WebKit's favourite failure modes, so webkit gets 3 configs):
//   webkit:   iPhone 14 Pro 393×852 @3x · iPhone SE 375×667 · desktop 1440×900
//   chromium: 412×915 · desktop 1440×900
//   firefox:  412×915 (no isMobile — unsupported) · desktop 1440×900
// × EN + AR. Asserts per combo:
//   · door panels have a real bbox while closed AND reach ~106° open
//     (computed matrix m11 ≈ cos106° ≈ −0.276)
//   · mascot svg renders in the gateway (nonzero bbox), skip always visible
//   · exact bilingual welcome (zero mixing); RTL squiggle mirror asserted via
//     computed transform matrix(-1,…)
//   · completes + hero revealed; NO-RESURRECTION: 6s idle after the natural
//     finish, overlay still absent (the v2 timer bug's regression test)
//   · once-per-session; fresh-context replay; skip-at-any-point; reduced
//     motion static frame; zero console errors
// Screenshots → qa/intro-v3/ + index.html. Usage: node qa/intro-v3.mjs [--base URL]
import { chromium, webkit, firefox } from 'playwright-core'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const BASE = process.argv.includes('--base')
  ? process.argv[process.argv.indexOf('--base') + 1]
  : 'http://localhost:4173'
const OUT = new URL('./intro-v3/', import.meta.url).pathname
mkdirSync(OUT, { recursive: true })
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'

const WELCOME = {
  en: 'Step into a modern world of learning English.',
  ar: 'ادخل إلى عالمٍ عصري لتعلّم الإنجليزية',
}
const AR_RE = /[؀-ۿ]/

const MATRIX = [
  ['webkit', 'iphone14pro', { viewport: { width: 393, height: 852 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true }],
  ['webkit', 'iphoneSE', { viewport: { width: 375, height: 667 }, isMobile: true, hasTouch: true }],
  ['webkit', 'desktop', { viewport: { width: 1440, height: 900 } }],
  ['chromium', 'mobile412', { viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true }],
  ['chromium', 'desktop', { viewport: { width: 1440, height: 900 } }],
  ['firefox', 'mobile412', { viewport: { width: 412, height: 915 } }],
  ['firefox', 'desktop', { viewport: { width: 1440, height: 900 } }],
]
const LAUNCH = {
  webkit: () => webkit.launch({ headless: true }),
  chromium: () => chromium.launch({ headless: true, ...(existsSync(CHROME) ? { executablePath: CHROME } : {}) }),
  firefox: () => firefox.launch({ headless: true }),
}

const failures = []
const shots = []
const check = (tag, name, ok, detail = '') => {
  if (!ok) failures.push(`[${tag}] ${name}${detail ? ` — ${detail}` : ''}`)
  console.log(`${ok ? '  ✓' : '  ✗ FAIL'} [${tag}] ${name}${detail && !ok ? ` — ${detail}` : ''}`)
}

async function freshPage(ctx, lang) {
  await ctx.addInitScript(l => { try { localStorage.setItem('eg_lang', l) } catch {} }, lang)
  const page = await ctx.newPage()
  const errors = []
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()) })
  page.errors = errors
  return page
}

for (const [engine, vpName, opts] of MATRIX) {
  const browser = await LAUNCH[engine]()
  for (const lang of ['en', 'ar']) {
    const tag = `${engine} ${vpName} ${lang}`

    // ── main run: anticipation → open → welcome → words → dissolve ──
    let ctx = await browser.newContext({ ...opts })
    let page = await freshPage(ctx, lang)
    await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' })
    const overlayUp = await page.waitForSelector('.intro-overlay', { timeout: 4000 }).then(() => true).catch(() => false)
    check(tag, 'intro overlay appears', overlayUp)
    if (overlayUp) {
      // beat 1: doors closed with a real bbox, emblem present, skip visible
      await page.waitForTimeout(450)
      const beat1 = await page.evaluate(() => {
        const dl = document.querySelector('.gv-door-l')
        const dr = document.querySelector('.gv-door-r')
        const rl = dl.getBoundingClientRect()
        const rr = dr.getBoundingClientRect()
        const skip = document.querySelector('.gv-skip').getBoundingClientRect()
        const emblem = document.querySelector('.gv-emblem')
        return {
          doorsBox: rl.width > 40 && rl.height > 100 && rr.width > 40 && rr.height > 100,
          emblemLoaded: emblem.complete && emblem.naturalWidth > 0,
          skip: skip.width >= 44 && skip.height >= 44,
        }
      })
      check(tag, 'door panels have real bbox (closed)', beat1.doorsBox)
      check(tag, 'shield emblem loaded on the seam', beat1.emblemLoaded)
      check(tag, 'skip button visible + ≥44px', beat1.skip)
      await page.screenshot({ path: join(OUT, `closed-${engine}-${vpName}-${lang}.png`) })
      shots.push({ file: `closed-${engine}-${vpName}-${lang}.png`, label: `beat1 ${tag}` })

      // beats 2–4: wait until the welcome line is fully in (state-based)
      await page.waitForFunction(() => {
        const w = document.querySelector('.gv-welcome')
        return w && getComputedStyle(w).opacity === '1'
      }, { timeout: 6000 }).catch(() => {})
      const full = await page.evaluate(() => {
        const dl = document.querySelector('.gv-door-l')
        const w = document.querySelector('.gv-welcome')
        const wm = document.querySelector('.gv-wordmark')
        const sqEl = document.querySelector('.gv-squiggle')
        const sqPath = document.querySelector('.gv-squiggle-path')
        const mascot = document.querySelector('.gv-mascot svg')
        if (!dl || !w || !mascot) return null
        const doorM = new DOMMatrixReadOnly(getComputedStyle(dl).transform)
        const sqM = new DOMMatrixReadOnly(getComputedStyle(sqEl).transform)
        const mr = mascot.getBoundingClientRect()
        const floats = [...document.querySelectorAll('.gv-float')].filter(f => getComputedStyle(f).opacity !== '0').length
        return {
          doorM11: +doorM.m11.toFixed(3),
          welcome: w.textContent,
          wordmark: wm.textContent,
          wordmarkOpacity: getComputedStyle(wm).opacity,
          squiggleMirrorA: +sqM.a.toFixed(2),
          squiggleDrawn: sqPath && getComputedStyle(sqPath).strokeDashoffset.startsWith('0'),
          mascotBox: mr.width > 60 && mr.height > 60,
          floats,
        }
      })
      check(tag, 'doors reach ~106° open (m11≈−0.276)', !!full && Math.abs(full.doorM11 - (-0.276)) < 0.05, full && `m11=${full.doorM11}`)
      check(tag, 'mascot svg renders in gateway', !!full && full.mascotBox)
      check(tag, 'welcome copy exact', !!full && full.welcome === WELCOME[lang], full && `"${full.welcome}"`)
      if (full) {
        const mixed = lang === 'en' ? AR_RE.test(full.welcome) : !AR_RE.test(full.welcome)
        check(tag, 'zero language mixing', !mixed)
        check(tag, 'wordmark shown', full.wordmark === 'English Gate School' && full.wordmarkOpacity === '1')
        check(tag, 'squiggle drawn + RTL mirror', full.squiggleDrawn && (lang === 'ar' ? full.squiggleMirrorA === -1 : full.squiggleMirrorA === 1), `a=${full.squiggleMirrorA}`)
        check(tag, '≤8 floating elements, visible', full.floats > 0 && full.floats <= 8, `floats=${full.floats}`)
      }
      await page.screenshot({ path: join(OUT, `open-${engine}-${vpName}-${lang}.png`) })
      shots.push({ file: `open-${engine}-${vpName}-${lang}.png`, label: `beats3-4 ${tag}` })

      // beat 5 + NO-RESURRECTION: overlay departs, stays gone through 6s idle
      const gone = await page
        .waitForSelector('.intro-overlay', { state: 'detached', timeout: 5500 })
        .then(() => true).catch(() => false)
      check(tag, 'overlay departs on schedule', gone)
      await page.waitForTimeout(6000)
      const after = await page.evaluate(() => ({
        stillGone: !document.querySelector('.intro-overlay'),
        pending: document.documentElement.classList.contains('intro-pending'),
        seen: (() => { try { return sessionStorage.getItem('eg_intro_seen') } catch { return null } })(),
        heroVisible: (() => {
          const h = document.querySelector('#hero')
          return h && getComputedStyle(h).visibility !== 'hidden'
        })(),
      }))
      check(tag, 'NO RESURRECTION after 6s idle', after.stillGone && !after.pending, JSON.stringify(after))
      check(tag, 'hero revealed + eg_intro_seen set', after.heroVisible && after.seen === '1')
      const errs = page.errors.filter(e => !/favicon/i.test(e))
      check(tag, 'zero console errors', errs.length === 0, errs.slice(0, 2).join(' | '))

      // once per session
      await page.reload({ waitUntil: 'domcontentloaded' })
      await page.waitForTimeout(700)
      check(tag, 'does NOT replay after reload', await page.evaluate(() => !document.querySelector('.intro-overlay')))
    }
    await ctx.close()

    // ── fresh context replays + skip at any point ──
    ctx = await browser.newContext({ ...opts })
    page = await freshPage(ctx, lang)
    await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' })
    const replayUp = await page.waitForSelector('.intro-overlay', { timeout: 4000 }).then(() => true).catch(() => false)
    check(tag, 'replays in a fresh context', replayUp)
    if (replayUp) {
      await page.waitForTimeout(800) // mid door-swing — the risky moment
      await page.click('.gv-skip')
      const skipGone = await page
        .waitForSelector('.intro-overlay', { state: 'detached', timeout: 2600 })
        .then(() => true).catch(() => false)
      // resurrection window for the old bug class: idle past every beat timer
      await page.waitForTimeout(4600)
      const still = await page.evaluate(() => !document.querySelector('.intro-overlay'))
      const seen = await page.evaluate(() => { try { return sessionStorage.getItem('eg_intro_seen') } catch { return null } })
      check(tag, 'Skip → hero, and STAYS gone', skipGone && still && seen === '1', `gone=${skipGone} still=${still} seen=${seen}`)
    }
    await ctx.close()
  }

  // ── reduced motion (once per engine) ──
  const rmTag = `${engine} reduced-motion`
  const ctx = await browser.newContext({ ...MATRIX.find(m => m[0] === engine)[2], reducedMotion: 'reduce' })
  const page = await freshPage(ctx, 'en')
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' })
  const rmUp = await page.waitForSelector('.intro-overlay', { timeout: 4000 }).then(() => true).catch(() => false)
  check(rmTag, 'static intro appears', rmUp)
  if (rmUp) {
    await page.waitForTimeout(350)
    const rm = await page.evaluate(() => {
      const w = document.querySelector('.gv-welcome')
      const m = document.querySelector('.gv-mascot')
      const d = document.querySelector('.gv-door-l')
      return {
        text: w && getComputedStyle(w).opacity === '1',
        mascot: m && getComputedStyle(m).opacity === '1',
        doorsHidden: d && getComputedStyle(d).opacity === '0',
      }
    })
    check(rmTag, 'static frame: open arch + mascot + words', !!rm.text && !!rm.mascot && !!rm.doorsHidden, JSON.stringify(rm))
    await page.screenshot({ path: join(OUT, `reduced-${engine}.png`) })
    shots.push({ file: `reduced-${engine}.png`, label: `reduced motion ${engine}` })
    check(rmTag, 'completes ~1.2s + fade', await page
      .waitForSelector('.intro-overlay', { state: 'detached', timeout: 2600 })
      .then(() => true).catch(() => false))
  }
  await ctx.close()
  await browser.close()
}

const html = `<!doctype html><meta charset="utf-8"><title>Intro v3 QA — Through the Gate</title>
<style>body{font-family:system-ui;margin:24px;background:#f4f1ea;color:#233}.ok{color:#177245}.bad{color:#b00020}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:14px}
figure{margin:0;background:#fff;border:1px solid #ddd;border-radius:12px;padding:8px}
img{width:100%;height:auto;border-radius:8px;border:1px solid #eee}figcaption{font-size:12px;font-weight:700;margin-top:6px}</style>
<h1>Intro v3 "Through the Gate" — 3-engine matrix — ${new Date().toISOString().slice(0, 10)}</h1>
<p class="${failures.length ? 'bad' : 'ok'}">${failures.length ? failures.length + ' FAILURES' : 'ALL PASS: 3D doors + mascot render in webkit/chromium/firefox, EN+AR, RTL mirror, once-per-session, skip, reduced motion, NO resurrection.'}</p>
${failures.map(f => `<p class="bad">✗ ${f}</p>`).join('\n')}
<div class="grid">${shots.map(s => `<figure><a href="${s.file}"><img src="${s.file}" loading="lazy"></a><figcaption>${s.label}</figcaption></figure>`).join('\n')}</div>`
writeFileSync(join(OUT, 'index.html'), html)

console.log(`\n${shots.length} screenshots → qa/intro-v3/`)
if (failures.length) { console.error(`${failures.length} FAILURES`); process.exit(1) }
console.log('ALL INTRO V3 CHECKS PASSED')
