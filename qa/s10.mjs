// S10 live-audit assertions — permanent additions to the QA matrix:
//   1. CENTERING: on EVERY route, at 1440×900 + 1920×1080 + 2560×1440, in
//      chromium + webkit + firefox: each main content container's horizontal
//      center == viewport center ±24px (guards the "inner pages right-shifted"
//      class of regression).
//   2. STAFF ROSTER: all 20 teachers (incl. Haider) + the featured director
//      + the join card render on /staff — count-asserted, EN + AR.
//   3. MAP ATTRIBUTION: the "Get directions" overlay must not sit in the
//      map's bottom strip where Google attribution lives.
//   4. Screenshots (webkit mobile + chromium desktop, EN+AR) → qa/s10/.
// Usage: node qa/s10.mjs [--base http://localhost:4173]
import { chromium, webkit, firefox } from 'playwright-core'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const BASE = process.argv.includes('--base')
  ? process.argv[process.argv.indexOf('--base') + 1]
  : 'http://localhost:4173'
const OUT = new URL('./s10/', import.meta.url).pathname
mkdirSync(OUT, { recursive: true })
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'

const ROUTES = ['/', '/about', '/programs', '/staff', '/feedback', '/contact', '/faq', '/careers', '/terms', '/privacy', '/cookies']
const RESOLUTIONS = [
  { width: 1440, height: 900 },
  { width: 1920, height: 1080 },
  { width: 2560, height: 1440 },
]
const LAUNCH = {
  chromium: () => chromium.launch({ headless: true, ...(existsSync(CHROME) ? { executablePath: CHROME } : {}) }),
  webkit: () => webkit.launch({ headless: true }),
  firefox: () => firefox.launch({ headless: true }),
}

const failures = []
const shots = []
const check = (tag, name, ok, detail = '') => {
  if (!ok) failures.push(`[${tag}] ${name}${detail ? ` — ${detail}` : ''}`)
  console.log(`${ok ? '  ✓' : '  ✗ FAIL'} [${tag}] ${name}${detail && !ok ? ` — ${detail}` : ''}`)
}

