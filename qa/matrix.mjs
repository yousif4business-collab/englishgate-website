// Responsive QA matrix — every page × EN/AR × 7 viewports.
// Drives the installed Google Chrome via playwright-core (no browser download).
// Usage: node qa/matrix.mjs [--screens] [--base http://localhost:5177]
import { chromium } from 'playwright-core'
import { mkdirSync, writeFileSync } from 'node:fs'

const BASE = process.argv.includes('--base')
  ? process.argv[process.argv.indexOf('--base') + 1]
  : 'http://localhost:5177'
const SCREENS = process.argv.includes('--screens')

// S38q: /placement added — it carries a form, so tap-target and tiny-text
// cover across the seven viewports matters more here than on a prose page.
const PAGES = ['/', '/about', '/programs', '/placement', '/staff', '/testimonials', '/moments', '/workshop', '/contact', '/faq', '/careers', '/terms', '/privacy', '/cookies']
const LANGS = ['en', 'ar']
const VIEWPORTS = [
  { name: '360x800', width: 360, height: 800, dsf: 2, mobile: true },
  { name: '375x667', width: 375, height: 667, dsf: 2, mobile: true },
  { name: '390x844', width: 390, height: 844, dsf: 3, mobile: true },
  { name: '430x932', width: 430, height: 932, dsf: 3, mobile: true },
  { name: '768x1024', width: 768, height: 1024, dsf: 2, mobile: true },
  { name: '834x1194', width: 834, height: 1194, dsf: 2, mobile: true },
  { name: '1024x768', width: 1024, height: 768, dsf: 2, mobile: false },
]

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const browser = await chromium.launch({ executablePath: CHROME, headless: true })
const failures = []
let checks = 0

function fail(page, lang, vp, rule, detail) {
  failures.push({ page, lang, vp, rule, detail: String(detail).slice(0, 500) })
}

