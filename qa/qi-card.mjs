// Qi Card payment-badge audit — 3-engine matrix (chromium + webkit + firefox),
// mobile (393×852) + desktop (1440×900), EN + AR.
//
//  1. /faq, /contact, / (footer): the official qi-logo.svg <img> is complete
//     with naturalWidth > 0 in every engine, and carries explicit
//     width/height attributes (no layout shift)
//  2. RTL: in AR the chip/label order flips (chip sits to the RIGHT of its
//     label in RTL, LEFT in LTR) — asserted on the footer badge
//  3. Screenshots (webkit mobile + chromium desktop): FAQ payment item open,
//     contact payment card, footer band → qa/qi-card/ + index.html
//
// Usage: node qa/qi-card.mjs [--base http://localhost:4173]
import { chromium, webkit, firefox } from 'playwright-core'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const BASE = process.argv.includes('--base')
  ? process.argv[process.argv.indexOf('--base') + 1]
  : 'http://localhost:4173'
const OUT = new URL('./qi-card/', import.meta.url).pathname
mkdirSync(OUT, { recursive: true })

const ENGINES = { chromium, webkit, firefox }
const VIEWPORTS = {
  mobile: { width: 393, height: 852 },
  desktop: { width: 1440, height: 900 },
}
const QI = 'img[src="/images/payments/qi-logo.svg"]'
// S38p: S38j made QiMark's alt overridable so the payment chips label the mark
// in the reader's own language («كي كارد» in AR) while the footer badge keeps
// the default English name — this check still asserted the English string only
// and so failed every AR page. Accept exactly the labels the app is designed to
// emit for that language; anything else is still a failure.
const ALT_OK = { en: ['Qi Card'], ar: ['Qi Card', 'كي كارد'] }
const failures = []
const shots = []

async function newCtx(browser, engine, vpName, lang) {
  const opts = { viewport: VIEWPORTS[vpName], reducedMotion: 'reduce' }
  if (engine === 'webkit' && vpName === 'mobile') Object.assign(opts, { deviceScaleFactor: 3, isMobile: true, hasTouch: true })
  const ctx = await browser.newContext(opts)
  await ctx.addInitScript(l => {
    try { sessionStorage.setItem('eg_intro_seen', '1'); localStorage.setItem('eg_lang', l) } catch {}
  }, lang)
  return ctx
}

