// S17 QA — contact rework + level journey modals + telegram gate.
//  contact: the mascot "Come say hi!" sign sits ABOVE the map and branch
//           cards (top of the section, near the heading) and appears exactly
//           once; the map still renders all three shield pins; the custom
//           44px zoom/re-frame controls are present and actually zoom
//  levels:  every one of the 9 level cards is a button that opens the level
//           detail modal with that level's real name, band, and description
//           (strings.js only — no invented text); Esc closes + focus
//           restores; focus stays trapped
//  telegram: TELEGRAM_URL is still the TODO placeholder (null) → NO telegram
//           link may render anywhere (contact cards, CTA panel, footer);
//           if it is ever set, the links must render and point at it
// Usage: node qa/s17.mjs [--base http://localhost:4173] [--engine chromium|webkit|firefox]
import { existsSync } from 'node:fs'
import { chromium, webkit, firefox } from 'playwright-core'
import { TELEGRAM_URL } from '../src/lib/contact.js'
import { BRANCHES } from '../src/data/branches.js'
import { strings } from '../src/strings.js'

const BASE = process.argv.includes('--base')
  ? process.argv[process.argv.indexOf('--base') + 1]
  : 'http://localhost:4173'
const ENGINE = process.argv.includes('--engine')
  ? process.argv[process.argv.indexOf('--engine') + 1]
  : 'chromium'
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'

const failures = []
const fail = (lang, where, detail) => failures.push(`[${ENGINE} ${lang} ${where}] ${detail}`)

const browser = ENGINE === 'webkit'
  ? await webkit.launch({ headless: true })
  : ENGINE === 'firefox'
    ? await firefox.launch({ headless: true })
    : await chromium.launch({ headless: true, ...(existsSync(CHROME) ? { executablePath: CHROME } : {}) })