for (const lang of LANGS) {
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    locale: lang === 'ar' ? 'ar-IQ' : 'en-US',
    hasTouch: true,
    reducedMotion: 'reduce', // deterministic layout: no mid-animation captures
  })
  await ctx.addInitScript(l => {
    try { sessionStorage.setItem('eg_intro_seen', '1'); localStorage.setItem('eg_lang', l) } catch {}
  }, lang)

  for (const path of PAGES) {
    const pg = await ctx.newPage()
    const consoleErrors = []
    const bad = []
    // The Cloudflare Insights beacon CORS-fails on localhost only (it is served
    // same-origin in production) — a known dev-only artifact, not a site bug.
    // tile.openstreetmap: third-party tile-server hiccups (429/503) are not
    // site bugs either (S16 contact map).
    const DEV_ONLY = /cloudflareinsights|net::ERR_FAILED|maps\.google|google\.com\/maps|tile\.openstreetmap|status of 502/
    pg.on('console', m => { if (m.type() === 'error' && !DEV_ONLY.test(m.text())) consoleErrors.push(m.text()) })
    pg.on('response', r => { if (r.status() >= 400 && !DEV_ONLY.test(r.url())) bad.push(`${r.status()} ${r.url()}`) })

    await pg.goto(BASE + path, { waitUntil: 'networkidle' }).catch(e => fail(path, lang, '-', 'goto', e.message))

    for (const vp of VIEWPORTS) {
      await pg.setViewportSize({ width: vp.width, height: vp.height })
      await pg.waitForTimeout(220)
      checks++

      // 1. Horizontal overflow + offender list
      const overflow = await pg.evaluate(() => {
        const docW = document.documentElement.scrollWidth
        const winW = window.innerWidth
        if (docW <= winW + 1) return null
        const offenders = []
        for (const el of document.querySelectorAll('body *')) {
          const r = el.getBoundingClientRect()
          if (r.width > 0 && (r.right > winW + 1 || r.left < -1) && r.width <= docW) {
            const sel = el.tagName.toLowerCase() +
              (el.id ? `#${el.id}` : '') +
              (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).slice(0, 3).join('.') : '')
            offenders.push(`${sel} w=${Math.round(r.width)} right=${Math.round(r.right)}`)
          }
          if (offenders.length >= 8) break
        }
        return { docW, winW, offenders }
      })
      if (overflow) fail(path, lang, vp.name, 'h-overflow', `${overflow.docW}>${overflow.winW} :: ${overflow.offenders.join(' | ')}`)

      // 3+4. Tap targets and text size (buttons/links with an accessible role)
      const sizes = await pg.evaluate(() => {
        const small = []
        const tiny = []
        for (const el of document.querySelectorAll('a,button,[role="button"],input,select')) {
          const r = el.getBoundingClientRect()
          if (r.width === 0 || r.height === 0) continue // hidden
          const st = getComputedStyle(el)
          if (st.visibility === 'hidden' || st.display === 'none') continue
          // Effective hit area may extend via padding on parent; use rect as-is.
          if ((r.width < 44 || r.height < 44) && !(r.height >= 40 && r.width >= 60)) {
            small.push(`${el.tagName.toLowerCase()}.${String(el.className).trim().split(/\s+/)[0] || ''} ${Math.round(r.width)}x${Math.round(r.height)} "${(el.textContent || el.getAttribute('aria-label') || '').trim().slice(0, 24)}"`)
          }
        }
        if (window.innerWidth < 700) {
          for (const el of document.querySelectorAll('p,li,span')) {
            const r = el.getBoundingClientRect()
            if (r.width === 0 || !el.textContent.trim() || el.children.length) continue
            const fs = parseFloat(getComputedStyle(el).fontSize)
            if (fs < 12) tiny.push(`${el.tagName}:${fs}px "${el.textContent.trim().slice(0, 24)}"`)
            if (tiny.length >= 5) break
          }
        }
        return { small: small.slice(0, 10), tiny }
      })
      if (sizes.small.length && vp.mobile) fail(path, lang, vp.name, 'tap-target', sizes.small.join(' | '))
      if (sizes.tiny.length) fail(path, lang, vp.name, 'tiny-text', sizes.tiny.join(' | '))

      if (SCREENS) {
        const dir = `qa/screens/${lang}`
        mkdirSync(dir, { recursive: true })
        await pg.screenshot({ path: `${dir}/${path === '/' ? 'home' : path.slice(1)}_${vp.name}.png`, timeout: 10000 })
          .catch(e => fail(path, lang, vp.name, 'screenshot', e.message.split('\n')[0]))
      }
    }

    // 2. Mobile nav drawer (at phone size)
    await pg.setViewportSize({ width: 390, height: 844 })
    await pg.waitForTimeout(150)
    try {
      const burger = pg.locator('button[aria-label="Open menu"]')
      await burger.click({ timeout: 8000 })
      await pg.waitForTimeout(350)
      const open = await pg.evaluate(() => ({
        expanded: !!document.querySelector('button[aria-expanded="true"]'),
        locked: document.body.style.overflow === 'hidden',
        // The drawer is a fixed 100dvh overlay OUTSIDE <header> since S8 (iOS
        // solid-background fix) — count the links inside the open overlay.
        links: (() => {
          const overlay = [...document.querySelectorAll('div')].find(d => d.style.height === '100dvh')
          if (!overlay) return 0
          return [...overlay.querySelectorAll('a[href^="/"]')].filter(a => a.getBoundingClientRect().height > 0).length
        })(),
      }))
      if (!open.expanded) fail(path, lang, '390', 'nav-open', 'drawer did not open')
      if (!open.locked) fail(path, lang, '390', 'nav-scroll-lock', 'body scroll not locked')
      if (open.links < 7) fail(path, lang, '390', 'nav-links', `only ${open.links} links reachable`)
      await pg.locator('button[aria-label="Close menu"]').click({ timeout: 3000 })
      await pg.waitForTimeout(250)
      const stillLocked = await pg.evaluate(() => document.body.style.overflow === 'hidden')
      if (stillLocked) fail(path, lang, '390', 'nav-close', 'scroll still locked after close')
    } catch (e) { fail(path, lang, '390', 'nav', e.message) }

    // 5. Videos: poster attribute + tap-to-play overlay (first video only)
    const vids = await pg.evaluate(() => [...document.querySelectorAll('video')].map(v => ({
      poster: v.getAttribute('poster'), preload: v.getAttribute('preload'),
      fits: v.getBoundingClientRect().width <= window.innerWidth + 1,
    })))
    for (const v of vids) {
      // S27: preload="metadata" is the policy now (duration + first frames
      // buffer up front so mobile starts fast; poster still covers the box).
      if (v.preload !== 'metadata') fail(path, lang, '390', 'video-preload', JSON.stringify(v))
      if (!v.fits) fail(path, lang, '390', 'video-overflow', JSON.stringify(v))
    }
    if (vids.length) {
      try {
        // S38s: this matched ENGLISH labels only. On an AR page whose play
        // button is properly localized it matched nothing and the check died
        // on a scrollIntoView timeout instead of exercising the tap. Both
        // languages now, so the check actually runs in AR.
        const playBtn = pg.locator([
          'button[aria-label^="Play video"]', 'button[aria-label^="Play"]',
          'button[aria-label^="\u0634\u063a\u0651\u0644"]',   // شغّل
          'button[aria-label^="\u062a\u0634\u063a\u064a\u0644"]', // تشغيل
        ].join(', ')).first()
        await playBtn.scrollIntoViewIfNeeded({ timeout: 5000 })
        await pg.waitForTimeout(350)
        try {
          await playBtn.tap({ timeout: 4000 })
        } catch {
          // Actionability flake (decorations overlapping the hit-test point):
          // raw touch at the element centre is still a genuine tap.
          const bb = await playBtn.boundingBox()
          await pg.touchscreen.tap(bb.x + bb.width / 2, bb.y + bb.height / 2)
        }
        await pg.waitForTimeout(600)
        const playing = await pg.evaluate(() => [...document.querySelectorAll('video')].some(v => v.controls))
        if (!playing) fail(path, lang, '390', 'video-tap', 'tap did not start playback/controls')
      } catch (e) { fail(path, lang, '390', 'video-tap', e.message) }
    }

    // 8. Console errors + request failures (collected across the whole visit)
    if (consoleErrors.length) fail(path, lang, '*', 'console', consoleErrors.slice(0, 3).join(' | '))
    if (bad.length) fail(path, lang, '*', 'http', [...new Set(bad)].slice(0, 4).join(' | '))

    await pg.close()
  }
  await ctx.close()
}

await browser.close()

const summary = { checks, pages: PAGES.length, langs: 2, viewports: VIEWPORTS.length, failures: failures.length }
console.log(JSON.stringify(summary))
for (const f of failures) console.log(`FAIL [${f.lang} ${f.page} @${f.vp}] ${f.rule}: ${f.detail}`)
writeFileSync('qa/matrix-results.json', JSON.stringify({ summary, failures }, null, 2))
process.exit(failures.length ? 1 : 0)
