// Intro v2 verification matrix — the intro is SVG-heavy, exactly where WebKit
// has burned us before, so it runs the full 3-engine matrix:
//   webkit:   iPhone 14 Pro 393×852 @3x · iPhone SE 375×667 · desktop 1440×900
//   chromium: 412×915 · desktop 1440×900
//   firefox:  412×915 (no isMobile — unsupported) · desktop 1440×900
// × EN + AR. Asserts per combo:
//   · overlay + skip button visible; mascot svg has a nonzero bbox (not a box)
//   · act 2: speech-bubble lines match strings[lang] exactly (zero language
//     mixing), fully opaque; squiggle drawn; lockup settle mirrors in RTL
//   · sequence completes: overlay gone ≤ ~5.6s, hero revealed, eg_intro_seen set
//   · plays once per session (reload → no intro); fresh context replays
//   · Skip jumps straight to hero at any point
//   · reduced-motion: static composition, completes ~1.2s + fade
// Screenshots → qa/intro-v2/ + index.html. Usage: node qa/intro-v2.mjs [--base URL]
import { chromium, webkit, firefox } from 'playwright-core'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const BASE = process.argv.includes('--base')
  ? process.argv[process.argv.indexOf('--base') + 1]
  : 'http://localhost:4173'
const OUT = new URL('./intro-v2/', import.meta.url).pathname
mkdirSync(OUT, { recursive: true })
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'

const WELCOME = {
  en: ['Welcome to English Gate School.', 'Where learning English becomes a modern, joyful journey.'],
  ar: ['أهلاً بك في إنغلش جيت.', 'حيث يصبح تعلّم الإنجليزية رحلة عصرية وممتعة.'],
}
const AR_RE = /[؀-ۿ]/

