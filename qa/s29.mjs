// S29 acceptance — Arabic default, intro v4, mascot presence, chat pacing.
//  1. ARABIC DEFAULT   fresh visitor (no eg_lang) lands on lang=ar dir=rtl;
//                      a saved 'en' choice still wins on the next load
//  2. INTRO V3         fresh session: the gate-opening intro plays (doors,
//                      emblem, mascot, welcome line) — the S29 redesign was
//                      reverted by owner decision; finishes on its own and
//                      never returns within the session; skip works
//                      immediately; reduced-motion shows the static frame
//  3. MASCOTS          the new placements render: home journey + CTA
//                      (desktop) and the contact-map pointer
//  4. CHAT PACING      answers no longer land instantly: typing indicator
//                      shows, first line arrives after a natural delay
// Usage: node qa/s29.mjs [--base http://localhost:4173]
import { existsSync } from 'node:fs'
import { chromium } from 'playwright-core'

const BASE = process.argv.includes('--base')
  ? process.argv[process.argv.indexOf('--base') + 1]
  : 'http://localhost:4173'
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'

const failures = []
const check = (name, ok, detail = '') => {
  console.log(`${ok ? '  ✓' : '  ✗ FAIL'} ${name}${!ok && detail ? ` — ${detail}` : ''}`)
  if (!ok) failures.push(name)
}

const browser = await chromium.launch({ headless: true, ...(existsSync(CHROME) ? { executablePath: CHROME } : {}) })

// ── 1. Arabic is the default for a fresh visitor ─────────────────────────────
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  // fresh visitor: NO eg_lang; skip the intro so the page settles fast
  await ctx.addInitScript(() => { try { sessionStorage.setItem('eg_intro_seen', '1') } catch {} })
  const p = await ctx.newPage()
  await p.goto(BASE + '/', { waitUntil: 'networkidle' })
  const state = await p.evaluate(() => ({
    lang: document.documentElement.getAttribute('lang'),
    dir: document.documentElement.getAttribute('dir'),
    heroArabic: /[؀-ۿ]/.test(document.querySelector('h1')?.textContent || ''),
  }))
  check('fresh load lands on Arabic (lang=ar)', state.lang === 'ar', `lang=${state.lang}`)
  check('fresh load is RTL (dir=rtl)', state.dir === 'rtl', `dir=${state.dir}`)
  check('hero headline renders in Arabic', state.heroArabic)
  await ctx.close()
}

// ── 1b. a returning visitor's saved choice still wins ────────────────────────
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  await ctx.addInitScript(() => { try { sessionStorage.setItem('eg_intro_seen', '1'); localStorage.setItem('eg_lang', 'en') } catch {} })
  const p = await ctx.newPage()
  await p.goto(BASE + '/', { waitUntil: 'networkidle' })
  const lang = await p.evaluate(() => document.documentElement.getAttribute('lang'))
  check("saved 'en' choice survives reload", lang === 'en', `lang=${lang}`)
  await ctx.close()
}

// ── 2. Intro v3 "Through the Gate" — full play-through on a fresh session ────
// (S29's intro redesign was REVERTED by owner decision — the gate-opening
// intro is the intended one; these checks pin it.)
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const p = await ctx.newPage()
  // domcontentloaded: on a slow LIVE origin the default wait outlives the
  // short intro — probe as soon as the DOM is up
  await p.goto(BASE + '/', { waitUntil: 'domcontentloaded' })
  check('intro overlay mounts on a fresh session', await p.locator('.intro-overlay.iv3').count() === 1)
  check('intro shows the gate (two doors) + real emblem', await p.locator('.gv-door').count() === 2 && await p.locator('.gv-emblem').count() === 1)
  await p.waitForTimeout(3300) // mascot rises ~1.95s, welcome mounts ~2.95s
  const welcome = await p.locator('.gv-welcome').textContent().catch(() => '')
  check('welcome line appears (AR default)', (welcome || '').includes('ادخل إلى عالمٍ عصري'), welcome)
  const mascotVisible = await p.locator('.gv-mascot .mascot').count()
  check('mascot rises through the gate', mascotVisible === 1)
  // auto-finish: overlay gone by ~5.1s total
  await p.waitForSelector('.intro-overlay', { state: 'detached', timeout: 4000 })
  check('intro finishes on its own (~5.1s)', true)
  const seen = await p.evaluate(() => sessionStorage.getItem('eg_intro_seen'))
  check('eg_intro_seen recorded', seen === '1')
  await p.reload({ waitUntil: 'networkidle' })
  check('intro does NOT replay within the session', await p.locator('.intro-overlay').count() === 0)
  await ctx.close()
}