for (const [engine, launch] of Object.entries(LAUNCH)) {
  const browser = await launch()

  // ── 1. centering at three desktop resolutions, every route ──
  for (const vp of RESOLUTIONS) {
    const ctx = await browser.newContext({ viewport: vp })
    await ctx.addInitScript(() => {
      try { sessionStorage.setItem('eg_intro_seen', '1'); localStorage.setItem('eg_lang', 'en') } catch {}
    })
    const page = await ctx.newPage()
    for (const path of ROUTES) {
      await page.goto(BASE + path, { waitUntil: 'domcontentloaded' }).catch(() => {})
      await page.waitForTimeout(350)
      const worst = await page.evaluate(() => {
        const containers = [...document.querySelectorAll('section > div, main > div, footer > div')]
          .filter(d => /max-w-(7|6|5|4|3|2)xl/.test(d.className))
        let worstOff = 0, worstDesc = ''
        for (const d of containers) {
          const r = d.getBoundingClientRect()
          if (r.width === 0) continue
          const off = (r.left + r.width / 2) - innerWidth / 2
          if (Math.abs(off) > Math.abs(worstOff)) {
            worstOff = off
            worstDesc = d.className.split(' ').find(c => c.startsWith('max-w')) || d.tagName
          }
        }
        return { off: Math.round(worstOff), desc: worstDesc, n: containers.length }
      })
      check(`${engine} ${vp.width}`, `centered ±24px ${path}`, Math.abs(worst.off) <= 24 && worst.n > 0,
        `worst offset ${worst.off}px (${worst.desc}, ${worst.n} containers)`)
    }
    await ctx.close()
  }

  // ── 2 + 3. staff roster count + map attribution, EN + AR ──
  for (const lang of ['en', 'ar']) {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
    await ctx.addInitScript(l => {
      try { sessionStorage.setItem('eg_intro_seen', '1'); localStorage.setItem('eg_lang', l) } catch {}
    }, lang)
    const page = await ctx.newPage()

    await page.goto(BASE + '/staff', { waitUntil: 'networkidle' }).catch(() => {})
    await page.evaluate(async () => {
      for (let y = 0; y < document.body.scrollHeight; y += 700) { scrollTo(0, y); await new Promise(r => setTimeout(r, 40)) }
    })
    const staff = await page.evaluate(() => {
      const grid = document.querySelector('#staff .grid')
      const cards = grid ? grid.children.length : 0 // 20 teachers + join card
      const director = !!document.querySelector('#staff blockquote')
      return { cards, director }
    })
    check(`${engine} ${lang}`, 'staff grid renders 20 teachers + join card', staff.cards === 21, `grid children=${staff.cards}`)
    check(`${engine} ${lang}`, 'director card renders', staff.director)

    await page.goto(BASE + '/contact', { waitUntil: 'networkidle' }).catch(() => {})
    const map = await page.evaluate(() => {
      const frame = document.querySelector('iframe[title]')
      const dir = [...document.querySelectorAll('a')].find(a => a.className.includes('absolute') && a.closest('div')?.querySelector('iframe'))
      if (!frame || !dir) return null
      const f = frame.getBoundingClientRect()
      const d = dir.getBoundingClientRect()
      return { clearOfAttribution: d.bottom < f.bottom - 60 }
    })
    check(`${engine} ${lang}`, 'directions overlay clear of Google attribution strip', !!map && map.clearOfAttribution, JSON.stringify(map))
    await ctx.close()
  }

  // ── 4. screenshots from representative contexts ──
  const shoot = engine === 'webkit'
    ? { viewport: { width: 393, height: 852 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, tag: 'mobile' }
    : engine === 'chromium'
      ? { viewport: { width: 1440, height: 900 }, tag: 'desktop' }
      : null
  if (shoot) {
    for (const lang of ['en', 'ar']) {
      const ctx = await browser.newContext({ ...shoot, reducedMotion: 'reduce' })
      await ctx.addInitScript(l => {
        try { sessionStorage.setItem('eg_intro_seen', '1'); localStorage.setItem('eg_lang', l) } catch {}
      }, lang)
      const page = await ctx.newPage()
      for (const path of ['/', '/staff', '/faq', '/contact']) {
        await page.goto(BASE + path, { waitUntil: 'networkidle' }).catch(() => {})
        await page.waitForTimeout(500)
        const slug = `${path === '/' ? 'home' : path.slice(1)}-${engine}-${shoot.tag}-${lang}.png`
        await page.screenshot({ path: join(OUT, slug) })
        shots.push({ file: slug, label: `${path} ${engine} ${shoot.tag} ${lang}` })
      }
      await page.close()
      await ctx.close()
    }
  }
  await browser.close()
  console.log(`— ${engine} done`)
}

const html = `<!doctype html><meta charset="utf-8"><title>S10 audit QA</title>
<style>body{font-family:system-ui;margin:24px;background:#f4f1ea;color:#233}.ok{color:#177245}.bad{color:#b00020}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:14px}
figure{margin:0;background:#fff;border:1px solid #ddd;border-radius:12px;padding:8px}
img{width:100%;height:auto;border-radius:8px;border:1px solid #eee}figcaption{font-size:12px;font-weight:700;margin-top:6px}</style>
<h1>S10 audit — ${new Date().toISOString().slice(0, 10)}</h1>
<p class="${failures.length ? 'bad' : 'ok'}">${failures.length ? failures.length + ' FAILURES' : 'ALL PASS: centering ±24px at 1440/1920/2560 on all routes × 3 engines; staff roster 20+director; map attribution clear.'}</p>
${failures.map(f => `<p class="bad">✗ ${f}</p>`).join('\n')}
<div class="grid">${shots.map(s => `<figure><a href="${s.file}"><img src="${s.file}" loading="lazy"></a><figcaption>${s.label}</figcaption></figure>`).join('\n')}</div>`
writeFileSync(join(OUT, 'index.html'), html)

console.log(`\n${shots.length} screenshots → qa/s10/`)
if (failures.length) { console.error(`${failures.length} FAILURES`); process.exit(1) }
console.log('ALL S10 CHECKS PASSED')
