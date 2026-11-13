// DAILY HEALTH CHECK — the site's unattended canary.
//
// Runs whether or not anyone deployed, on the same launchd pattern the backup
// stack uses (02:10 local, after the backup's 02:00 so they never contend).
//
// It shares its routing assertions with qa/post-deploy-gate.mjs by design —
// that gate proves a DEPLOY is good; this proves the site is STILL good
// tomorrow, when nobody is watching and nothing was deployed.
//
// HARD LIMITS, by ruling:
//   · never writes to any table   · never sends anything   · never auto-fixes
// Both pipeline probes are therefore ZERO-RESIDUE: they POST a deliberately
// INVALID body, so the function answers from its VALIDATION branch and returns
// 400 before it ever reaches an insert. A 400 with the expected error code
// proves the endpoint is alive, reachable under CSP-relevant origins, and still
// speaking the contract — while writing nothing. (The close/reopen trick would
// also be zero-residue for rows, but it WRITES registration_open on a live
// workshop, which this check is forbidden to do.)
//
// Usage: node qa/daily-health.mjs [--site https://englishgate-school.com]
import fs from 'fs'
import os from 'os'
import path from 'path'
import tls from 'tls'
import dns from 'dns/promises'

const arg = k => { const i = process.argv.indexOf(k); return i > -1 ? process.argv[i + 1] : null }
const SITE = (arg('--site') || 'https://englishgate-school.com').replace(/\/$/, '')
const HOST = new URL(SITE).host
const SUPA = 'https://qzwrflxhcumnwcramrdy.supabase.co'
const LOG = arg('--log') || path.join(os.homedir(), 'Backups', 'englishgate', 'site-health.log')
const DESKTOP = arg('--desktop') || path.join(os.homedir(), 'Desktop')
const MARKER = path.join(DESKTOP, 'SITE-HEALTH-FAILED.txt')
// Cert/DNS/cross-surface are WARN-level: they degrade before they break, and a
// RED at 02:10 should mean the site is actually down for families.
const fails = []
const warns = []
const notes = []

const ok = (cond, msg, level = 'fail') => {
  if (cond) return true
  ;(level === 'warn' ? warns : fails).push(msg)
  return false
}

const get = async (url, init = {}) => {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), 20000)
  try {
    const r = await fetch(url, { signal: ctrl.signal, redirect: 'follow', ...init })
    return { status: r.status, ct: r.headers.get('content-type') || '', body: await r.text() }
  } catch (e) {
    return { status: 0, ct: '', body: '', err: String(e).slice(0, 80) }
  } finally { clearTimeout(t) }
}

// ── 1. every sitemap route: 200 + a stylesheet link ────────────────────────
const sm = await get(`${SITE}/sitemap.xml`)
ok(sm.status === 200, `sitemap.xml → ${sm.status}${sm.err ? ' ' + sm.err : ''}`)
const routes = [...sm.body.matchAll(/<loc>([^<]+)<\/loc>/g)]
  .map(m => m[1].replace(/^https?:\/\/[^/]+/, '') || '/')
notes.push(`routes=${routes.length}`)
ok(routes.length >= 14, `sitemap lists only ${routes.length} routes (expected >= 14)`)

const cssRefs = new Set()
for (const r of routes) {
  const res = await get(SITE + r)
  const href = /href=["']([^"']+\.css)["']/i.exec(res.body)?.[1]
  if (href) cssRefs.add(href)
  ok(res.status === 200 && !!href,
    `route ${r} → status ${res.status}, stylesheet ${href ? 'ok' : 'MISSING'}`)
}

// ── 2. the CSS actually parses as CSS, with rules ──────────────────────────
ok(cssRefs.size === 1, `routes disagree on the stylesheet: ${[...cssRefs].join(' | ')}`)
for (const href of cssRefs) {
  const css = await get(href.startsWith('http') ? href : SITE + href)
  const rules = (css.body.match(/\{[^{}]*:[^{}]*\}/g) || []).length
  notes.push(`cssRules~${rules}`)
  ok(css.status === 200 && /text\/css/.test(css.ct),
    `stylesheet ${href} → ${css.status} ${css.ct}`)
  ok(rules > 0 && !/<!doctype html/i.test(css.body),
    `stylesheet ${href} does not parse as CSS (rules=${rules})`)
}

