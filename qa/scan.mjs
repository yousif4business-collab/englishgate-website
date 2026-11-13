// Acceptance scan: every page × {375, 1440} × EN/AR.
//  (a) any <img> with naturalWidth 0 (after full-page scroll so lazy images load)
//  (b) any rounded element 30–180px with a background but no text/svg/img inside
// Intentional decorative shapes (blobs, dots, sparkles, mascot parts, pulse
// rings, draw-lines) are excluded by class.
// Usage: node qa/scan.mjs [--base http://localhost:5177] [--engine webkit|firefox|chromium]
//        Non-chromium engines run the same scan in the iPhone-Safari / Gecko
//        engines (part of the permanent 3-engine QA matrix — see qa/security/)
import { existsSync } from 'node:fs'
import { chromium, webkit, firefox } from 'playwright-core'

const BASE = process.argv.includes('--base')
  ? process.argv[process.argv.indexOf('--base') + 1]
  : 'http://localhost:5177'
const ENGINE = process.argv.includes('--engine')
  ? process.argv[process.argv.indexOf('--engine') + 1]
  : 'chromium'
// S38q: /placement added — a route the scan does not visit is a route with no
// language-purity or broken-image cover at all.
const PAGES = ['/', '/about', '/programs', '/placement', '/staff', '/testimonials', '/moments', '/workshop', '/contact', '/faq', '/careers', '/terms', '/privacy', '/cookies']
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'

const browser = ENGINE === 'webkit'
  ? await webkit.launch({ headless: true })
  : ENGINE === 'firefox'
    ? await firefox.launch({ headless: true })
    // local: installed Google Chrome; CI: playwright-managed chromium
    : await chromium.launch({ headless: true, ...(existsSync(CHROME) ? { executablePath: CHROME } : {}) })
const findings = []

