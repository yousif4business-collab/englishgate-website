// S18 QA — SEO metadata + the two S18 CRITICAL fixes.
//  canonical: every route's <link rel=canonical> + og:url point at ITS OWN
//             https://englishgate-school.com URL (home keeps the trailing
//             slash), on hard load AND after client-side navigation
//  site name: og:site_name is "English Gate Academy" everywhere; the ld+json
//             block parses and carries WebSite + Organization, both named
//             "English Gate Academy" with the AR alternateName + logo
//  text-base: the Tailwind --color-base collision stays dead — /staff's team
//             subtitle is visible at desktop width (real contrast, and
//             text-base resolves as font-size, not color)
//  sitemap:   public/sitemap.xml lists every public route exactly once
// Usage: node qa/s18.mjs [--base http://localhost:4173] [--engine chromium|webkit|firefox]
import { existsSync, readFileSync } from 'node:fs'
import { chromium, webkit, firefox } from 'playwright-core'

const BASE = process.argv.includes('--base')
  ? process.argv[process.argv.indexOf('--base') + 1]
  : 'http://localhost:4173'
const ENGINE = process.argv.includes('--engine')
  ? process.argv[process.argv.indexOf('--engine') + 1]
  : 'chromium'
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const ORIGIN = 'https://englishgate-school.com'
const ROUTES = ['/', '/about', '/programs', '/staff', '/feedback', '/contact', '/faq', '/careers', '/terms', '/privacy', '/cookies']

const failures = []
const fail = (where, detail) => failures.push(`[${ENGINE} ${where}] ${detail}`)

// ── sitemap (static file — no browser needed) ──
{
  const xml = readFileSync(new URL('../public/sitemap.xml', import.meta.url), 'utf8')
  const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1])
  for (const r of ROUTES) {
    const want = r === '/' ? `${ORIGIN}/` : `${ORIGIN}${r}`
    const n = locs.filter(l => l === want).length
    if (n !== 1) fail('sitemap', `${want} appears ${n}×, expected 1`)
  }
  for (const l of locs) {
    const path = l.replace(ORIGIN, '') || '/'
    if (!ROUTES.includes(path === '/' ? '/' : path.replace(/\/$/, ''))) fail('sitemap', `stale entry: ${l}`)
  }
}

const browser = ENGINE === 'webkit'
  ? await webkit.launch({ headless: true })
  : ENGINE === 'firefox'
    ? await firefox.launch({ headless: true })
    : await chromium.launch({ headless: true, ...(existsSync(CHROME) ? { executablePath: CHROME } : {}) })

const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' })
await ctx.addInitScript(() => { try { sessionStorage.setItem('eg_intro_seen', '1') } catch {} })

const seoState = p => p.evaluate(() => ({
  canonical: document.querySelector('link[rel="canonical"]')?.href || null,
  ogUrl: document.querySelector('meta[property="og:url"]')?.content || null,
  siteName: document.querySelector('meta[property="og:site_name"]')?.content || null,
  ldjson: document.querySelector('script[type="application/ld+json"]')?.textContent || null,
}))

// ── hard load: every route declares itself ──
for (const r of ROUTES) {
  const p = await ctx.newPage()
  await p.goto(BASE + r, { waitUntil: 'networkidle' }).catch(e => fail(r, 'goto: ' + e.message))
  const want = r === '/' ? `${ORIGIN}/` : `${ORIGIN}${r}`
  const s = await seoState(p)
  if (s.canonical !== want) fail(r, `canonical = ${s.canonical}, want ${want}`)
  if (s.ogUrl !== want) fail(r, `og:url = ${s.ogUrl}, want ${want}`)
  if (s.siteName !== 'English Gate Academy') fail(r, `og:site_name = ${JSON.stringify(s.siteName)}`)
  if (!s.ldjson) fail(r, 'ld+json block missing')
  else {
    try {
      const g = JSON.parse(s.ldjson)['@graph'] || []
      for (const type of ['WebSite', 'Organization']) {
        const node = g.find(x => x['@type'] === type)
        if (!node) fail(r, `${type} schema missing`)
        else {
          if (node.name !== 'English Gate Academy') fail(r, `${type}.name = ${node.name}`)
          if (node.alternateName !== 'أكاديمية إنجليش جيت') fail(r, `${type}.alternateName wrong`)
        }
      }
      if (!g.find(x => x['@type'] === 'Organization')?.logo?.url) fail(r, 'Organization.logo missing')
    } catch (e) { fail(r, 'ld+json unparsable: ' + e.message) }
  }
  await p.close()
}

// ── client-side navigation must retarget the canonical too ──
{
  const p = await ctx.newPage()
  await p.goto(BASE + '/', { waitUntil: 'networkidle' })
  await p.locator('nav a[href="/about"]').first().click()
  await p.waitForTimeout(500)
  const s = await seoState(p)
  if (s.canonical !== `${ORIGIN}/about`) fail('spa-nav', `canonical after client nav = ${s.canonical}`)
  if (s.ogUrl !== `${ORIGIN}/about`) fail('spa-nav', `og:url after client nav = ${s.ogUrl}`)
  await p.close()
}

// ── /staff team subtitle is VISIBLE at desktop width (S18 CRITICAL-1) ──
for (const lang of ['en', 'ar']) {
  const p = await ctx.newPage()
  await p.addInitScript(l => { try { localStorage.setItem('eg_lang', l) } catch {} }, lang)
  await p.goto(BASE + '/staff', { waitUntil: 'networkidle' })
  const needle = lang === 'en' ? 'educators who know' : 'يعرفون كل طفل'
  const res = await p.evaluate(n => {
    const el = [...document.querySelectorAll('p')].find(e => (e.textContent || '').includes(n))
    if (!el) return null
    const lum = c => { const [r, g, b] = c.match(/[\d.]+/g).map(Number).slice(0, 3).map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 }); return 0.2126 * r + 0.7152 * g + 0.0722 * b }
    const s = getComputedStyle(el)
    let bg = null, node = el
    while (node) { const c = getComputedStyle(node).backgroundColor; if (c && !c.includes('0, 0, 0, 0') && c !== 'transparent') { bg = c; break } node = node.parentElement }
    const L = [lum(s.color), lum(bg)].sort((a, b) => b - a)
    return { fontSize: s.fontSize, ratio: (L[0] + 0.05) / (L[1] + 0.05) }
  }, needle)
  if (!res) fail(`/staff ${lang}`, 'team subtitle not found')
  else {
    if (res.ratio < 4.5) fail(`/staff ${lang}`, `subtitle contrast ${res.ratio.toFixed(2)}:1 — text-base color collision is back`)
    if (res.fontSize !== '16px') fail(`/staff ${lang}`, `sm:text-base font-size = ${res.fontSize}, want 16px`)
  }
  await p.close()
}

await ctx.close()
await browser.close()

console.log(JSON.stringify({ base: BASE, engine: ENGINE, failures: failures.length }))
for (const f of failures) console.log('FAIL ' + f)
process.exit(failures.length ? 1 : 0)