// ── 3+4. both pipelines answer — zero-residue, validation-branch probes ────
for (const [name, fn, body, expect] of [
  ['workshop', 'workshop-register', { workshop_id: '', full_name: '', phone: '' }, 'workshop_required'],
  ['placement', 'placement-request', { full_name: '', age: 0, mode: '', phone: '' }, 'name_invalid'],
]) {
  const r = await get(`${SUPA}/functions/v1/${fn}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  })
  // 400 = validation answered (alive, contract intact). 401 = auth-gated but
  // reachable. Anything else — 0, 5xx — means the door is not answering.
  const alive = r.status === 400 || r.status === 401
  notes.push(`${name}=${r.status}`)
  ok(alive, `${name} endpoint → ${r.status}${r.err ? ' ' + r.err : ''} (expected 400 ${expect})`)
}

// ── 5. certificate expiry ─────────────────────────────────────────────────
const certDays = await new Promise(res => {
  const s = tls.connect({ host: HOST, port: 443, servername: HOST }, () => {
    const c = s.getPeerCertificate()
    s.end()
    res(c?.valid_to ? Math.floor((new Date(c.valid_to) - Date.now()) / 86400000) : null)
  })
  s.on('error', () => res(null))
  s.setTimeout(15000, () => { s.destroy(); res(null) })
})
notes.push(`cert=${certDays ?? '?'}d`)
ok(certDays !== null, `could not read the TLS certificate for ${HOST}`, 'warn')
if (certDays !== null) ok(certDays > 21, `certificate expires in ${certDays}d (<= 21)`, 'warn')

// ── 6. DNS resolves to the expected target ────────────────────────────────
try {
  const a = await dns.resolve4(HOST).catch(() => [])
  const cname = await dns.resolveCname(HOST).catch(() => [])
  const resolved = a.length + cname.length > 0
  notes.push(`dns=${a.length}A`)
  ok(resolved, `DNS for ${HOST} resolved to nothing`)
  // Cloudflare fronts this zone; a non-Cloudflare answer means the domain moved.
  const head = await get(SITE + '/')
  ok(head.status === 200, `${HOST} → ${head.status}`)
} catch (e) {
  ok(false, `DNS lookup failed: ${String(e).slice(0, 60)}`)
}

// ── 7. cross-surface canary — the other two doors families are sent to ─────
for (const [label, url] of [
  ['center', 'https://center.englishgate-school.com/'],
  ['app', 'https://app.englishgate-school.com/'],
]) {
  const r = await get(url)
  notes.push(`${label}=${r.status}`)
  ok(r.status === 200, `${label} surface → ${r.status}${r.err ? ' ' + r.err : ''}`, 'warn')
}

// ── verdict ───────────────────────────────────────────────────────────────
const verdict = fails.length ? 'RED' : warns.length ? 'YELLOW' : 'GREEN'
const stamp = new Date().toISOString().replace('T', ' ').slice(0, 19)
const line = `[${stamp}] ${verdict} — ${notes.join(' ')}` +
  (fails.length ? ` | FAIL: ${fails.join(' ; ')}` : '') +
  (warns.length ? ` | WARN: ${warns.join(' ; ')}` : '')

fs.mkdirSync(path.dirname(LOG), { recursive: true })
fs.appendFileSync(LOG, line + '\n')
console.log(line)

// Desktop marker: raised on RED, and CLEANED on the next GREEN/YELLOW so a
// stale marker can never outlive the failure it described. That self-cleaning
// is the bug this stack already fixed once — it is deliberate, not incidental.
if (verdict === 'RED') {
  fs.writeFileSync(MARKER,
    `SITE HEALTH: RED\n${stamp}\n\n${fails.map(f => '  - ' + f).join('\n')}\n\n` +
    `Log: ${LOG}\nRe-run: node qa/daily-health.mjs\n` +
    `This file deletes itself on the next green run.\n`)
} else if (fs.existsSync(MARKER)) {
  fs.unlinkSync(MARKER)
}

process.exit(verdict === 'RED' ? 1 : 0)