const MATRIX = [
  ['webkit', 'iphone14pro', { viewport: { width: 393, height: 852 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true }],
  ['webkit', 'iphoneSE', { viewport: { width: 375, height: 667 }, isMobile: true, hasTouch: true }],
  ['webkit', 'desktop', { viewport: { width: 1440, height: 900 } }],
  ['chromium', 'mobile412', { viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true }],
  ['chromium', 'desktop', { viewport: { width: 1440, height: 900 } }],
  ['firefox', 'mobile412', { viewport: { width: 412, height: 915 } }], // firefox: no isMobile
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

    // ── main run: full sequence (anchor on DOM states, not wall clock —
    //    'load' fires late on asset-heavy pages and desynced the timeline) ──
    let ctx = await browser.newContext({ ...opts })
    let page = await freshPage(ctx, lang)
    await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' })
    const overlayUp = await page.waitForSelector('.intro-overlay', { timeout: 4000 }).then(() => true).catch(() => false)
    check(tag, 'intro overlay appears', overlayUp)
    if (overlayUp) {
      const act1 = await page.evaluate(() => {
        const svg = document.querySelector('.iv2-shield svg')
        const r = svg ? svg.getBoundingClientRect() : { width: 0, height: 0 }
        const skip = document.querySelector('.iv2-skip')
        const sr = skip ? skip.getBoundingClientRect() : { width: 0, height: 0 }
        return { mascot: r.width > 40 && r.height > 40, skip: sr.width >= 44 && sr.height >= 44 }
      })
      check(tag, 'mascot svg renders (nonzero bbox)', act1.mascot)
      check(tag, 'skip button visible + ≥44px', act1.skip)
      await page.waitForTimeout(1100)
      await page.screenshot({ path: join(OUT, `act1-${engine}-${vpName}-${lang}.png`) })
      shots.push({ file: `act1-${engine}-${vpName}-${lang}.png`, label: `act1 ${tag}` })
      // act 2: wait until both welcome lines are fully faded in (state-based —
      // fixed sleeps raced the line-2 animation on slower first-run browsers)
      await page.waitForFunction(() => {
        const l1 = document.querySelector('.iv2-line-1')
        const l2 = document.querySelector('.iv2-line-2')
        return l1 && l2 && getComputedStyle(l1).opacity === '1' && getComputedStyle(l2).opacity === '1'
      }, { timeout: 5000 }).catch(() => {})
      const act2 = await page.evaluate(() => {
        const l1 = document.querySelector('.iv2-line-1')
        const l2 = document.querySelector('.iv2-line-2')
        const sq = document.querySelector('.iv2-squiggle-path')
        const lockup = document.querySelector('.iv2-lockup')
        if (!l1 || !l2 || !lockup) return null
        const m = new DOMMatrixReadOnly(getComputedStyle(lockup).transform)
        return {
          t1: l1.textContent, o1: getComputedStyle(l1).opacity,
          t2: l2.textContent, o2: getComputedStyle(l2).opacity,
          squiggleDrawn: sq && getComputedStyle(sq).strokeDashoffset.startsWith('0'),
          settleX: m.e,
        }
      })
      check(tag, 'welcome line 1 exact + opaque', !!act2 && act2.t1 === WELCOME[lang][0] && act2.o1 === '1', act2 && `"${act2.t1}" o=${act2.o1}`)
      check(tag, 'welcome line 2 exact + opaque', !!act2 && act2.t2 === WELCOME[lang][1] && act2.o2 === '1', act2 && `"${act2.t2}" o=${act2.o2}`)
      if (act2) {
        const mixed = lang === 'en' ? AR_RE.test(act2.t1 + act2.t2) : !AR_RE.test(act2.t1 + act2.t2)
        check(tag, 'zero language mixing in welcome', !mixed)
        check(tag, 'squiggle underline drawn', !!act2.squiggleDrawn)
        check(tag, 'lockup settles toward start (RTL mirrored)', lang === 'ar' ? act2.settleX > 5 : act2.settleX < -5, `translateX=${act2 && act2.settleX}`)
      }
      await page.screenshot({ path: join(OUT, `act2-${engine}-${vpName}-${lang}.png`) })
      shots.push({ file: `act2-${engine}-${vpName}-${lang}.png`, label: `act2 ${tag}` })

      const goneInTime = await page
        .waitForSelector('.intro-overlay', { state: 'detached', timeout: 4500 })
        .then(() => true).catch(() => false)
      check(tag, 'overlay departs on schedule', goneInTime)
      const done = await page.evaluate(() => ({
        gone: !document.querySelector('.intro-overlay'),
        seen: (() => { try { return sessionStorage.getItem('eg_intro_seen') } catch { return null } })(),
        heroVisible: (() => {
          const h = document.querySelector('#hero')
          return h && getComputedStyle(h).visibility !== 'hidden'
        })(),
        pending: document.documentElement.classList.contains('intro-pending'),
      }))
      check(tag, 'sequence completes + hero revealed', done.gone && done.heroVisible && !done.pending, JSON.stringify(done))
      check(tag, 'eg_intro_seen set', done.seen === '1')
      const errs = page.errors.filter(e => !/favicon/i.test(e))
      check(tag, 'zero console errors during intro', errs.length === 0, errs.slice(0, 2).join(' | '))

      // ── plays once per session: reload the SAME context ──
      await page.reload({ waitUntil: 'load' })
      await page.waitForTimeout(700)
      const replayed = await page.evaluate(() => !!document.querySelector('.intro-overlay'))
      check(tag, 'does NOT replay after reload (same session)', !replayed)
    }
    await ctx.close()

    // ── fresh context (≈ incognito) replays + Skip works mid-act-1 ──
    ctx = await browser.newContext({ ...opts })
    page = await freshPage(ctx, lang)
    await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' })
    const replayUp = await page.waitForSelector('.intro-overlay', { timeout: 4000 }).then(() => true).catch(() => false)
    check(tag, 'replays in a fresh context', replayUp)
    if (replayUp) {
      await page.waitForTimeout(900)
      await page.click('.iv2-skip')
      const skipGone = await page
        .waitForSelector('.intro-overlay', { state: 'detached', timeout: 2600 })
        .then(() => true).catch(() => false)
      const seen = await page.evaluate(() => { try { return sessionStorage.getItem('eg_intro_seen') } catch { return null } })
      check(tag, 'Skip jumps straight to hero', skipGone && seen === '1', `gone=${skipGone} seen=${seen}`)
    }
    await ctx.close()
  }

  // ── reduced motion (once per engine, mobile-ish EN) ──
  const rmTag = `${engine} reduced-motion`
  const ctx = await browser.newContext({ ...MATRIX.find(m => m[0] === engine)[2], reducedMotion: 'reduce' })
  const page = await freshPage(ctx, 'en')
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' })
  const rmUp = await page.waitForSelector('.intro-overlay', { timeout: 4000 }).then(() => true).catch(() => false)
  check(rmTag, 'static intro appears', rmUp)
  if (rmUp) {
    await page.waitForTimeout(350)
    const rmState = await page.evaluate(() => {
      const l1 = document.querySelector('.iv2-line-1')
      const shield = document.querySelector('.iv2-shield')
      return {
        textShown: l1 && getComputedStyle(l1).opacity === '1',
        shieldShown: shield && getComputedStyle(shield).opacity === '1',
      }
    })
    check(rmTag, 'full composition visible immediately (no motion)', !!rmState.textShown && !!rmState.shieldShown, JSON.stringify(rmState))
    await page.screenshot({ path: join(OUT, `reduced-${engine}.png`) })
    shots.push({ file: `reduced-${engine}.png`, label: `reduced motion ${engine}` })
    const rmGone = await page
      .waitForSelector('.intro-overlay', { state: 'detached', timeout: 2600 })
      .then(() => true).catch(() => false)
    check(rmTag, 'completes ~1.2s + fade', rmGone)
  }
  await ctx.close()
  await browser.close()
}

const html = `<!doctype html><meta charset="utf-8"><title>Intro v2 QA — English Gate</title>
<style>body{font-family:system-ui;margin:24px;background:#f4f1ea;color:#233}.ok{color:#177245}.bad{color:#b00020}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:14px}
figure{margin:0;background:#fff;border:1px solid #ddd;border-radius:12px;padding:8px}
img{width:100%;height:auto;border-radius:8px;border:1px solid #eee}figcaption{font-size:12px;font-weight:700;margin-top:6px}</style>
<h1>Intro v2 — 3-engine matrix — ${new Date().toISOString().slice(0, 10)}</h1>
<p class="${failures.length ? 'bad' : 'ok'}">${failures.length ? failures.length + ' FAILURES' : 'ALL PASS: renders in webkit/chromium/firefox, EN+AR, RTL-mirrored, once-per-session, skippable, reduced-motion fallback.'}</p>
${failures.map(f => `<p class="bad">✗ ${f}</p>`).join('\n')}
<div class="grid">${shots.map(s => `<figure><a href="${s.file}"><img src="${s.file}" loading="lazy"></a><figcaption>${s.label}</figcaption></figure>`).join('\n')}</div>`
writeFileSync(join(OUT, 'index.html'), html)

console.log(`\n${shots.length} screenshots → qa/intro-v2/`)
if (failures.length) { console.error(`${failures.length} FAILURES`); process.exit(1) }
console.log('ALL INTRO V2 CHECKS PASSED')
