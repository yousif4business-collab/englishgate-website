// S14 QA — real-content integration assertions. Counts derive from the data
// files (src/data/staff.js, src/data/branches.js) — NEVER hardcoded here.
// Usage: node qa/s14.mjs [--base http://localhost:4173]
import { existsSync, readdirSync, statSync } from 'node:fs'
import { chromium } from 'playwright-core'
import { teachers, BIOS } from '../src/data/staff.js'
import { BRANCHES } from '../src/data/branches.js'
import { TEAM_PHOTOS } from '../src/data/team-photos.js'
import { PHONES } from '../src/lib/contact.js'

const BASE = process.argv.includes('--base')
  ? process.argv[process.argv.indexOf('--base') + 1]
  : 'http://localhost:4173'
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const AR_DIGITS = '٠١٢٣٤٥٦٧٨٩'
const num = (n, lang) => (lang === 'ar' ? String(n).replace(/\d/g, d => AR_DIGITS[d]) : String(n))

const failures = []
const fail = (lang, where, detail) => failures.push(`[${lang} ${where}] ${detail}`)

// ── S38c: bio integrity — a SILENT-FAILURE guard ──
// BIOS (src/data/staff.js) is keyed by name_ar, and teachers pick their bio up
// with BIOS[name_ar]. So renaming a roster row without moving its key drops
// that teacher's bio back to «الملف الكامل قريباً» with NO error: the build
// passes, the page renders, verify-points stays 27/27, and the only symptom is
// a profile that quietly went blank. This happened for real during the S38c
// rename. Assert it in both directions.
//
// EXPECTED_BIOS must be edited BY HAND when bios are genuinely added or
// removed — that deliberate step is the whole point of the check.
const EXPECTED_BIOS = 15
{
  const rosterNames = new Set(teachers.map(t => t.name_ar))
  for (const key of Object.keys(BIOS)) {
    if (!rosterNames.has(key)) {
      fail('-', 'staff-data', `BIOS key "${key}" matches no roster name_ar — that bio renders nowhere (renamed without moving the key?)`)
    }
  }
  const withBio = teachers.filter(t => t.bio_ar && t.bio_en).length
  if (withBio !== EXPECTED_BIOS) {
    fail('-', 'staff-data', `real-bio count is ${withBio}, expected ${EXPECTED_BIOS} — if this change is intended, update EXPECTED_BIOS in qa/s14.mjs`)
  }
  // A bio must exist in BOTH languages or neither: one-sided means a blank
  // profile in one language mode only, which is easy to miss in review.
  for (const t of teachers) {
    if (!!t.bio_ar !== !!t.bio_en) {
      fail('-', 'staff-data', `${t.name_ar} has a bio in only one language (ar:${!!t.bio_ar} en:${!!t.bio_en})`)
    }
  }
}

// ── Asset payload budget: every staff card asset ≤120KB ──
for (const dir of ['public/staff', 'public/staff/incoming']) {
  if (!existsSync(dir)) continue
  for (const f of readdirSync(dir).filter(f => f.endsWith('-600.webp'))) {
    const kb = statSync(`${dir}/${f}`).size / 1024
    if (kb > 120) fail('-', dir, `${f} is ${Math.round(kb)}KB (budget 120KB)`)
  }
}

const browser = await chromium.launch({ headless: true, ...(existsSync(CHROME) ? { executablePath: CHROME } : {}) })

