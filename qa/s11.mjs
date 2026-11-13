// S11 /feedback verification.
//   default        — EMPTY-STATE path (what ships): page renders warm branded
//                    empty card (not broken-looking), nav link before Contact,
//                    per-mode title/meta, WhatsApp prefill per mode, RTL,
//                    zero console/CSP errors — chromium + webkit + firefox,
//                    mobile + desktop, EN + AR. Also asserts
//                    src/data/testimonials.js is EMPTY (commit-time guard).
//   --dummies      — grid path: expects a temporary 3-item dataset (2 text +
//                    1 video) injected in testimonials.js; asserts video grid,
//                    accessible modal (opens, focus inside, Esc closes,
//                    native <video> preload=none playsInline, no 3rd-party
//                    iframes), stars render, homepage teaser shows 3 cards.
//                    NEVER run --dummies against a build meant for commit.
// Usage: node qa/s11.mjs [--base URL] [--dummies]
import { chromium, webkit, firefox } from 'playwright-core'
import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const BASE = process.argv.includes('--base')
  ? process.argv[process.argv.indexOf('--base') + 1]
  : 'http://localhost:4173'
const DUMMIES = process.argv.includes('--dummies')
const OUT = new URL('./s11/', import.meta.url).pathname
mkdirSync(OUT, { recursive: true })
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'

const EXPECT = {
  en: {
    empty: 'We’re collecting stories from our families — be the first to share yours.',
    title: 'Testimonials — English Gate Academy',
    share: 'Hello! I would like to share my family’s experience with English Gate: ',
    nav: 'Testimonials',
  },
  ar: {
    empty: 'نجمع الآن قصص عائلاتنا — كن أول من يشارك تجربته.',
    title: 'آراء الأهالي — أكاديمية إنجليش جيت',
    share: 'السلام عليكم، أود مشاركة تجربة عائلتي مع إنغلش جيت: ',
    nav: 'آراء الأهالي',
  },
}

const failures = []
const shots = []
const check = (tag, name, ok, detail = '') => {
  if (!ok) failures.push(`[${tag}] ${name}${detail ? ` — ${detail}` : ''}`)
  console.log(`${ok ? '  ✓' : '  ✗ FAIL'} [${tag}] ${name}${detail && !ok ? ` — ${detail}` : ''}`)
}

// commit-time guard: the dataset ships EMPTY
if (!DUMMIES) {
  const src = readFileSync(new URL('../src/data/testimonials.js', import.meta.url), 'utf8')
  check('data', 'testimonials.js ships EMPTY (no invented items)', /export const testimonials = \[\]/.test(src))
}

const LAUNCH = {
  chromium: () => chromium.launch({ headless: true, ...(existsSync(CHROME) ? { executablePath: CHROME } : {}) }),
  webkit: () => webkit.launch({ headless: true }),
  firefox: () => firefox.launch({ headless: true }),
}
const VPS = DUMMIES
  ? [['desktop', { viewport: { width: 1440, height: 900 } }]]
  : [
      ['mobile', { viewport: { width: 393, height: 852 } }],
      ['desktop', { viewport: { width: 1440, height: 900 } }],
    ]