// ── 2b. skip works immediately ────────────────────────────────────────────────
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const p = await ctx.newPage()
  // domcontentloaded: on a slow LIVE origin the default wait outlives the
  // short intro — probe as soon as the DOM is up
  await p.goto(BASE + '/', { waitUntil: 'domcontentloaded' })
  await p.locator('.gv-skip').click()
  await p.waitForSelector('.intro-overlay', { state: 'detached', timeout: 1500 })
  check('skip dismisses the intro immediately', true)
  await ctx.close()
}

// ── 2c. reduced-motion static fallback ────────────────────────────────────────
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' })
  const p = await ctx.newPage()
  // domcontentloaded: on a slow LIVE origin the default wait outlives the
  // short intro — probe as soon as the DOM is up
  await p.goto(BASE + '/', { waitUntil: 'domcontentloaded' })
  const staticFrame = await p.evaluate(() => {
    const w = document.querySelector('.gv-welcome')
    return w ? getComputedStyle(w).opacity : 'missing'
  })
  check('reduced-motion composes the static frame immediately', staticFrame === '1', `opacity=${staticFrame}`)
  await p.waitForSelector('.intro-overlay', { state: 'detached', timeout: 3000 })
  check('reduced-motion intro fades out (~1.2s)', true)
  await ctx.close()
}

// ── 3. mascot presence — new placements ───────────────────────────────────────
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  await ctx.addInitScript(() => { try { sessionStorage.setItem('eg_intro_seen', '1'); localStorage.setItem('eg_lang', 'ar') } catch {} })
  const p = await ctx.newPage()
  await p.goto(BASE + '/', { waitUntil: 'networkidle' })
  const homeCount = await p.locator('.mascot').count()
  check('home carries the mascot in 3+ spots (journey, CTA, belt…)', homeCount >= 3, `count=${homeCount}`)
  await p.goto(BASE + '/contact', { waitUntil: 'networkidle' })
  await p.locator('.leaflet-container').first().scrollIntoViewIfNeeded().catch(() => {})
  await p.waitForTimeout(600)
  const mapMascot = await p.locator('.reveal-item:has(.leaflet-container) .mascot').count()
  check('contact-map pointer mascot renders', mapMascot >= 1, `count=${mapMascot}`)
  await ctx.close()
}

// ── 4. chat pacing — typing indicator + natural reveal delay ─────────────────
{
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  await ctx.addInitScript(() => { try { sessionStorage.setItem('eg_intro_seen', '1'); localStorage.setItem('eg_lang', 'ar') } catch {} })
  const p = await ctx.newPage()
  await p.goto(BASE + '/', { waitUntil: 'networkidle' })
  await p.locator('.asst-fab').click()
  await p.locator('.asst-panel').waitFor({ timeout: 3000 })
  const t0 = Date.now()
  // first topic chip lives in the choices row (NOT the header close button)
  await p.locator('.asst-panel .flex-wrap button').first().click()
  await p.waitForTimeout(250)
  // real bot bubbles carry a <p>; the typing indicator is spans only
  const early = await p.evaluate(() => ({
    typing: !!document.querySelector('.asst-dot'),
    bots: [...document.querySelectorAll('.asst-panel .asst-msg')].filter(x => !x.className.includes('justify-end') && x.querySelector('p')).length,
  }))
  check('typing indicator appears right after asking', early.typing)
  check('answer does NOT land instantly (250ms)', early.bots === 0, `bot bubbles=${early.bots}`)
  // first line should arrive within a natural window (0.7–4s)
  const arrived = await p
    .waitForFunction(
      () => [...document.querySelectorAll('.asst-panel .asst-msg')].filter(x => !x.className.includes('justify-end') && x.querySelector('p')).length > 0,
      undefined,
      { timeout: 5000 }
    )
    .then(() => true)
    .catch(() => false)
  const firstAt = Date.now() - t0
  check('first line arrives at a natural pace (≥600ms)', arrived && firstAt >= 600, arrived ? `${firstAt}ms` : 'never arrived')
  await ctx.close()
}

await browser.close()
console.log(failures.length ? `${failures.length} FAILURES` : 'ALL S29 CHECKS PASSED')
process.exit(failures.length ? 1 : 0)
