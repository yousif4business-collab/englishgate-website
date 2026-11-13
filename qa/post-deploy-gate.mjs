// S49 — THE POST-DEPLOY ROUTING GATE. The final gate of the standing bar.
//
// Runs against PRODUCTION, never `vite preview`. That distinction is the whole
// point: every other check in the bar exercises Vite's SPA fallback, while
// production is served by Cloudflare Pages' `_redirects`. A Pages-only routing
// regression is invisible to all of them — which is how a stray `404.html`
// (a Pages magic filename that outranks the SPA catch-all) took 13 of 14 routes
// to 404 in production while the entire local bar stayed green.
//
// A deploy is NOT done until this passes.
//
// ── S56 — EXPECTED-HASH DISCIPLINE (owner-directed hardening) ──────────────
// RULE 9 NOTE, read this before touching anything below: a builder never edits
// this file to make a deploy pass. This change was RULED by the owner and it
// only ever makes the gate harder — it removes a way for a deploy to pass that
// should not have. No assertion was relaxed, none removed.
//
// THE HOLE IT CLOSES, observed twice on live deploys. Cloudflare's edge does
// not switch to a new deployment everywhere at once. For a window after the
// upload, some nodes still answer with the OUTGOING index.html. The gate used
// to fetch `/`, read whatever stylesheet that HTML pointed at, and assert
// against it — so it happily validated the deployment it was replacing and
// reported 20/20. On the S52a deploy it certified the previous CSS; on the
// rollback it certified the one being rolled back. Both "passed" on evidence
// about the wrong bundle. During the S55 deploy, three cache-busted fetches
// caught the split live: one node on the old pair, two on the new.
//
// THE DISCIPLINE. When `--expect <path-to-built-index.html>` is given, the gate
// reads the hashes it JUST BUILT and refuses to assert anything until
// production has actually converged on them: it polls `/` cache-busted until
// STREAK consecutive fetches return that exact js+css pair. Only then do the
// route checks run — and they now assert the EXPECTED stylesheet by name, not
// merely that all routes agree with each other (they agree while they are all
// equally stale). If convergence does not happen within DEADLINE_MS the gate
// fails loudly: a deploy that never reached the edge is a failed deploy.
//
// Without `--expect` the gate behaves exactly as before and says so — that
// mode is for the owner's manual runs and for daily-health, where there is no
// "just built" artifact to compare against.
//
// Usage:
//   node qa/post-deploy-gate.mjs [https://englishgate-school.com]
//   node qa/post-deploy-gate.mjs --expect dist/index.html   (what deploy runs)
import { readFileSync } from 'node:fs'

const argv = process.argv.slice(2)
const flag = k => { const i = argv.indexOf(k); return i > -1 ? argv[i + 1] : null }
const SITE = (argv.find(a => /^https?:\/\//.test(a)) || 'https://englishgate-school.com').replace(/\/$/, '')
const EXPECT_FROM = flag('--expect')
const STREAK = Number(process.env.EG_GATE_STREAK || 5)   // consecutive agreeing fetches
const DEADLINE_MS = Number(process.env.EG_GATE_DEADLINE_MS || 180_000) // ~3 min
const POLL_MS = 4000

let pass = 0, fail = 0
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log(`  ✓ ${name}`) }
  else { fail++; console.log(`  ✗ ${name}  ${extra}`) }
}
const get = async (path, init) => {
  const r = await fetch(SITE + path, { redirect: 'follow', ...init })
  return { status: r.status, ct: r.headers.get('content-type') || '', body: await r.text() }
}
// Cache-busted: a query string the edge has never seen cannot be answered from
// a cached copy of the old shell, which is exactly what we are trying not to
// measure. Used for every HTML fetch once we are checking convergence.
let bust = 0
const getFresh = path => get(path + (path.includes('?') ? '&' : '?') + `gate=${Date.now()}-${bust++}`)

const assetsOf = html => ({
  js: /src=["']([^"']*assets\/index-[^"']+\.js)["']/i.exec(html)?.[1] || null,
  css: /href=["']([^"']*assets\/index-[^"']+\.css)["']/i.exec(html)?.[1] || null,
})
const sameAssets = (a, b) => a.js === b.js && a.css === b.css
const fmt = a => `${a.js || '?'} + ${a.css || '?'}`

console.log(`S49 post-deploy routing gate → ${SITE}\n`)

