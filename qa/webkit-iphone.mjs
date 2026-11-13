// iOS Safari regression audit — runs in Playwright's WEBKIT engine (the same
// engine as iPhone Safari), NOT Chromium. Added after real-iPhone screenshots
// showed three WebKit-only failures (unsized icon SVGs, lazy hero photo,
// translucent mobile menu). WebKit is now a permanent part of this repo's QA
// matrix: run this script before every deploy.
//
//  1. Full-page screenshots of the main pages, EN + AR, iPhone 14 Pro
//     (393×852 @3x) → qa/webkit-iphone/ + contact-sheet index.html
//  2. Icon audit: every Icon slot must contain an inline <svg> with a
//     nonzero bounding box
//  3. Hero photo: <img src=/images/hero-classroom.webp> loaded
//     (naturalWidth > 0) and visible
//  4. Mobile menu: opaque computed background, covers the whole viewport,
//     sits above the sticky CTA
//
// Usage: node qa/webkit-iphone.mjs [--base http://localhost:4173]
import { webkit } from 'playwright-core'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createCanvas, loadImage } from '@napi-rs/canvas'

// WebKit's native fullPage screenshot blanks content past ~2000 CSS px on very
// tall pages (unpainted tiles in the expanded-viewport snapshot), so we stitch
// viewport-sized tiles ourselves. Fixed bars (nav, sticky CTA, floating WA)
// are hidden after the first tile so they don't repeat every 852px.
async function fullPageStitched(page, path, viewport, dpr) {
  const total = await page.evaluate(() => document.body.scrollHeight)
  const stepCss = viewport.height
  const tiles = []
  for (let y = 0; y < total; y += stepCss) {
    const target = Math.min(y, total - stepCss)
    await page.evaluate(v => scrollTo(0, v), target)
    await page.waitForTimeout(y === 0 ? 400 : 250)
    if (y > 0) {
      await page.evaluate(() => {
        for (const el of document.querySelectorAll('header, .wa-float')) el.style.visibility = 'hidden'
        const cta = document.querySelector('div.fixed.bottom-0')
        if (cta) cta.style.visibility = 'hidden'
      })
    }
    tiles.push({ buf: await page.screenshot(), cssY: target, wantY: y })
    if (target < y) break // clamped: last tile reached
  }
  await page.evaluate(() => {
    for (const el of document.querySelectorAll('header, .wa-float')) el.style.visibility = ''
    const cta = document.querySelector('div.fixed.bottom-0')
    if (cta) cta.style.visibility = ''
    scrollTo(0, 0)
  })
  const W = viewport.width * dpr
  const canvas = createCanvas(W, total * dpr)
  const cx = canvas.getContext('2d')
  for (const t of tiles) {
    const img = await loadImage(t.buf)
    cx.drawImage(img, 0, t.cssY * dpr)
  }
  writeFileSync(path, canvas.toBuffer('image/png'))
}

const BASE = process.argv.includes('--base')
  ? process.argv[process.argv.indexOf('--base') + 1]
  : 'http://localhost:4173'
const PAGES = ['/', '/about', '/programs', '/staff', '/contact', '/faq']
const OUT = new URL('./webkit-iphone/', import.meta.url).pathname
mkdirSync(OUT, { recursive: true })

