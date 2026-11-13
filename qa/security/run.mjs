// Permanent security QA suite — `npm run qa:security`.
// Also run by .github/workflows/security.yml on every push + weekly cron.
//
// Checks:
//   1. LIVE HEADERS   — production responds with every security header at its
//                       expected value (CSP directives, HSTS, XFO, XCTO,
//                       Referrer-Policy, Permissions-Policy, COOP, CORP) and
//                       /videos/ responses advertise byte-range support
//                       (S27 — 200+Accept-Ranges / 206+Content-Range; mobile
//                       streaming needs it — see public/_headers for the
//                       Cloudflare-vs-Netlify difference)
//   2. DIST HYGIENE   — no source maps, no sensitive files, no secret-shaped
//                       strings, AND (S60, owner-ruled) every JWT in the
//                       bundle decodes to role "anon" — the publishable key
//                       that MUST ship. A service_role JWT or an sbp_ token
//                       is the hazard, and is a hard FAILURE. Before S60 the
//                       scan matched any JWT, so it flagged the designed
//                       public key and stayed red from the day the intake
//                       pipeline shipped — a light nobody could act on.
//                       strings in the built output
//   3. LINK SAFETY    — every external <a target=_blank> carries
//                       rel="noopener noreferrer"; wa.me/tel: links well-formed
//   4. CSP SWEEP      — the *repo's* CSP (public/_headers) is injected onto a
//                       local preview of dist/ and every page is loaded in
//                       every engine: zero securitypolicyviolation events and
//                       zero console errors (catches CSP regressions BEFORE
//                       deploy — vite preview doesn't apply _headers itself)
//   5. ACCEPTANCE     — qa/scan.mjs (broken images / empty chips) across
//                       chromium + webkit + firefox, mobile + desktop
//
// Local (full):  npm run qa:security
// CI:            node qa/security/run.mjs --ci    (chromium-only browser passes)
//
// Writes qa/security/REPORT.md. Exits non-zero on any failure — CI goes red.
import { readFileSync, existsSync, readdirSync, statSync, mkdirSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn, spawnSync } from 'node:child_process'
import { chromium, webkit, firefox } from 'playwright-core'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..', '..')
const CI = process.argv.includes('--ci')
const LIVE = process.argv.includes('--live')
  ? process.argv[process.argv.indexOf('--live') + 1]
  : 'https://englishgate-school.com'
const PORT = 4177
const BASE = `http://localhost:${PORT}`
const PAGES = ['/', '/about', '/programs', '/staff', '/feedback', '/contact', '/faq']
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'

const results = [] // { section, name, ok, detail }
const check = (section, name, ok, detail = '') => {
  results.push({ section, name, ok, detail })
  console.log(`${ok ? '  ✓' : '  ✗ FAIL'} [${section}] ${name}${detail && !ok ? ` — ${detail}` : ''}`)
}