// ── 0. PROPAGATION: production must be serving the bundle we just built ────
let expected = null
if (EXPECT_FROM) {
  expected = assetsOf(readFileSync(EXPECT_FROM, 'utf8'))
  if (!expected.js || !expected.css) {
    console.log(`  ✗ could not read expected asset hashes from ${EXPECT_FROM}`)
    console.log('\nGATE: 0 passed, 1 failed')
    process.exit(1)
  }
  console.log(`  expecting  ${fmt(expected)}`)
  const started = Date.now()
  let streak = 0, last = null
  while (Date.now() - started < DEADLINE_MS) {
    const res = await getFresh('/')
    const got = assetsOf(res.body)
    if (res.status === 200 && sameAssets(got, expected)) streak++
    else { if (streak) console.log(`  … streak broken at ${streak}/${STREAK} — edge served ${fmt(got)}`); streak = 0 }
    last = got
    if (streak >= STREAK) break
    await new Promise(r => setTimeout(r, POLL_MS))
  }
  const secs = Math.round((Date.now() - started) / 1000)
  if (streak >= STREAK) {
    ok(`production converged on the built bundle (${STREAK}/${STREAK} fresh fetches, ${secs}s)`, true)
  } else {
    console.log('')
    console.log('  !!! PROPAGATION TIMEOUT — the edge never settled on this build !!!')
    console.log(`  !!! expected ${fmt(expected)}`)
    console.log(`  !!! last saw ${fmt(last || {})} after ${secs}s (streak ${streak}/${STREAK})`)
    console.log('  !!! The deploy is NOT done. Do not weaken this check — investigate.')
    console.log(`\nGATE: ${pass} passed, ${fail + 1} failed`)
    process.exit(1)
  }
} else {
  console.log('  (no --expect given — checking whatever the edge serves; see the S56 note)')
}

// ── 1. every route in the SITEMAP (the routes we tell crawlers exist) ───────
const sm = await get('/sitemap.xml')
ok('sitemap.xml is served', sm.status === 200 && /xml/.test(sm.ct), `${sm.status} ${sm.ct}`)
const routes = [...sm.body.matchAll(/<loc>([^<]+)<\/loc>/g)]
  .map(m => m[1].replace(/^https?:\/\/[^/]+/, '') || '/')
console.log(`  → ${routes.length} routes in sitemap\n`)
ok('sitemap lists at least 10 routes', routes.length >= 10, String(routes.length))

const cssRefs = new Set()
for (const r of routes) {
  // cache-busted in --expect mode: a route answered from a cached OLD shell
  // would otherwise sail through, which is the whole bug being closed here.
  const res = expected ? await getFresh(r) : await get(r)
  const link = /<link[^>]+rel=["']?stylesheet["']?[^>]*>/i.exec(res.body)
  const href = link && /href=["']([^"']+)["']/i.exec(link[0])?.[1]
  if (href) cssRefs.add(href)
  ok(`${r} → 200 with a stylesheet link`,
     res.status === 200 && /text\/html/.test(res.ct) && !!href,
     `status=${res.status} ct=${res.ct} link=${href || 'NONE'}`)
  // and it must be the stylesheet WE BUILT, not merely the same one everywhere
  if (expected) {
    ok(`${r} → serves the built stylesheet`, href === expected.css,
       `expected ${expected.css}, got ${href || 'NONE'}`)
  }
}

// ── 2. the CSS the deployed HTML actually points at ────────────────────────
ok('every route references the SAME stylesheet', cssRefs.size === 1, [...cssRefs].join(' | '))
for (const href of cssRefs) {
  const css = await get(href.startsWith('http') ? href.replace(SITE, '') : href)
  ok(`${href} → text/css`, css.status === 200 && /text\/css/.test(css.ct), `${css.status} ${css.ct}`)
  // "non-zero rules" without a browser: the file must contain real declarations,
  // not an HTML shell wearing a .css name.
  const looksLikeCss = /\{[^}]*:[^}]*\}/.test(css.body) && !/<!doctype html/i.test(css.body)
  ok(`${href} → parses as CSS, not an HTML shell`, looksLikeCss,
     `${css.body.length}b starts: ${css.body.slice(0, 40)}`)
  ok(`${href} → non-trivial (>10kb)`, css.body.length > 10_000, `${css.body.length}b`)
}

// ── 2b. the JS bundle we built is actually fetchable as JS ─────────────────
// Same failure shape as the CSS: Pages answers a MISSING asset with the SPA
// shell at 200 (A-02), so "200" alone proves nothing — the content-type and
// the absence of a doctype are what prove the file is really there.
if (expected) {
  const js = await get(expected.js.replace(SITE, ''))
  ok(`${expected.js} → served as JavaScript`,
     js.status === 200 && /javascript|ecmascript/.test(js.ct) && !/<!doctype html/i.test(js.body),
     `${js.status} ${js.ct} ${js.body.length}b`)
}

// ── 3. the asset-miss probe — RECORDED now, ASSERTED once A-02 is re-closed ─
// A 200 here means a missing hashed asset is answered with the SPA shell, which
// a browser then caches under an immutable asset URL for a year. That is the
// cache-poison class (audit A-02).
const miss = await get(`/assets/nonexistent-${'x'.repeat(8)}.css`)
const A02_CLOSED = process.env.EG_A02_CLOSED === '1'
console.log(`\n  asset-miss probe → ${miss.status} ${miss.ct}` +
            `${A02_CLOSED ? '' : '   (RECORDED, not asserted — A-02 open)'}`)
if (A02_CLOSED) {
  ok('missing /assets/* returns 404, not the SPA shell',
     miss.status === 404 && !/<!doctype html>[\s\S]*<div id="root"/i.test(miss.body),
     `${miss.status} ${miss.ct}`)
}

console.log(`\nGATE: ${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
