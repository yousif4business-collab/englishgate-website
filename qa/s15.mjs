// S15 QA — photo completeness proof + Mansour branch.
//  (a) exactly the full shoot (TEAM_PHOTOS) renders on BOTH the homepage belt
//      and the /staff photo wall — unique assets counted in the DOM, and the
//      16 source filenames printed (settles "are any photos missing?")
//  (b) the wall is name-free; Mansour card + footer render with the exact
//      academy-specified directions link; About branches stat derives.
// Usage: node qa/s15.mjs [--base http://localhost:4173]
import { existsSync, readFileSync } from 'node:fs'
import { chromium } from 'playwright-core'
import { teachers } from '../src/data/staff.js'
import { BRANCHES } from '../src/data/branches.js'
import { TEAM_PHOTOS } from '../src/data/team-photos.js'

const BASE = process.argv.includes('--base')
  ? process.argv[process.argv.indexOf('--base') + 1]
  : 'http://localhost:4173'
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const AR_DIGITS = '٠١٢٣٤٥٦٧٨٩'
const num = (n, lang) => (lang === 'ar' ? String(n).replace(/\d/g, d => AR_DIGITS[d]) : String(n))

const failures = []
const fail = (lang, where, detail) => failures.push(`[${lang} ${where}] ${detail}`)

// ── The 16: asset ↔ original source filename (from the intake manifest) ──
const manifest = JSON.parse(readFileSync('public/staff/incoming/manifest.json', 'utf8'))
if (TEAM_PHOTOS.length !== manifest.length) {
  fail('-', 'data', `TEAM_PHOTOS has ${TEAM_PHOTOS.length} entries, intake manifest has ${manifest.length}`)
}
console.log(`── photo completeness: ${TEAM_PHOTOS.length} assets ↔ intake sources ──`)
TEAM_PHOTOS.forEach((asset, i) => {
  const src = manifest[i]?.source || '??'
  const onDisk = existsSync(`public${asset}`)
  if (!onDisk) fail('-', 'assets', `missing on disk: ${asset}`)
  console.log(`${String(i + 1).padStart(2, '0')}  ${src.padEnd(24)} → ${asset}${onDisk ? '' : '  [MISSING]'}`)
})

const browser = await chromium.launch({ headless: true, ...(existsSync(CHROME) ? { executablePath: CHROME } : {}) })
const wantSet = new Set(TEAM_PHOTOS)
const mansour = BRANCHES.find(b => b.id === 'mansour')

for (const lang of ['en', 'ar']) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'no-preference' })
  await ctx.addInitScript(l => { try { sessionStorage.setItem('eg_intro_seen', '1'); localStorage.setItem('eg_lang', l) } catch {} }, lang)

  const uniqueShootImgs = expected => [...new Set(
    [...document.querySelectorAll('img')].map(i => i.getAttribute('src')).filter(s => expected.includes(s))
  )]

  // ── Homepage belt: exactly the 16 ──
  {
    const p = await ctx.newPage()
    await p.goto(BASE + '/', { waitUntil: 'networkidle' }).catch(e => fail(lang, '/', 'goto: ' + e.message))
    await p.waitForTimeout(600)
    const belt = await p.evaluate(uniqueShootImgs, TEAM_PHOTOS)
    if (belt.length !== wantSet.size) fail(lang, '/ belt', `${belt.length} unique shoot photos rendered, expected ${wantSet.size}`)
    await p.close()
  }

  // ── /staff wall: exactly the 16, name-free, above the role groups ──
  {
    const p = await ctx.newPage()
    await p.goto(BASE + '/staff', { waitUntil: 'networkidle' }).catch(e => fail(lang, '/staff', 'goto: ' + e.message))
    await p.evaluate(async () => {
      for (let y = 0; y < document.body.scrollHeight; y += 600) { window.scrollTo(0, y); await new Promise(r => setTimeout(r, 40)) }
    })
    await p.waitForTimeout(500)
    const r = await p.evaluate(expected => {
      const imgs = [...document.querySelectorAll('img')].map(i => i.getAttribute('src')).filter(s => expected.includes(s))
      const unique = [...new Set(imgs)]
      // the wall grid = the container of the first shoot image outside any marquee
      const first = [...document.querySelectorAll('img')].find(i => expected.includes(i.getAttribute('src')) && !i.closest('.marquee'))
      const wall = first?.closest('.reveal-group')
      const wallText = wall ? wall.textContent.trim() : null
      const wallY = wall?.getBoundingClientRect().top + scrollY
      const groups = [...document.querySelectorAll('h2, h3, [role="heading"]')].find(h => /English Teacher|تدريس اللغة/.test(h.textContent))
      const groupsY = groups ? groups.getBoundingClientRect().top + scrollY : null
      return { unique: unique.length, wallText, wallY, groupsY }
    }, TEAM_PHOTOS)
    if (r.unique !== wantSet.size) fail(lang, '/staff wall', `${r.unique} unique shoot photos rendered, expected ${wantSet.size}`)
    if (r.wallText === null) fail(lang, '/staff wall', 'photo wall not found')
    else if (r.wallText !== '') fail(lang, '/staff wall', `wall must be name-free but renders text: "${r.wallText.slice(0, 60)}"`)
    if (r.groupsY != null && r.wallY != null && r.wallY > r.groupsY) fail(lang, '/staff wall', 'wall is not above the role groups')
    const title = lang === 'en' ? 'Our team in photos' : 'فريقنا بالصور'
    if (!(await p.evaluate(t => document.body.textContent.includes(t), title))) fail(lang, '/staff wall', `heading "${title}" missing`)
    await p.close()
  }

  // ── Mansour: card, address line, exact directions link; About stat = 3 ──
  {
    const p = await ctx.newPage()
    await p.goto(BASE + '/contact', { waitUntil: 'networkidle' }).catch(e => fail(lang, '/contact', 'goto: ' + e.message))
    await p.waitForTimeout(500)
    const r = await p.evaluate(() => ({
      text: document.body.textContent,
      hrefs: [...document.querySelectorAll('a')].map(a => a.getAttribute('href')),
    }))
    const name = lang === 'en' ? mansour.name_en : mansour.name_ar
    const addr = lang === 'en' ? mansour.address_en : mansour.address_ar
    if (!r.text.includes(name)) fail(lang, '/contact', `Mansour name "${name}" missing`)
    if (!r.text.includes(addr)) fail(lang, '/contact', `Mansour address "${addr}" missing`)
    if (!r.hrefs.includes('https://maps.google.com/?q=33.321144,44.330124')) {
      fail(lang, '/contact', 'exact Mansour directions URL missing')
    }
    await p.close()

    const a = await ctx.newPage()
    await a.goto(BASE + '/about', { waitUntil: 'networkidle' }).catch(() => {})
    await a.evaluate(() => document.querySelector('.stat-card')?.scrollIntoView({ block: 'center' }))
    await a.waitForTimeout(2000)
    const text = await a.evaluate(() => document.body.textContent)
    if (!text.includes(num(BRANCHES.length, lang))) fail(lang, '/about', `branches stat ${num(BRANCHES.length, lang)} missing`)
    if (!text.includes(num(teachers.length, lang))) fail(lang, '/about', `roster stat ${num(teachers.length, lang)} missing`)
    await a.close()
  }
  await ctx.close()
}
await browser.close()

console.log(JSON.stringify({ base: BASE, photos: TEAM_PHOTOS.length, branches: BRANCHES.length, failures: failures.length }))
for (const f of failures) console.log('FAIL ' + f)
process.exit(failures.length ? 1 : 0)