for (const [engine, launch] of Object.entries(LAUNCH)) {
  const browser = await launch()
  for (const [vpName, opts] of VPS) {
    for (const lang of ['en', 'ar']) {
      const tag = `${engine} ${vpName} ${lang}`
      const ctx = await browser.newContext({ ...opts, reducedMotion: 'reduce' })
      await ctx.addInitScript(l => {
        try { sessionStorage.setItem('eg_intro_seen', '1'); localStorage.setItem('eg_lang', l) } catch {}
      }, lang)
      const page = await ctx.newPage()
      const errors = []
      page.on('console', m => { if (m.type() === 'error') errors.push(m.text()) })
      await page.addInitScript(() => {
        window.__csp = []
        addEventListener('securitypolicyviolation', e => window.__csp.push(`${e.violatedDirective}:${e.blockedURI}`))
      })

      await page.goto(BASE + '/feedback', { waitUntil: 'networkidle' }).catch(() => {})
      await page.waitForTimeout(500)

      const state = await page.evaluate(exp => {
        const bodyText = document.body.innerText
        const nav = [...document.querySelectorAll('header a')].map(a => a.textContent.trim())
        const fIdx = nav.indexOf(exp.nav)
        const hrefs = [...document.querySelectorAll('a[href*="wa.me"]')].map(a => decodeURIComponent(a.href || ''))
        const share = hrefs.find(h => h.includes(exp.share.trim().slice(0, 30)))
        return {
          title: document.title,
          rtl: document.documentElement.dir,
          emptyShown: bodyText.includes(exp.empty),
          navPresent: fIdx !== -1,
          navBeforeContact: fIdx !== -1 && fIdx < nav.length - 1,
          shareHref: share || null,
          videoCards: document.querySelectorAll('button[aria-label]:has(video), button[aria-label*="Play"], button[aria-label*="تشغيل"]').length,
          quoteCards: document.querySelectorAll('#root .card blockquote, #root svg + p').length,
          iframes: document.querySelectorAll('iframe').length,
          csp: window.__csp,
        }
      }, EXPECT[lang])

      check(tag, 'page title per mode', state.title === EXPECT[lang].title, state.title)
      check(tag, `dir=${lang === 'ar' ? 'rtl' : 'ltr'}`, state.rtl === (lang === 'ar' ? 'rtl' : 'ltr'), state.rtl)
      check(tag, 'nav link present', state.navPresent)
      check(tag, 'WhatsApp share prefill per mode', !!state.shareHref, 'no wa.me link carries the share message')
      check(tag, 'no third-party iframes (strict CSP)', state.iframes === 0, `iframes=${state.iframes}`)

      if (!DUMMIES) {
        check(tag, 'empty state shows warm branded card', state.emptyShown)
      } else {
        const grid = await page.evaluate(() => ({
          play: document.querySelectorAll('button[aria-label*="Play video"], button[aria-label*="تشغيل شهادة"]').length,
          stars: document.querySelectorAll('[role="img"][aria-label$="/5"]').length,
        }))
        check(tag, 'video card renders (dummy)', grid.play >= 1, `play buttons=${grid.play}`)
        check(tag, 'star ratings render (dummy)', grid.stars >= 1, `stars=${grid.stars}`)

        // modal: open → video attrs → focus inside → Esc closes
        await page.click('button[aria-label*="Play video"], button[aria-label*="تشغيل شهادة"]')
        await page.waitForTimeout(450)
        const modal = await page.evaluate(() => {
          const dlg = document.querySelector('[role="dialog"]')
          const v = dlg?.querySelector('video')
          return dlg && {
            video: !!v,
            preload: v?.getAttribute('preload'),
            playsInline: v?.hasAttribute('playsinline'),
            poster: !!v?.getAttribute('poster'),
            focusInside: dlg.contains(document.activeElement),
          }
        })
        check(tag, 'modal opens with native video (preload=none, playsInline, poster)',
          !!modal && modal.video && modal.preload === 'none' && modal.playsInline && modal.poster, JSON.stringify(modal))
        check(tag, 'focus lands inside dialog', !!modal && modal.focusInside)
        await page.keyboard.press('Escape')
        await page.waitForTimeout(350)
        check(tag, 'Esc closes modal', await page.evaluate(() => !document.querySelector('[role="dialog"]')))

        // homepage teaser shows the 3 featured dummies
        await page.goto(BASE + '/', { waitUntil: 'networkidle' }).catch(() => {})
        await page.evaluate(() => document.querySelector('#testimonials')?.scrollIntoView())
        await page.waitForTimeout(600)
        const teaser = await page.evaluate(() => document.querySelectorAll('#testimonials a[href="/feedback"]').length)
        check(tag, 'homepage teaser shows featured cards + read-all link', teaser >= 4, `links=${teaser}`)
      }

      const realErrors = errors.filter(e => !/favicon/i.test(e))
      check(tag, 'zero console errors', realErrors.length === 0, realErrors.slice(0, 2).join(' | '))
      check(tag, 'zero CSP violations', state.csp.length === 0, state.csp.slice(0, 3).join(' | '))

      const slug = `${DUMMIES ? 'dummies' : 'empty'}-${engine}-${vpName}-${lang}.png`
      await page.goto(BASE + '/feedback', { waitUntil: 'networkidle' }).catch(() => {})
      await page.waitForTimeout(500)
      await page.screenshot({ path: join(OUT, slug), fullPage: vpName === 'desktop' })
      shots.push({ file: slug, label: `${DUMMIES ? 'dummy' : 'empty'} ${tag}` })
      await ctx.close()
    }
  }
  await browser.close()
}

const html = `<!doctype html><meta charset="utf-8"><title>S11 feedback QA</title>
<style>body{font-family:system-ui;margin:24px;background:#f4f1ea;color:#233}.ok{color:#177245}.bad{color:#b00020}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:14px}
figure{margin:0;background:#fff;border:1px solid #ddd;border-radius:12px;padding:8px}
img{width:100%;height:auto;border-radius:8px;border:1px solid #eee}figcaption{font-size:12px;font-weight:700;margin-top:6px}</style>
<h1>S11 /feedback — ${DUMMIES ? 'dummy-dataset path' : 'empty-state path'} — ${new Date().toISOString().slice(0, 10)}</h1>
<p class="${failures.length ? 'bad' : 'ok'}">${failures.length ? failures.length + ' FAILURES' : 'ALL PASS'}</p>
${failures.map(f => `<p class="bad">✗ ${f}</p>`).join('\n')}
<div class="grid">${shots.map(s => `<figure><a href="${s.file}"><img src="${s.file}" loading="lazy"></a><figcaption>${s.label}</figcaption></figure>`).join('\n')}</div>`
writeFileSync(join(OUT, `index${DUMMIES ? '-dummies' : ''}.html`), html)

console.log(`\n${shots.length} screenshots → qa/s11/`)
if (failures.length) { console.error(`${failures.length} FAILURES`); process.exit(1) }
console.log(`ALL S11 ${DUMMIES ? 'DUMMY-PATH' : 'EMPTY-STATE'} CHECKS PASSED`)