const IPHONE_14_PRO = {
  viewport: { width: 393, height: 852 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
  userAgent:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
}

const browser = await webkit.launch({ headless: true })
const failures = []
const shots = []

for (const lang of ['en', 'ar']) {
  const ctx = await browser.newContext({ ...IPHONE_14_PRO, reducedMotion: 'reduce' })
  await ctx.addInitScript(l => {
    try {
      sessionStorage.setItem('eg_intro_seen', '1')
      localStorage.setItem('eg_lang', l)
    } catch {}
  }, lang)

  for (const path of PAGES) {
    const page = await ctx.newPage()
    await page.goto(BASE + path, { waitUntil: 'networkidle' }).catch(() => {})
    // scroll through so anything lazy/revealed settles
    await page.evaluate(async () => {
      for (let y = 0; y < document.body.scrollHeight; y += 600) {
        window.scrollTo(0, y)
        await new Promise(r => setTimeout(r, 50))
      }
      window.scrollTo(0, 0)
    })
    await page.waitForTimeout(600)

    const slug = (path === '/' ? 'home' : path.slice(1)) + '-' + lang

    // ── Icon audit: every Icon slot has an inline svg with a nonzero bbox ──
    const iconAudit = await page.evaluate(() => {
      const slots = document.querySelectorAll('span.inline-flex.items-center.justify-center.shrink-0')
      let checked = 0
      const bad = []
      for (const slot of slots) {
        const slotBox = slot.getBoundingClientRect()
        const svg = slot.querySelector('svg')
        // slots hidden by responsive classes/visibility are not icon failures
        if (slotBox.width === 0 && slotBox.height === 0) continue
        checked++
        if (!svg) {
          // Brand-logo exemption (see QiMark): an <img> mark is valid slot
          // content as long as it actually loaded and painted.
          const img = slot.querySelector('img')
          if (img) {
            const ir = img.getBoundingClientRect()
            if (!(img.naturalWidth > 0 && ir.width > 1 && ir.height > 1)) {
              bad.push(`broken <img> in icon slot (${slot.className})`)
            }
            continue
          }
          bad.push(`no <svg> inside icon slot (${slot.className})`)
          continue
        }
        const r = svg.getBoundingClientRect()
        if (!(r.width > 1 && r.height > 1)) {
          bad.push(`zero-size svg ${Math.round(r.width)}x${Math.round(r.height)} in ${slot.className}`)
        }
      }
      return { checked, bad }
    })
    if (iconAudit.bad.length) {
      failures.push(...iconAudit.bad.map(b => `[${lang} ${path}] icon: ${b}`))
    }

    // ── Hero photo loaded + visible (home only) ──
    if (path === '/') {
      const hero = await page.evaluate(() => {
        const img = document.querySelector('img[src="/images/hero-classroom.webp"]')
        if (!img) return { ok: false, why: 'img not in DOM' }
        const r = img.getBoundingClientRect()
        const st = getComputedStyle(img)
        if (!(img.naturalWidth > 0)) return { ok: false, why: 'naturalWidth is 0 (not loaded)' }
        if (!(r.width > 50 && r.height > 50)) return { ok: false, why: `tiny box ${r.width}x${r.height}` }
        if (st.visibility === 'hidden' || st.display === 'none' || parseFloat(st.opacity) === 0)
          return { ok: false, why: 'not visible' }
        return { ok: true, natural: `${img.naturalWidth}x${img.naturalHeight}`, box: `${Math.round(r.width)}x${Math.round(r.height)}` }
      })
      if (!hero.ok) failures.push(`[${lang} /] hero photo: ${hero.why}`)
      else console.log(`hero photo ok [${lang}]: natural ${hero.natural}, box ${hero.box}`)
    }

    // ── Full-page screenshot (tile-stitched — see fullPageStitched) ──
    const file = `${slug}.png`
    await fullPageStitched(page, join(OUT, file), IPHONE_14_PRO.viewport, IPHONE_14_PRO.deviceScaleFactor)
    shots.push({ file, label: `${path} (${lang})`, icons: iconAudit.checked })

    // ── Mobile menu audit (home only, per language) ──
    if (path === '/') {
      await page.click('button[aria-label="Open menu"]')
      await page.waitForTimeout(450)
      const menu = await page.evaluate(() => {
        // the fixed overlay is the element with 100dvh inline height
        const overlays = [...document.querySelectorAll('div')].filter(d => d.style.height === '100dvh')
        if (!overlays.length) return { ok: false, why: 'overlay not found' }
        const el = overlays[0]
        const st = getComputedStyle(el)
        const r = el.getBoundingClientRect()
        const m = st.backgroundColor.match(/rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)/)
        const alpha = m && m[4] !== undefined ? parseFloat(m[4]) : 1
        if (alpha < 1) return { ok: false, why: `translucent background ${st.backgroundColor}` }
        if (parseFloat(st.opacity) < 1) return { ok: false, why: `element opacity ${st.opacity}` }
        if (st.visibility !== 'visible') return { ok: false, why: 'not visible' }
        const covers = r.top <= 0 && r.left <= 0 && r.width >= innerWidth && r.height >= innerHeight
        if (!covers) return { ok: false, why: `does not cover viewport (${Math.round(r.width)}x${Math.round(r.height)} @${Math.round(r.top)},${Math.round(r.left)})` }
        const z = parseInt(st.zIndex, 10) || 0
        if (z <= 40) return { ok: false, why: `z-index ${z} not above sticky CTA (40)` }
        return { ok: true, bg: st.backgroundColor, z }
      })
      if (!menu.ok) failures.push(`[${lang}] mobile menu: ${menu.why}`)
      else console.log(`mobile menu ok [${lang}]: ${menu.bg}, z-index ${menu.z}`)
      const menuFile = `menu-open-${lang}.png`
      await page.screenshot({ path: join(OUT, menuFile), fullPage: false })
      shots.push({ file: menuFile, label: `mobile menu open (${lang})` })
    }

    await page.close()
    console.log(`shot ${slug} — ${iconAudit.checked} icon slots audited, ${iconAudit.bad.length} bad`)
  }
  await ctx.close()
}
await browser.close()

// ── Contact sheet ──
const html = `<!doctype html><meta charset="utf-8"><title>WebKit iPhone QA — English Gate</title>
<style>
  body{font-family:system-ui;margin:24px;background:#f4f1ea;color:#233}
  h1{font-size:20px} .ok{color:#177245}.bad{color:#b00020}
  .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:18px}
  figure{margin:0;background:#fff;border:1px solid #ddd;border-radius:12px;padding:10px}
  img{width:100%;height:auto;border-radius:8px;border:1px solid #eee}
  figcaption{font-size:13px;font-weight:700;margin-top:8px}
</style>
<h1>WebKit (iPhone 14 Pro 393×852 @3x) — ${new Date().toISOString().slice(0, 10)}</h1>
<p class="${failures.length ? 'bad' : 'ok'}">${failures.length ? failures.length + ' FAILURES' : 'All checks passed: icons inline-svg nonzero, hero photo loaded, mobile menu opaque.'}</p>
${failures.map(f => `<p class="bad">✗ ${f}</p>`).join('\n')}
<div class="grid">
${shots.map(s => `<figure><a href="${s.file}"><img src="${s.file}" loading="lazy"></a><figcaption>${s.label}${s.icons ? ` — ${s.icons} icons` : ''}</figcaption></figure>`).join('\n')}
</div>`
writeFileSync(join(OUT, 'index.html'), html)

console.log(`\n${shots.length} screenshots → qa/webkit-iphone/`)
if (failures.length) {
  console.error(`\n${failures.length} FAILURES:`)
  for (const f of failures) console.error('  ✗ ' + f)
  process.exit(1)
}
console.log('ALL WEBKIT CHECKS PASSED')