for (const [engine, launcher] of Object.entries(ENGINES)) {
  const browser = await launcher.launch({ headless: true })
  for (const vpName of Object.keys(VIEWPORTS)) {
    for (const lang of ['en', 'ar']) {
      const tag = `${engine} ${vpName} ${lang}`
      const ctx = await newCtx(browser, engine, vpName, lang)
      const page = await ctx.newPage()

      for (const path of ['/faq', '/contact', '/']) {
        await page.goto(BASE + path, { waitUntil: 'networkidle' }).catch(() => {})
        if (path === '/faq') {
          // open the payment question (the item whose answer has the qi chip).
          // S38p: /faq is a lazily-loaded route chunk, so counting immediately
          // after goto raced its hydration (firefox mobile lost that race and
          // reported a false "question missing"). Wait for the button instead.
          const payBtn = page.locator('button', { hasText: lang === 'en' ? 'How do we pay' : 'كيف ندفع' })
          try {
            await payBtn.first().waitFor({ state: 'visible', timeout: 15000 })
          } catch {
            failures.push(`[${tag}] /faq payment question missing`)
            continue
          }
          await payBtn.first().click()
          await page.waitForTimeout(500)
        }
        // footer badge lives at the bottom of every page — scroll it into view
        await page.evaluate(() => scrollTo(0, document.body.scrollHeight))
        await page.waitForTimeout(400)

        const audit = await page.evaluate(([sel, altOk]) => {
          const imgs = [...document.querySelectorAll(sel)]
          if (!imgs.length) return { fail: 'no qi <img> found' }
          for (const img of imgs) {
            if (!img.complete || img.naturalWidth === 0) return { fail: `img not loaded (complete=${img.complete}, naturalWidth=${img.naturalWidth})` }
            if (!img.getAttribute('width') || !img.getAttribute('height')) return { fail: 'missing explicit width/height attrs' }
            if (!altOk.includes(img.getAttribute('alt') || '')) return { fail: `bad alt "${img.getAttribute('alt')}"` }
          }
          return { count: imgs.length }
        }, [QI, ALT_OK[lang]])
        if (audit.fail) failures.push(`[${tag} ${path}] qi logo: ${audit.fail}`)

        // RTL/LTR order of the footer badge (chip before label in DOM,
        // so visually: LTR chip left of text, RTL chip right of text)
        const order = await page.evaluate(sel => {
          const img = [...document.querySelectorAll(sel)].at(-1) // footer badge
          const badge = img.closest('div')
          const chip = img.parentElement.getBoundingClientRect()
          const label = badge.querySelector('span:last-child').getBoundingClientRect()
          return { chipX: chip.x, labelX: label.x }
        }, QI).catch(() => null)
        if (order) {
          const ltrOk = order.chipX < order.labelX
          if (lang === 'en' && !ltrOk) failures.push(`[${tag} ${path}] footer badge not LTR (chip ${order.chipX} vs label ${order.labelX})`)
          if (lang === 'ar' && ltrOk) failures.push(`[${tag} ${path}] footer badge did not flip RTL (chip ${order.chipX} vs label ${order.labelX})`)
        }

        // Screenshots from the two representative contexts
        const shoot = (engine === 'webkit' && vpName === 'mobile') || (engine === 'chromium' && vpName === 'desktop')
        if (shoot) {
          const slug = `${path === '/' ? 'footer' : path.slice(1)}-${engine}-${vpName}-${lang}.png`
          if (path === '/faq') {
            // viewport shot with the open card centered — WebKit element
            // screenshots of far-down nodes capture stale (blank) tiles
            await page.evaluate(() => {
              document.querySelector('.ring-2.ring-accent')?.scrollIntoView({ block: 'center' })
            })
            await page.waitForTimeout(900)
            await page.screenshot({ path: join(OUT, slug) })
          } else if (path === '/contact') {
            const card = page.locator(QI).first().locator('xpath=ancestor::div[contains(@class,"bg-white")]').first()
            await card.scrollIntoViewIfNeeded().catch(() => {})
            await page.waitForTimeout(900)
            await card.screenshot({ path: join(OUT, slug) }).catch(async () => page.screenshot({ path: join(OUT, slug) }))
          } else {
            const bar = page.locator('footer .border-t').first()
            await bar.screenshot({ path: join(OUT, slug) }).catch(async () => page.screenshot({ path: join(OUT, slug) }))
          }
          shots.push({ file: slug, label: `${path} — ${engine} ${vpName} ${lang}` })
        }
      }
      await page.close()
      await ctx.close()
      console.log(`checked ${tag}`)
    }
  }
  await browser.close()
}

const html = `<!doctype html><meta charset="utf-8"><title>Qi Card QA — English Gate</title>
<style>body{font-family:system-ui;margin:24px;background:#f4f1ea;color:#233}
.ok{color:#177245}.bad{color:#b00020}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:16px}
figure{margin:0;background:#fff;border:1px solid #ddd;border-radius:12px;padding:10px}
img{width:100%;height:auto;border-radius:8px;border:1px solid #eee}
figcaption{font-size:13px;font-weight:700;margin-top:8px}</style>
<h1>Qi Card badge — 3-engine matrix — ${new Date().toISOString().slice(0, 10)}</h1>
<p class="${failures.length ? 'bad' : 'ok'}">${failures.length ? failures.length + ' FAILURES' : 'All checks passed: official qi-logo.svg loads in chromium+webkit+firefox (mobile+desktop, EN+AR), explicit dims, alt, RTL flip.'}</p>
${failures.map(f => `<p class="bad">✗ ${f}</p>`).join('\n')}
<div class="grid">
${shots.map(s => `<figure><a href="${s.file}"><img src="${s.file}" loading="lazy"></a><figcaption>${s.label}</figcaption></figure>`).join('\n')}
</div>`
writeFileSync(join(OUT, 'index.html'), html)

console.log(`\n${shots.length} screenshots → qa/qi-card/`)
if (failures.length) {
  console.error(`${failures.length} FAILURES:`)
  for (const f of failures) console.error('  ✗ ' + f)
  process.exit(1)
}
console.log('ALL QI CARD CHECKS PASSED')
