// S61c — the MIRROR STALENESS CHECK.
//
// Why this exists: the Netlify mirror is RUNBOOK §3's manual failover target.
// A failover target that has silently rotted is worse than no failover at all
// — you reach for it during an incident and serve months-old content to
// everyone, believing you just recovered. The mirror had drifted exactly that
// way (production on one bundle, mirror on another) because deploying it was
// a SEPARATE opt-in script that nobody remembered to run.
//
// The fix is upstream of this file: `npm run deploy` now pushes the mirror
// itself, so there is one deploy path and it cannot be half-done. This script
// is what makes that claim checkable rather than hopeful.
//
// It asserts two things, and deliberately no more:
//   1. the mirror serves the SAME bundle as production (not stale)
//   2. the mirror is still noindex (never becomes a second indexable
//      canonical — the same hazard class as a public preview URL)
//
// NOT a replacement for qa/post-deploy-gate.mjs. That is the owner's routing
// gate for PRODUCTION and this file must never be confused with it or used to
// satisfy it.
//
// Usage: node qa/mirror-check.mjs [prodUrl] [mirrorUrl]
const PROD = process.argv[2] || 'https://englishgate-school.com'
const MIRROR = process.argv[3] || 'https://englishgate-mirror.netlify.app'

const bundles = html => [...html.matchAll(/assets\/index-[A-Za-z0-9_-]+\.(?:js|css)/g)]
  .map(m => m[0]).sort()

async function get (url) {
  const res = await fetch(url, { redirect: 'follow', headers: { 'cache-control': 'no-cache' } })
  return { res, html: await res.text() }
}

let failed = 0
const fail = msg => { failed++; console.log(`  ✗ ${msg}`) }
const pass = msg => console.log(`  ✓ ${msg}`)

console.log(`\nMIRROR CHECK\n  production ${PROD}\n  mirror     ${MIRROR}\n`)

const prod = await get(PROD + '/')
const prodBundles = bundles(prod.html)
if (!prodBundles.length) {
  console.log('  ✗ could not read any bundle reference from production — aborting')
  process.exit(1)
}
pass(`production bundles: ${prodBundles.join(' ')}`)

// Netlify's CDN can take a few seconds to flip after an upload completes.
// Retry rather than fail a deploy on propagation — but only a few times, and
// say so, because a check that retries forever is a check that never fails.
let mirror = null
let mirrorBundles = []
for (let attempt = 1; attempt <= 5; attempt++) {
  mirror = await get(MIRROR + '/')
  mirrorBundles = bundles(mirror.html)
  if (String(mirrorBundles) === String(prodBundles)) break
  if (attempt < 5) {
    console.log(`  … mirror not in sync yet (attempt ${attempt}/5) — waiting 6s for CDN propagation`)
    await new Promise(r => setTimeout(r, 6000))
  }
}

if (!mirrorBundles.length) {
  fail(`mirror served no bundle reference (HTTP ${mirror.res.status}) — is it deployed?`)
} else if (String(mirrorBundles) === String(prodBundles)) {
  pass(`mirror serves the SAME bundle as production`)
} else {
  fail(`MIRROR IS STALE — production ${prodBundles.join(' ')} vs mirror ${mirrorBundles.join(' ')}`)
}

// The mirror must never be indexable: it is a byte-identical copy of
// production on a different hostname, which is a duplicate-canonical hazard
// the moment the noindex rule goes missing (netlify.toml owns this rule).
const robots = mirror.res.headers.get('x-robots-tag') || ''
if (/noindex/i.test(robots)) pass(`mirror is noindex ("${robots}")`)
else fail(`mirror is NOT noindex — X-Robots-Tag: "${robots || 'missing'}" (see netlify.toml)`)

console.log(failed ? `\nMIRROR CHECK: ${failed} FAILED\n` : '\nMIRROR CHECK: all passed\n')
process.exit(failed ? 1 : 0)