for (const lang of ['en', 'ar']) {
  for (const width of [375, 1440]) {
    const ctx = await browser.newContext({ viewport: { width, height: width < 800 ? 800 : 900 }, reducedMotion: 'reduce' })
    await ctx.addInitScript(l => { try { sessionStorage.setItem('eg_intro_seen', '1'); localStorage.setItem('eg_lang', l) } catch {} }, lang)
    for (const path of PAGES) {
      const p = await ctx.newPage()
      await p.goto(BASE + path, { waitUntil: 'networkidle' }).catch(() => {})
      // scroll through so lazy images load
      await p.evaluate(async () => {
        for (let y = 0; y < document.body.scrollHeight; y += 600) { window.scrollTo(0, y); await new Promise(r => setTimeout(r, 60)) }
        window.scrollTo(0, 0)
      })
      await p.waitForTimeout(700)
      const res = await p.evaluate(() => {
        const bad = { imgs: [], empties: [] }
        for (const img of document.querySelectorAll('img')) {
          const r = img.getBoundingClientRect()
          if (r.width > 0 && img.naturalWidth === 0 && img.currentSrc) {
            bad.imgs.push(`${img.getAttribute('src')} (${Math.round(r.width)}x${Math.round(r.height)})`)
          }
        }
        const SKIP = /(blob|dot-|journey-dots|m-spark|m-foot|m-eye|mascot|wa-float|intro-|hero-shape|spark|draw-line|acc-|ring)/
        for (const el of document.querySelectorAll('span,div,a,button,i,b')) {
          const cls = String(el.className)
          if (SKIP.test(cls)) continue
          const st = getComputedStyle(el)
          const r = el.getBoundingClientRect()
          const round = parseFloat(st.borderRadius) || 0
          if (r.width < 30 || r.width > 180 || r.height < 30 || r.height > 180) continue
          if (round < 8) continue
          const hasBg = st.backgroundColor !== 'rgba(0, 0, 0, 0)' || st.backgroundImage !== 'none'
          if (!hasBg) continue
          const hasContent = el.textContent.trim().length > 0 || el.querySelector('svg,img')
          if (!hasContent) {
            // pure decorative dots (aria-hidden AND tiny) are fine
            if (el.getAttribute('aria-hidden') === 'true' && r.width <= 30) continue
            bad.empties.push(`${el.tagName}.${cls.trim().split(/\s+/).slice(0, 3).join('.')} ${Math.round(r.width)}x${Math.round(r.height)}`)
          }
        }
        return bad
      })
      // S61b — img-404 is the one check here that measures a RACE, not a fact:
      // an image still decoding reports naturalWidth 0 exactly like a missing
      // file does. Under the 3-engine contention of `npm run qa:security`
      // (chromium + webkit + firefox) that turned the bar red for three
      // classroom-*.webp files that ship correctly and pass standalone — a
      // flake that costs a session to chase down.
      //
      // ONE retry, img-404 ONLY. This cannot hide a real break: a file that is
      // actually missing is still naturalWidth 0 after the wait and an
      // explicit decode(), so it still fails. Retries that CLEAR are printed
      // to stderr — a box that needs them stays visible instead of the flake
      // being silently swallowed, which would be its own kind of lie.
      if (res.imgs.length) {
        const firstPass = res.imgs
        await p.waitForTimeout(2000)
        res.imgs = await p.evaluate(async () => {
          const pending = [...document.querySelectorAll('img')]
            .filter(i => i.getBoundingClientRect().width > 0 && i.naturalWidth === 0 && i.currentSrc)
          // a genuinely missing file rejects decode(); a slow one resolves
          await Promise.all(pending.map(i => i.decode().catch(() => {})))
          const bad = []
          for (const img of document.querySelectorAll('img')) {
            const r = img.getBoundingClientRect()
            if (r.width > 0 && img.naturalWidth === 0 && img.currentSrc) {
              bad.push(`${img.getAttribute('src')} (${Math.round(r.width)}x${Math.round(r.height)})`)
            }
          }
          return bad
        })
        const cleared = firstPass.filter(f => !res.imgs.includes(f))
        if (cleared.length) {
          console.error(`  ~ img-404 retry cleared ${cleared.length} on [${lang} ${width} ${path}]: ${cleared.join(' | ')} — slow decode under load, not a missing file`)
        }

        // S62d (owner ruling) — EXTERNAL-HOST retry. The pass above waits and
        // re-decodes, but it never re-FETCHES: for a same-origin file that is
        // the right cure, because the request is still in flight. A
        // third-party host that answered 429/503 under 3-engine load has
        // already failed its request, and no amount of decoding revives it —
        // the image needs a second request. That is what turned the bar red
        // for an OpenStreetMap tile on /contact which returned 200 on three
        // direct probes moments later.
        //
        // ONE retry, 2s backoff, cross-origin images ONLY. Same discipline as
        // above: the URL is not rewritten (no cache-buster that could turn a
        // real 404 into a different request), and a genuinely missing file
        // still rejects decode() and still fails. Clears go to stderr so a
        // flaky third party stays visible instead of being swallowed.
        const external = res.imgs.length && await p.evaluate(() =>
          [...document.querySelectorAll('img')].some(i => {
            if (!(i.getBoundingClientRect().width > 0 && i.naturalWidth === 0 && i.currentSrc)) return false
            try { return new URL(i.currentSrc, location.href).origin !== location.origin } catch { return false }
          }))
        if (external) {
          const beforeExt = res.imgs
          await p.waitForTimeout(2000)
          res.imgs = await p.evaluate(async () => {
            const isExternal = i => {
              try { return new URL(i.currentSrc || i.src, location.href).origin !== location.origin } catch { return false }
            }
            const stuck = [...document.querySelectorAll('img')]
              .filter(i => i.getBoundingClientRect().width > 0 && i.naturalWidth === 0 && i.currentSrc && isExternal(i))
            // force a fresh request for the SAME url — clearing src and
            // restoring it re-enters the loader; a failed response is not a
            // valid cached image, so the browser goes back to the network
            await Promise.all(stuck.map(i => {
              const src = i.getAttribute('src')
              const srcset = i.getAttribute('srcset')
              i.removeAttribute('src'); if (srcset) i.removeAttribute('srcset')
              i.src = src; if (srcset) i.srcset = srcset
              return i.decode().catch(() => {})
            }))
            const bad = []
            for (const img of document.querySelectorAll('img')) {
              const r = img.getBoundingClientRect()
              if (r.width > 0 && img.naturalWidth === 0 && img.currentSrc) {
                bad.push(`${img.getAttribute('src')} (${Math.round(r.width)}x${Math.round(r.height)})`)
              }
            }
            return bad
          })
          const extCleared = beforeExt.filter(f => !res.imgs.includes(f))
          if (extCleared.length) {
            console.error(`  ~ img-404 external retry cleared ${extCleared.length} on [${lang} ${width} ${path}]: ${extCleared.join(' | ')} — third-party host throttled under load, not a missing file`)
          }
        }
      }
      for (const i of res.imgs) findings.push({ lang, width, path, type: 'img-404', detail: i })
      for (const e of res.empties) findings.push({ lang, width, path, type: 'empty-rounded', detail: e })

      // Language purity (S10): EN routes must show no Arabic script; AR routes
      // no stray latin. Exempt: the language-toggle button, [data-lang-exempt]
      // brand wordmarks, and (in AR) whitelisted brand/proper-noun tokens.
      const purity = await p.evaluate(l => {
        const AR = /[؀-ۿ]/
        // S21: "Pre-Level One" is the director's official level name in BOTH
        // modes (renamed from الصوتيات) — brand-exempt like English Gate.
        // S31: legal pages name the technical services they describe —
        // OpenStreetMap (map tiles), localStorage/sessionStorage (the two
        // stored values), IP (the tile-request datum). Proper nouns / API
        // identifiers with no Arabic form, same class as Cloudflare above.
        // S33: Jolly Phonics + Oxford — curriculum proper nouns with no Arabic
        // form (same class as TESOL/Coursera above).
        // S38q: Google Meet — the platform the online placement test runs on.
        // Named because the visitor has to install/open it; no Arabic form.
        const BRAND = /^(english\s*gate( school| academy)?|qi card|eg|en|tesol|coursera|cloudflare web analytics|pre-level one|openstreetmap|localstorage|sessionstorage|ip|jolly phonics|oxford|google meet)$/i
        const hits = []
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
        while (walker.nextNode()) {
          const node = walker.currentNode
          const text = node.textContent.trim()
          if (!text) continue
          const el = node.parentElement
          // S-PERF-A11Y: the toggle's aria-label now leads with its visible
          // text ("EN — Toggle language" / "عربي — Toggle language", WCAG
          // 2.5.3) instead of a static string — match by substring so the
          // exemption still finds it in either language.
          if (!el || el.closest('script,style,[aria-label*="Toggle language"],[data-lang-exempt]')) continue
          const r = el.getBoundingClientRect()
          if (r.width === 0 && r.height === 0) continue
          if (l === 'en') {
            if (AR.test(text)) hits.push(`AR-in-EN: "${text.slice(0, 50)}"`)
          } else {
            for (const w of text.match(/[A-Za-z][A-Za-z .&'’-]*/g) || []) {
              // a sentence-ending period rides on the token ("OpenStreetMap.")
              // — strip trailing dots before the allowlist test
              if (!BRAND.test(w.trim().replace(/\.+$/, ''))) hits.push(`EN-in-AR: "${w.trim().slice(0, 30)}" in "${text.slice(0, 40)}"`)
            }
          }
        }
        return [...new Set(hits)].slice(0, 20)
      }, lang)
      for (const h of purity) findings.push({ lang, width, path, type: 'lang-purity', detail: h })
      await p.close()
    }
    await ctx.close()
  }
}
await browser.close()

console.log(JSON.stringify({ base: BASE, findings: findings.length }))
const seen = new Set()
for (const f of findings) {
  const key = `${f.type} ${f.path} ${f.detail}`
  if (seen.has(key)) continue
  seen.add(key)
  console.log(`${f.type} [${f.lang} ${f.width} ${f.path}] ${f.detail}`)
}
process.exit(findings.length ? 1 : 0)