// ─────────────────────────── 1. live production headers ──────────────────────
console.log(`\n1) Live headers — ${LIVE}`)
{
  let h = null
  try {
    const res = await fetch(LIVE + '/', { redirect: 'follow' })
    h = Object.fromEntries([...res.headers.entries()].map(([k, v]) => [k.toLowerCase(), v]))
  } catch (e) {
    check('headers', 'production reachable', false, String(e))
  }
  if (h) {
    const csp = h['content-security-policy'] || ''
    // S25 audit fixes: fonts self-hosted (no Google origins), frame-src
    // removed entirely (falls back to default-src 'self' — no iframes exist).
    const expectCsp = [
      "default-src 'self'",
      // S35-FONTS: hash-pinned inline intro-check script (see public/_headers)
      "script-src 'self' https://static.cloudflareinsights.com 'sha256-IS0e94fpmBPckSIP5VCa7hb8mok6sP5VChuz/aB34E0='",
      "style-src 'self' 'unsafe-inline'",
      "font-src 'self'",
      "img-src 'self' data: https://tile.openstreetmap.org", // S16 contact map tiles
      "media-src 'self'", // S26 — explicit; the video guard below enforces it works
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'none'",
      "frame-ancestors 'none'",
    ]
    for (const dir of expectCsp) check('headers', `CSP has ${dir.split(' ')[0]}`, csp.includes(dir), `missing "${dir}" in: ${csp.slice(0, 120)}…`)
    check('headers', 'CSP has no frame-src (S25) and no Google font origins', !/frame-src/.test(csp) && !/fonts\.g/.test(csp), csp)

    const hsts = h['strict-transport-security'] || ''
    const maxAge = parseInt((hsts.match(/max-age=(\d+)/) || [])[1] || '0', 10)
    check('headers', 'HSTS max-age ≥ 15552000 + includeSubDomains', maxAge >= 15552000 && /includesubdomains/i.test(hsts), hsts || 'header missing')
    check('headers', 'X-Frame-Options: DENY', (h['x-frame-options'] || '').toUpperCase() === 'DENY', h['x-frame-options'])
    check('headers', 'X-Content-Type-Options: nosniff', (h['x-content-type-options'] || '') === 'nosniff', h['x-content-type-options'])
    check('headers', 'Referrer-Policy: strict-origin-when-cross-origin', h['referrer-policy'] === 'strict-origin-when-cross-origin', h['referrer-policy'])
    // S21: geolocation=(self) — the nearest-branch finder needs the
    // Geolocation API on our own origin (tap-only, computed on-device).
    check('headers', 'Permissions-Policy denies camera/mic/payment, geo self-only',
      ['camera=()', 'microphone=()', 'geolocation=(self)', 'payment=()'].every(p => (h['permissions-policy'] || '').includes(p)), h['permissions-policy'])
    // COOP ships with this batch — warn-only until the deploy lands, then hard.
    check('headers', 'Cross-Origin-Opener-Policy: same-origin', h['cross-origin-opener-policy'] === 'same-origin', h['cross-origin-opener-policy'] || 'header missing')
    // S27: browsers may not embed our resources cross-origin (server-side
    // preview crawlers are unaffected — see public/_headers).
    check('headers', 'Cross-Origin-Resource-Policy: same-origin', h['cross-origin-resource-policy'] === 'same-origin', h['cross-origin-resource-policy'] || 'header missing')
  }

  // S27: video responses must advertise byte-range support — some mobile
  // players won't start streamed playback without it (the "frozen on
  // cellular" bug). Cloudflare's edge owns Accept-Ranges on 206s and strips
  // the custom _headers value there (see public/_headers), so the correct
  // live assertion is the RFC-9110 shape both browser first-touch paths use:
  //   plain GET  → 200 + `accept-ranges: bytes`  (Chrome-style first fetch)
  //   Range GET  → 206 + `content-range`         (Safari-style probe — a 206
  //                is itself the definitive range-support signal)
  try {
    const plain = await fetch(LIVE + '/videos/how-to-start.mp4', { method: 'HEAD' })
    const ph = Object.fromEntries([...plain.headers.entries()].map(([k, v]) => [k.toLowerCase(), v]))
    check('headers', 'video 200 advertises Accept-Ranges: bytes', plain.status === 200 && ph['accept-ranges'] === 'bytes', `status=${plain.status} accept-ranges=${ph['accept-ranges'] || 'missing'}`)
    const vres = await fetch(LIVE + '/videos/how-to-start.mp4', { headers: { Range: 'bytes=0-1023' } })
    const vh = Object.fromEntries([...vres.headers.entries()].map(([k, v]) => [k.toLowerCase(), v]))
    check('headers', 'video Range probe gets 206 + Content-Range', vres.status === 206 && /^bytes 0-1023\//.test(vh['content-range'] || ''), `status=${vres.status} content-range=${vh['content-range'] || 'missing'}`)
    check('headers', 'video responses carry HSTS + CORP', /max-age=/.test(vh['strict-transport-security'] || '') && vh['cross-origin-resource-policy'] === 'same-origin', `hsts=${vh['strict-transport-security'] || 'missing'} corp=${vh['cross-origin-resource-policy'] || 'missing'}`)
  } catch (e) {
    check('headers', 'video file reachable for header check', false, String(e))
  }
}

// ─────────────────────────── 2. dist hygiene ─────────────────────────────────
console.log('\n2) Dist hygiene — built output')
{
  const dist = join(ROOT, 'dist')
  check('dist', 'dist/ exists (run npm run build first)', existsSync(dist))
  if (existsSync(dist)) {
    const files = []
    const walk = d => { for (const f of readdirSync(d)) { const p = join(d, f); statSync(p).isDirectory() ? walk(p) : files.push(p) } }
    walk(dist)

    check('dist', 'no source maps ship', !files.some(f => f.endsWith('.map')), files.filter(f => f.endsWith('.map')).join(', '))
    const sensitive = ['.env', '.env.local', '.git', 'wrangler.toml', 'wrangler.jsonc', 'package.json', 'package-lock.json', 'vite.config.js', '.npmrc']
    const leaked = sensitive.filter(s => existsSync(join(dist, s)))
    check('dist', 'no sensitive files inside dist/', leaked.length === 0, leaked.join(', '))

    // High-signal secret shapes only (single words like "token" appear
    // legitimately in comments/minified libs — those are not findings).
    const SECRETS = [
      [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, 'private key block'],
      [/\b(api[_-]?key|apikey|secret|passw(or)?d|bearer)["']?\s*[:=]\s*["'][A-Za-z0-9+/_\-]{12,}["']/i, 'assigned credential'],
      [/\bsk_live_[A-Za-z0-9]{10,}/, 'Stripe live key'],
      [/\bAKIA[0-9A-Z]{16}\b/, 'AWS access key'],
      [/\bAIza[0-9A-Za-z_\-]{30,}/, 'Google API key'],
      // S60 INVERSION (owner-ruled, same pattern as qa/qi-card.mjs).
      // A bare JWT/Supabase-URL match fired on the ANON PUBLISHABLE KEY and
      // the project URL — both of which MUST be in the bundle for the intake
      // forms to reach the Edge Functions. This check was therefore red from
      // the day the pipeline shipped, and a permanently red light is the same
      // as no light: nobody could act on it, so nobody read it.
      // It now guards the HAZARD instead of the design. See assertAnonKey()
      // below: the embedded JWT must decode to role "anon", and any
      // service_role JWT or sbp_ personal-access-token shape is a FAILURE.
      [/\bsbp_[A-Za-z0-9]{20,}/, 'Supabase personal access token'],
      [/"role"\s*:\s*"service_role"/, 'service_role claim'],
      [/CF_ANALYTICS_TOKEN/, 'analytics token placeholder'],
      [/[A-Za-z0-9._%+-]+@(gmail|yahoo|hotmail|outlook)\.[a-z]{2,}/i, 'personal email address'],
    ]
    const hits = []
    for (const f of files) {
      if (/\.(png|jpg|jpeg|webp|avif|mp4|webm|woff2?|ico|gif)$/i.test(f)) continue
      const text = readFileSync(f, 'utf8')
      for (const [re, label] of SECRETS) {
        const m = text.match(re)
        if (m) hits.push(`${label} in ${f.replace(ROOT + '/', '')}: "${String(m[0]).slice(0, 60)}"`)
      }
    }
    check('dist', 'no secret-shaped strings in built output', hits.length === 0, hits.join(' | '))

    // S60 — the positive half of the inversion: every JWT that IS in dist must
    // be the anon publishable key. A service_role key has the same outward
    // shape and would grant full table access; that is the leak worth catching.
    const jwts = new Set()
    for (const f of files) {
      if (/\.(png|jpg|jpeg|webp|avif|mp4|webm|woff2?|ico|gif)$/i.test(f)) continue
      for (const m of readFileSync(f, 'utf8').matchAll(/eyJ[A-Za-z0-9_-]{10,}\.([A-Za-z0-9_-]{20,})\.[A-Za-z0-9_-]{10,}/g)) jwts.add(m[1])
    }
    const roles = []
    for (const payload of jwts) {
      try {
        const json = JSON.parse(Buffer.from(payload.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'))
        roles.push(json.role || 'unknown')
      } catch { roles.push('undecodable') }
    }
    const bad = roles.filter(r => r !== 'anon')
    check('dist', `every embedded JWT is the anon publishable key (${jwts.size} found: ${roles.join(', ') || 'none'})`,
          bad.length === 0, bad.length ? `NON-ANON ROLE IN THE BUNDLE: ${bad.join(', ')}` : '')
  }
}

// ───────────── start a local preview of dist/ for the browser passes ─────────
console.log('\n   starting vite preview of dist/ …')
const preview = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { cwd: ROOT, stdio: 'ignore' })
await new Promise((resolve, reject) => {
  const t0 = Date.now()
  const poll = async () => {
    try { await fetch(BASE + '/'); resolve() } catch {
      Date.now() - t0 > 20000 ? reject(new Error('preview did not start')) : setTimeout(poll, 300)
    }
  }
  poll()
})

// The repo's CSP, applied to every preview response so the sweep tests the
// exact policy that will ship (vite preview does not serve _headers).
const cspLine = readFileSync(join(ROOT, 'public', '_headers'), 'utf8')
  .split('\n').find(l => l.trim().startsWith('Content-Security-Policy:'))
const CSP = cspLine.split(':').slice(1).join(':').trim()
  .replace(/frame-ancestors [^;]+;?\s*/, '') // meaningless off-HTTP-context locally

const ENGINES = CI
  ? { chromium: () => chromium.launch({ headless: true, ...(existsSync(CHROME) ? { executablePath: CHROME } : {}) }) }
  : {
      chromium: () => chromium.launch({ headless: true, ...(existsSync(CHROME) ? { executablePath: CHROME } : {}) }),
      webkit: () => webkit.launch({ headless: true }),
      firefox: () => firefox.launch({ headless: true }),
    }
const VIEWPORTS = { mobile: { width: 393, height: 852 }, desktop: { width: 1440, height: 900 } }
const SHOTS = join(HERE, 'shots')
mkdirSync(SHOTS, { recursive: true })

// ─────────────── 3 + 4. link safety and CSP sweep, per engine ────────────────
console.log('\n3+4) Link safety + CSP sweep — engines: ' + Object.keys(ENGINES).join(', '))
for (const [engine, launch] of Object.entries(ENGINES)) {
  const browser = await launch()
  for (const [vpName, viewport] of Object.entries(VIEWPORTS)) {
    for (const lang of ['en', 'ar']) {
      const ctx = await browser.newContext({ viewport, reducedMotion: 'reduce' })
      await ctx.addInitScript(l => {
        try { sessionStorage.setItem('eg_intro_seen', '1'); localStorage.setItem('eg_lang', l) } catch {}
        window.__cspViolations = []
        addEventListener('securitypolicyviolation', e =>
          window.__cspViolations.push(`${e.violatedDirective}: ${e.blockedURI}`))
      }, lang)
      // inject the shipping CSP (and friends) onto every same-origin response
      await ctx.route('**/*', async route => {
        if (!route.request().url().startsWith(BASE)) return route.continue()
        const res = await route.fetch()
        route.fulfill({ response: res, headers: { ...res.headers(), 'content-security-policy': CSP } })
      })

      const page = await ctx.newPage()
      const consoleErrors = []
      page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()) })

      let badLinks = [], noAltImgs = [], violations = [], loadFail = ''
      for (const path of PAGES) {
        await page.goto(BASE + path, { waitUntil: 'networkidle' }).catch(e => { loadFail = `${path}: ${e.message}` })
        await page.evaluate(async () => {
          for (let y = 0; y < document.body.scrollHeight; y += 700) { scrollTo(0, y); await new Promise(r => setTimeout(r, 40)) }
        })
        const audit = await page.evaluate(() => {
          const bad = []
          for (const a of document.querySelectorAll('a[href]')) {
            const href = a.getAttribute('href') || ''
            const external = /^https?:\/\//.test(href) && !href.includes(location.host)
            if (a.target === '_blank') {
              const rel = (a.rel || '').toLowerCase()
              if (!rel.includes('noopener') || !rel.includes('noreferrer'))
                bad.push(`target=_blank without noopener+noreferrer: ${href}`)
            }
            if (external && href.includes('wa.me')) {
              const u = new URL(href)
              if (!/^\/\d{10,15}$/.test(u.pathname)) bad.push(`malformed wa.me path: ${href}`)
              const text = u.searchParams.get('text')
              if (href.includes('?text=') && /[ '"<>]/.test(href.split('?text=')[1] || ''))
                bad.push(`unencoded wa.me text: ${href}`)
              if (text === '') bad.push(`empty wa.me text param: ${href}`)
            }
            if (href.startsWith('tel:') && !/^tel:\+?[0-9]{7,15}$/.test(href)) bad.push(`malformed tel link: ${href}`)
          }
          // S27: every <img> must carry an alt attribute (meaningful text or
          // an explicit decorative alt="") — a missing attribute is a defect.
          const noAlt = [...document.querySelectorAll('img:not([alt])')].map(i => i.getAttribute('src') || '(no src)')
          return { bad, noAlt, violations: window.__cspViolations || [] }
        })
        badLinks.push(...audit.bad.map(b => `${path} ${b}`))
        noAltImgs.push(...audit.noAlt.map(s => `${path} ${s}`))
        violations.push(...audit.violations.map(v => `${path} ${v}`))
      }

      const tag = `${engine}-${vpName}-${lang}`
      check('links', `external links safe [${tag}]`, badLinks.length === 0, [...new Set(badLinks)].slice(0, 4).join(' | '))
      check('links', `every <img> has an alt attribute [${tag}]`, noAltImgs.length === 0, [...new Set(noAltImgs)].slice(0, 4).join(' | '))
      check('csp', `zero CSP violations [${tag}]`, violations.length === 0 && !loadFail, loadFail || [...new Set(violations)].slice(0, 4).join(' | '))
      const realErrors = consoleErrors.filter(e => !/favicon/i.test(e))
      check('csp', `zero console errors [${tag}]`, realErrors.length === 0, [...new Set(realErrors)].slice(0, 3).join(' | '))

      if (vpName === 'mobile' || engine === 'chromium') {
        await page.goto(BASE + '/', { waitUntil: 'networkidle' }).catch(() => {})
        await page.waitForTimeout(500)
        await page.screenshot({ path: join(SHOTS, `home-${tag}.png`) })
      }

      // S26 PERMANENT GUARD: a real <video> must load its source and make
      // playback progress UNDER THE SHIPPING CSP, with zero media violations.
      // Any future header change that breaks media turns the build red
      // instead of shipping. (Once per engine — desktop/ar leg.)
      if (vpName === 'desktop' && lang === 'ar') {
        await page.goto(BASE + '/', { waitUntil: 'networkidle' }).catch(() => {})
        const v = await page.evaluate(async () => {
          const el = document.querySelector('#courses-8 video')
          if (!el) return { err: 'no video element on home' }
          el.muted = true
          try { await el.play() } catch (e) { return { err: e.name + ': ' + String(e.message).slice(0, 80) } }
          await new Promise(r => setTimeout(r, 2500))
          const t = el.currentTime
          el.pause()
          return {
            t,
            mediaErr: el.error ? el.error.code : null,
            violations: (window.__cspViolations || []).filter(x => /media-src|default-src/.test(x)),
          }
        })
        check('csp', `video plays under shipping CSP [${engine}]`,
          !v.err && v.t > 0.5 && v.mediaErr === null && v.violations.length === 0,
          v.err || `t=${v.t?.toFixed(2)} mediaErr=${v.mediaErr} violations=${(v.violations || []).join(' | ')}`)
      }
      await page.close()
      await ctx.close()
    }
  }
  await browser.close()
}

// ───────────────────── 5. acceptance scanner, 3 engines ──────────────────────
console.log('\n5) Acceptance scanner (broken images / empty chips)')
for (const engine of Object.keys(ENGINES)) {
  const r = spawnSync('node', [join(ROOT, 'qa', 'scan.mjs'), '--base', BASE, '--engine', engine], { encoding: 'utf8' })
  const out = (r.stdout || '') + (r.stderr || '')
  check('scan', `acceptance scan clean [${engine}]`, r.status === 0, out.trim().split('\n').slice(-3).join(' | '))
}

preview.kill()

// ─────────────────────────────── report ──────────────────────────────────────
const failed = results.filter(r => !r.ok)
const bySection = {}
for (const r of results) (bySection[r.section] ||= []).push(r)
const md = `# Security QA report — englishgate-school.com

Generated: ${new Date().toISOString()} · mode: ${CI ? 'CI (chromium only)' : 'full 3-engine matrix'} · **${failed.length === 0 ? '✅ ALL GREEN' : `❌ ${failed.length} FAILURES`}** (${results.length} checks)

This suite runs via \`npm run qa:security\` locally and via
\`.github/workflows/security.yml\` on every push + weekly cron. CSP, security
headers, source-map absence, dist secrets, external-link hygiene, and the
3-engine acceptance scan are all continuously verified — a regression turns
the build red.

## Posture summary
- **Headers (live)**: CSP (default-src 'self', no unsafe script sources, frame-ancestors 'none'), HSTS w/ includeSubDomains (no preload — deliberate, see public/_headers), XFO DENY, XCTO nosniff, Referrer-Policy, Permissions-Policy, COOP same-origin. COEP + hotlink protection deliberately absent (Maps iframe / OG previews).
- **style-src 'unsafe-inline'** — ACCEPTED-FOR-NOW (S24 audit #3, deferred by owner decision in S25): React style attributes are load-bearing site-wide (documented in public/_headers). Revisit via style-src-attr with a full 3-engine verify.
- **S25 hardening**: fonts self-hosted (Google font origins removed from CSP), frame-src removed entirely (no iframes exist — falls back to default-src 'self').
- **Build**: sourcemaps hard-off in vite.config.js; dist scanned for secret shapes + sensitive files on every run.
- **Client**: no innerHTML/dangerouslySetInnerHTML anywhere; all _blank links noopener+noreferrer; wa.me/tel encoded.
- **Supply chain**: npm audit --omit=dev in CI; Dependabot weekly (npm + actions); package-lock.json committed.
- **Disclosure**: /.well-known/security.txt → WhatsApp reception, expires yearly.

## Checks
${Object.entries(bySection).map(([s, rs]) =>
  `### ${s}\n\n| check | result |\n|---|---|\n` +
  rs.map(r => `| ${r.name} | ${r.ok ? '✅' : `❌ ${r.detail.replace(/\|/g, '\\|').slice(0, 140)}`} |`).join('\n')
).join('\n\n')}
`
writeFileSync(join(HERE, 'REPORT.md'), md)
console.log(`\nREPORT → qa/security/REPORT.md · screenshots → qa/security/shots/`)
console.log(failed.length === 0 ? 'ALL SECURITY CHECKS PASSED' : `${failed.length} FAILURES`)
process.exit(failed.length === 0 ? 0 : 1)
