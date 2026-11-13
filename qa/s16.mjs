// S16 QA — story modals + branch map.
//  modals: every card opens the dialog; Esc closes + focus restores; focus
//          stays trapped; bio-less teachers show ONLY the coming-soon state
//          (no invented text, no video slot); anonymous wall/belt photos open
//          as a nameless lightbox (no roster name leaks)
//  map:    all three branches render the custom EG shield pin + per-mode
//          name label; OSM attribution visible; zero console errors
// Usage: node qa/s16.mjs [--base http://localhost:4173] [--engine chromium|webkit]
import { existsSync } from 'node:fs'
import { chromium, webkit } from 'playwright-core'
import { teachers } from '../src/data/staff.js'
import { BRANCHES } from '../src/data/branches.js'

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
  : await chromium.launch({ headless: true, ...(existsSync(CHROME) ? { executablePath: CHROME } : {}) })

const haider = teachers.find(t => t.id === 'haider-ali-nasser')
const bioless = teachers.find(t => !t.bio_en && !t.bio_ar)

for (const lang of ['en', 'ar']) {
  // reduced motion: reveal states are static and the home grid replaces the
  // moving belt — deterministic clicking
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' })
  await ctx.addInitScript(l => { try { sessionStorage.setItem('eg_intro_seen', '1'); localStorage.setItem('eg_lang', l) } catch {} }, lang)
  const soon = lang === 'en' ? 'Coming soon' : 'قريباً'
  const names = teachers.map(t => (lang === 'en' ? t.name_en : t.name_ar))

  const dialogState = p => p.evaluate(() => {
    const d = document.querySelector('[role="dialog"]')
    if (!d) return null
    return {
      text: d.textContent,
      video: !!d.querySelector('video'),
      bigImg: d.querySelector('img[src*="-1200"]')?.getAttribute('src') || null,
    }
  })

  // ── /staff: full modal (Haider), coming-soon modal, anonymous wall modal ──
  {
    const p = await ctx.newPage()
    const errors = []
    p.on('pageerror', e => errors.push(e.message))
    await p.goto(BASE + '/staff', { waitUntil: 'networkidle' }).catch(e => fail(lang, '/staff', 'goto: ' + e.message))
    await p.waitForTimeout(400)

    // 1. Haider — named modal with real bio, no video (videoUrl null)
    const hName = lang === 'en' ? haider.name_en : haider.name_ar
    const hBio = (lang === 'en' ? haider.bio_en : haider.bio_ar).slice(0, 30)
    await p.locator(`button:has-text("${hName}")`).first().click()
    await p.waitForTimeout(400)
    let d = await dialogState(p)
    if (!d) fail(lang, '/staff haider', 'dialog did not open')
    else {
      if (!d.text.includes(hBio)) fail(lang, '/staff haider', 'bio text missing in modal')
      if (d.video) fail(lang, '/staff haider', 'video rendered though videoUrl is null')
      if (!d.bigImg) fail(lang, '/staff haider', 'large photo missing in modal')
    }
    // focus trap: Tab a few times, focus must stay inside the dialog
    for (let i = 0; i < 5; i++) await p.keyboard.press('Tab')
    const trapped = await p.evaluate(() => !!document.activeElement?.closest('[role="dialog"]'))
    if (!trapped) fail(lang, '/staff haider', 'focus escaped the dialog')
    await p.keyboard.press('Escape')
    await p.waitForTimeout(300)
    if (await p.evaluate(() => !!document.querySelector('[role="dialog"]'))) fail(lang, '/staff haider', 'Esc did not close')
    const restored = await p.evaluate(n => document.activeElement?.textContent?.includes(n), hName)
    if (!restored) fail(lang, '/staff haider', 'focus not restored to the opening card')

    // 2. bio-less teacher — coming-soon state only, no video, no leaked text
    const bName = lang === 'en' ? bioless.name_en : bioless.name_ar
    await p.locator(`button:has-text("${bName}")`).first().click()
    await p.waitForTimeout(400)
    d = await dialogState(p)
    if (!d) fail(lang, '/staff bioless', 'dialog did not open')
    else {
      if (!d.text.includes(soon)) fail(lang, '/staff bioless', `"${soon}" state missing`)
      if (d.video) fail(lang, '/staff bioless', 'video rendered though videoUrl is null')
      if (d.text.includes(hBio)) fail(lang, '/staff bioless', 'another teacher’s bio leaked into the modal')
    }
    await p.keyboard.press('Escape')
    await p.waitForTimeout(300)

    // 3. anonymous wall photo — nameless lightbox, zero roster names
    const anonBtns = p.locator(`button[aria-label="${lang === 'en' ? 'A photo of our team' : 'صورة من فريقنا'}"]`)
    if ((await anonBtns.count()) === 0) fail(lang, '/staff wall', 'no anonymous wall cards found')
    else {
      await anonBtns.first().scrollIntoViewIfNeeded()
      await anonBtns.first().click()
      await p.waitForTimeout(400)
      d = await dialogState(p)
      if (!d) fail(lang, '/staff wall', 'lightbox did not open')
      else {
        if (!d.bigImg) fail(lang, '/staff wall', 'large photo missing in lightbox')
        for (const n of names) if (d.text.includes(n)) fail(lang, '/staff wall', `anonymous lightbox leaks a name: ${n}`)
        if (d.video) fail(lang, '/staff wall', 'video rendered in anonymous lightbox')
      }
      await p.keyboard.press('Escape')
    }
    if (errors.length) fail(lang, '/staff', 'pageerror: ' + errors.join(' | '))
    await p.close()
  }

  // ── Home (reduced-motion grid stands in for the belt): cards open modals ──
  {
    const p = await ctx.newPage()
    await p.goto(BASE + '/', { waitUntil: 'networkidle' }).catch(e => fail(lang, '/', 'goto: ' + e.message))
    await p.waitForTimeout(400)
    const hName = lang === 'en' ? haider.name_en : haider.name_ar
    const btn = p.locator(`button[aria-label="${hName}"]`).first()
    if ((await btn.count()) === 0) fail(lang, '/ belt', 'mapped photo card (Haider) not found')
    else {
      await btn.scrollIntoViewIfNeeded()
      await btn.click()
      await p.waitForTimeout(400)
      const d = await dialogState(p)
      if (!d) fail(lang, '/ belt', 'modal did not open from home card')
      else if (!d.text.includes(hName)) fail(lang, '/ belt', 'mapped card modal missing the name')
      await p.keyboard.press('Escape')
    }
    await p.close()
  }

  // ── /contact: three shield pins + labels + attribution ──
  {
    const p = await ctx.newPage()
    const errors = []
    p.on('console', m => { if (m.type() === 'error' && !/tile\.openstreetmap|cloudflareinsights|net::ERR_FAILED/.test(m.text())) errors.push(m.text()) })
    p.on('pageerror', e => errors.push(e.message))
    await p.goto(BASE + '/contact', { waitUntil: 'networkidle' }).catch(e => fail(lang, '/contact', 'goto: ' + e.message))
    await p.waitForTimeout(1500)
    const map = await p.evaluate(() => ({
      pins: [...document.querySelectorAll('.eg-map-pin')].map(pin => ({
        label: pin.querySelector('.eg-map-pin-label')?.textContent.trim(),
        shield: !!pin.querySelector('.eg-map-pin-badge svg'),
      })),
      attribution: document.querySelector('.leaflet-control-attribution')?.textContent || '',
    }))
    if (map.pins.length !== BRANCHES.length) fail(lang, '/contact map', `${map.pins.length} pins, expected ${BRANCHES.length}`)
    for (const b of BRANCHES) {
      const want = lang === 'en' ? b.name_en : b.name_ar
      const pin = map.pins.find(x => x.label === want)
      if (!pin) fail(lang, '/contact map', `pin label "${want}" missing`)
      else if (!pin.shield) fail(lang, '/contact map', `shield svg missing on ${b.id}`)
    }
    if (!map.attribution.includes('OpenStreetMap')) fail(lang, '/contact map', 'OSM attribution not visible')
    if (errors.length) fail(lang, '/contact', 'console: ' + errors.slice(0, 3).join(' | '))
    await p.close()
  }

  await ctx.close()
}
await browser.close()

console.log(JSON.stringify({ base: BASE, engine: ENGINE, failures: failures.length }))
for (const f of failures) console.log('FAIL ' + f)
process.exit(failures.length ? 1 : 0)