for (const lang of ['en', 'ar']) {
  // no-preference: the belt must render as a real marquee here; the dedicated
  // reduced-motion block below asserts the static-grid variant.
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'no-preference' })
  await ctx.addInitScript(l => { try { sessionStorage.setItem('eg_intro_seen', '1'); localStorage.setItem('eg_lang', l) } catch {} }, lang)
  const names = teachers.map(t => (lang === 'en' ? t.name_en : t.name_ar))

  const visit = async path => {
    const p = await ctx.newPage()
    const errors = []
    p.on('console', m => { if (m.type() === 'error' && !/cloudflareinsights|net::ERR_FAILED|maps\.google/.test(m.text()) ) errors.push(m.text()) })
    p.on('pageerror', e => errors.push(e.message))
    await p.goto(BASE + path, { waitUntil: 'networkidle' }).catch(e => fail(lang, path, 'goto: ' + e.message))
    await p.evaluate(async () => {
      for (let y = 0; y < document.body.scrollHeight; y += 600) { window.scrollTo(0, y); await new Promise(r => setTimeout(r, 40)) }
      window.scrollTo(0, 0)
    })
    await p.waitForTimeout(400)
    return { p, errors }
  }

  // ── Home: roster count in copy, ANONYMOUS photo belt, parent video ──
  // Belt contract: exactly the TEAM_PHOTOS list (mapped slugs + unmapped
  // numbered shots) as cards, and NO names/roles inside the belt.
  for (const ph of TEAM_PHOTOS) {
    if (!existsSync(`public${ph}`)) fail('-', 'assets', `TEAM_PHOTOS entry missing on disk: ${ph}`)
  }
  {
    const { p, errors } = await visit('/')
    const r = await p.evaluate(expected => {
      const tracks = [...document.querySelectorAll('.marquee-track')]
      const belt = tracks.find(t => [...t.querySelectorAll('img')].some(i => expected.includes(i.getAttribute('src'))))
      return {
        text: document.body.textContent,
        beltPhotos: belt ? [...new Set([...belt.querySelectorAll('img')].map(i => i.getAttribute('src')))] : [],
        beltText: belt ? belt.textContent.trim() : null,
        video: !!document.querySelector('#testimonials video[src*="parents-feedback"]'),
      }
    }, TEAM_PHOTOS)
    if (!r.text.includes(num(teachers.length, lang))) fail(lang, '/', `staff count ${num(teachers.length, lang)} not in homepage copy`)
    const wantSet = new Set(TEAM_PHOTOS)
    if (r.beltPhotos.length !== wantSet.size || r.beltPhotos.some(s => !wantSet.has(s))) {
      fail(lang, '/', `belt photos differ from TEAM_PHOTOS (${r.beltPhotos.length} vs ${wantSet.size})`)
    }
    if (r.beltText === null) fail(lang, '/', 'photo belt not found')
    // S23 policy change: mapped photos (director-confirmed) CARRY name+role
    // captions; only unmapped teachers' names must never appear in the belt.
    // (qa/s21.mjs asserts the exact captioned count.)
    for (const t of teachers.filter(t => !t.photo)) {
      const n = lang === 'en' ? t.name_en : t.name_ar
      if (r.beltText && r.beltText.includes(n)) fail(lang, '/', `belt leaks an UNMAPPED name: ${n}`)
    }
    for (const bad of ['نبأ بلال', 'Nabaa Bilal']) if (r.text.includes(bad)) fail(lang, '/', `removed teacher still rendered: ${bad}`)
    if (!r.video) fail(lang, '/', 'parent video not rendered in #testimonials')
    const badge = lang === 'en' ? 'Parent story' : 'آراء الأهالي'
    if (!(await p.evaluate(b => document.querySelector('#testimonials').textContent.includes(b), badge))) {
      fail(lang, '/', `video badge "${badge}" missing`)
    }
    if (errors.length) fail(lang, '/', 'console: ' + errors.slice(0, 3).join(' | '))
    await p.close()
  }

  // ── Home under reduced motion: belt becomes a static grid, same photos ──
  {
    const rmCtx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' })
    await rmCtx.addInitScript(l => { try { sessionStorage.setItem('eg_intro_seen', '1'); localStorage.setItem('eg_lang', l) } catch {} }, lang)
    const p = await rmCtx.newPage()
    await p.goto(BASE + '/', { waitUntil: 'networkidle' }).catch(e => fail(lang, '/ (rm)', 'goto: ' + e.message))
    await p.evaluate(async () => {
      for (let y = 0; y < document.body.scrollHeight; y += 600) { window.scrollTo(0, y); await new Promise(r => setTimeout(r, 40)) }
    })
    await p.waitForTimeout(400)
    const rm = await p.evaluate(expected => ({
      beltInMarquee: [...document.querySelectorAll('.marquee-track img')].some(i => expected.includes(i.getAttribute('src'))),
      gridPhotos: [...new Set([...document.querySelectorAll('img')].map(i => i.getAttribute('src')).filter(s => expected.includes(s)))].length,
    }), TEAM_PHOTOS)
    if (rm.beltInMarquee) fail(lang, '/ (rm)', 'photo belt still a marquee under reduced motion')
    if (rm.gridPhotos !== TEAM_PHOTOS.length) fail(lang, '/ (rm)', `static grid has ${rm.gridPhotos} photos, expected ${TEAM_PHOTOS.length}`)
    await p.close()
    await rmCtx.close()
  }

  // ── About: stats derive from data files ──
  {
    const { p, errors } = await visit('/about')
    // let the CountUp animation reach its target before reading the numbers
    await p.evaluate(() => document.querySelector('.stat-card')?.scrollIntoView({ block: 'center' }))
    await p.waitForTimeout(2000)
    const text = await p.evaluate(() => document.body.textContent)
    if (!text.includes(num(teachers.length, lang))) fail(lang, '/about', `teaching-staff stat ${num(teachers.length, lang)} missing`)
    if (!text.includes(num(BRANCHES.length, lang))) fail(lang, '/about', `branches stat ${num(BRANCHES.length, lang)} missing`)
    if (errors.length) fail(lang, '/about', 'console: ' + errors.slice(0, 3).join(' | '))
    await p.close()
  }

  // ── Staff: every roster name rendered, removed name absent ──
  {
    const { p, errors } = await visit('/staff')
    const text = await p.evaluate(() => document.body.textContent)
    for (const n of names) if (!text.includes(n)) fail(lang, '/staff', `missing teacher: ${n}`)
    for (const bad of ['نبأ بلال', 'Nabaa Bilal']) if (text.includes(bad)) fail(lang, '/staff', `removed teacher still rendered: ${bad}`)
    if (!text.includes(num(teachers.length, lang))) fail(lang, '/staff', `team subtitle count missing`)
    if (errors.length) fail(lang, '/staff', 'console: ' + errors.slice(0, 3).join(' | '))
    await p.close()
  }

  // ── Contact + footer: both numbers, both branches ──
  {
    const { p, errors } = await visit('/contact')
    const r = await p.evaluate(() => ({
      tels: [...document.querySelectorAll('a[href^="tel:"]')].map(a => a.getAttribute('href')),
      // any maps link counts as directions (Mansour uses an academy-specified
      // maps.google.com/?q= URL instead of the dir API — S15)
      dirs: [...document.querySelectorAll('a[href*="maps.google"], a[href*="google.com/maps"]')].map(a => a.getAttribute('href')),
      text: document.body.textContent,
    }))
    for (const ph of PHONES) {
      if (!r.tels.includes(`tel:${ph.tel}`)) fail(lang, '/contact', `tel link ${ph.tel} missing`)
      if (!r.text.includes(ph.display)) fail(lang, '/contact+footer', `display number ${ph.display} missing`)
    }
    for (const b of BRANCHES) {
      if (!r.dirs.some(d => d.includes(`${b.lat},${b.lng}`))) fail(lang, '/contact', `directions link for ${b.id} missing`)
      const bn = lang === 'en' ? b.name_en : b.name_ar
      if (!r.text.includes(bn)) fail(lang, '/contact+footer', `branch name ${bn} missing`)
      const addr = lang === 'en' ? b.address_en : b.address_ar
      if (addr && !r.text.includes(addr)) fail(lang, '/contact', `address for ${b.id} missing`)
    }
    if (errors.length) fail(lang, '/contact', 'console: ' + errors.slice(0, 3).join(' | '))
    await p.close()
  }

  // ── /feedback: parent video card present ──
  {
    const { p, errors } = await visit('/feedback')
    const hasCard = await p.evaluate(() => !!document.querySelector('img[src*="parents-feedback-poster"]'))
    if (!hasCard) fail(lang, '/feedback', 'parent video card missing')
    if (errors.length) fail(lang, '/feedback', 'console: ' + errors.slice(0, 3).join(' | '))
    await p.close()
  }

  await ctx.close()
}
await browser.close()

console.log(JSON.stringify({ base: BASE, teachers: teachers.length, branches: BRANCHES.length, failures: failures.length }))
for (const f of failures) console.log('FAIL ' + f)
process.exit(failures.length ? 1 : 0)