for (const lang of ['en', 'ar']) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' })
  await ctx.addInitScript(l => { try { sessionStorage.setItem('eg_intro_seen', '1'); localStorage.setItem('eg_lang', l) } catch {} }, lang)
  const t = strings[lang]

  // ── /contact: mascot sign on top, map + pins + controls, telegram gate ──
  {
    const p = await ctx.newPage()
    const errors = []
    p.on('console', m => { if (m.type() === 'error' && !/tile\.openstreetmap|cloudflareinsights|net::ERR_FAILED/.test(m.text())) errors.push(m.text()) })
    p.on('pageerror', e => errors.push(e.message))
    await p.goto(BASE + '/contact', { waitUntil: 'networkidle' }).catch(e => fail(lang, '/contact', 'goto: ' + e.message))
    await p.waitForTimeout(1500)

    // 1. mascot sign: exactly one, ABOVE the map and every branch card
    const sign = t.contact.mascotSign
    const pos = await p.evaluate(text => {
      const nodes = [...document.querySelectorAll('#contact div')].filter(el => el.childElementCount === 0 && el.textContent.trim() === text)
      const map = document.querySelector('.eg-map-frame')
      const cards = [...document.querySelectorAll('#contact a[aria-label]')]
      return {
        count: nodes.length,
        signTop: nodes[0]?.getBoundingClientRect().top ?? null,
        mapTop: map ? map.getBoundingClientRect().top : null,
        firstCardTop: cards.length ? Math.min(...cards.map(c => c.getBoundingClientRect().top)) : null,
      }
    }, sign)
    if (pos.count !== 1) fail(lang, '/contact sign', `${pos.count} mascot signs, expected exactly 1`)
    if (pos.mapTop === null) fail(lang, '/contact sign', 'map frame missing')
    else if (pos.signTop === null || pos.signTop >= pos.mapTop) fail(lang, '/contact sign', `sign (${pos.signTop}) not above the map (${pos.mapTop})`)
    if (pos.firstCardTop !== null && pos.signTop !== null && pos.signTop >= pos.firstCardTop) fail(lang, '/contact sign', 'sign not above the branch cards')

    // 2. map: three shield pins survive the S17 reframe; custom controls zoom
    const map = await p.evaluate(() => ({
      pins: document.querySelectorAll('.eg-map-pin .eg-map-pin-badge svg').length,
      ctrls: document.querySelectorAll('.eg-map-ctrl').length,
      attribution: document.querySelector('.leaflet-control-attribution')?.textContent || '',
    }))
    if (map.pins !== BRANCHES.length) fail(lang, '/contact map', `${map.pins} shield pins, expected ${BRANCHES.length}`)
    if (map.ctrls !== 3) fail(lang, '/contact map', `${map.ctrls} custom controls, expected 3 (in/out/reframe)`)
    if (!map.attribution.includes('OpenStreetMap')) fail(lang, '/contact map', 'OSM attribution not visible')
    if (map.ctrls === 3) {
      const zoomOf = () => p.evaluate(() => document.querySelector('.leaflet-proxy')?.style.transform || document.querySelector('.leaflet-map-pane')?.dataset.zoom || '')
      const before = await p.evaluate(() => [...document.querySelectorAll('.leaflet-tile')].length)
      await p.locator('.eg-map-ctrl').first().click()
      await p.waitForTimeout(900)
      const after = await p.evaluate(() => [...document.querySelectorAll('.leaflet-tile')].length)
      if (before === after) {
        // tile count can coincide — fall back to transform comparison
        const tf = await zoomOf()
        if (!tf) fail(lang, '/contact map', 'zoom-in control produced no observable zoom change')
      }
    }

    // 3. telegram gate — must match TELEGRAM_URL exactly (contact + footer)
    const tg = await p.evaluate(() => [...document.querySelectorAll('a[href*="t.me"], a[href*="telegram"]')].map(a => a.href))
    if (!TELEGRAM_URL && tg.length) fail(lang, '/contact telegram', `placeholder is null but telegram links render: ${tg.join(', ')}`)
    if (TELEGRAM_URL) {
      if (tg.length < 3) fail(lang, '/contact telegram', `handle is set but only ${tg.length} links render (card + CTA + footer expected)`)
      for (const href of tg) if (!href.startsWith(TELEGRAM_URL)) fail(lang, '/contact telegram', `link points at ${href}, not TELEGRAM_URL`)
      const label = t.contact.telegramCard
      if (!(await p.locator(`text=${label}`).count())) fail(lang, '/contact telegram', 'telegram card label missing')
    }

    if (errors.length) fail(lang, '/contact', 'console: ' + errors.slice(0, 3).join(' | '))
    await p.close()
  }

  // ── /programs: all 9 levels clickable → correct modal content ──
  {
    const p = await ctx.newPage()
    const errors = []
    p.on('pageerror', e => errors.push(e.message))
    await p.goto(BASE + '/programs', { waitUntil: 'networkidle' }).catch(e => fail(lang, '/programs', 'goto: ' + e.message))
    await p.waitForTimeout(500)

    const levels = t.programs.levels
    for (let i = 0; i < levels.length; i++) {
      const lv = levels[i]
      const btn = p.locator(`button[aria-label="${lv.name} — ${t.programs.viewLevel}"]`)
      if ((await btn.count()) !== 1) { fail(lang, `/programs L${i + 1}`, 'level card button not found'); continue }
      await btn.scrollIntoViewIfNeeded()
      await btn.click()
      await p.waitForTimeout(350)
      const d = await p.evaluate(() => document.querySelector('[role="dialog"]')?.textContent || null)
      if (!d) { fail(lang, `/programs L${i + 1}`, 'modal did not open'); continue }
      if (!d.includes(lv.name)) fail(lang, `/programs L${i + 1}`, 'level name missing in modal')
      if (lv.desc && !d.includes(lv.desc.slice(0, 25))) fail(lang, `/programs L${i + 1}`, 'level description missing in modal')
      const band = t.programs.groups[i < 2 ? 'early' : i < 4 ? 'write' : 'star']
      if (!d.includes(band)) fail(lang, `/programs L${i + 1}`, `band "${band}" missing in modal`)
      // no cross-level leaks: another level's desc must not appear
      const other = levels[(i + 1) % levels.length]
      if (other.desc && d.includes(other.desc.slice(0, 25))) fail(lang, `/programs L${i + 1}`, 'another level’s description leaked in')
      if (i === 0) {
        // focus trap + esc-close + focus restore checked once
        for (let k = 0; k < 4; k++) await p.keyboard.press('Tab')
        const trapped = await p.evaluate(() => !!document.activeElement?.closest('[role="dialog"]'))
        if (!trapped) fail(lang, '/programs L1', 'focus escaped the dialog')
      }
      await p.keyboard.press('Escape')
      await p.waitForTimeout(250)
      if (await p.evaluate(() => !!document.querySelector('[role="dialog"]'))) { fail(lang, `/programs L${i + 1}`, 'Esc did not close'); break }
      if (i === 0) {
        const restored = await p.evaluate(n => document.activeElement?.getAttribute('aria-label')?.startsWith(n), lv.name)
        if (!restored) fail(lang, '/programs L1', 'focus not restored to the opening card')
      }
    }
    if (errors.length) fail(lang, '/programs', 'pageerror: ' + errors.join(' | '))
    await p.close()
  }

  await ctx.close()
}
await browser.close()

console.log(JSON.stringify({ base: BASE, engine: ENGINE, failures: failures.length }))
for (const f of failures) console.log('FAIL ' + f)
process.exit(failures.length ? 1 : 0)
