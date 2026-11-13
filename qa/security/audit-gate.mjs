// Production dependency audit gate — replaces a bare `npm audit --omit=dev`
// in .github/workflows/security.yml.
//
// WHY THIS EXISTS: on 2026-07-28 GHSA-qwww-vcr4-c8h2 (react-router) was
// accepted temporarily by owner ruling. The two blunt ways to make CI green —
// `--audit-level=critical` or `npm audit fix --force` — were both rejected:
// the first mutes every future high finding, the second forces a breaking
// downgrade. This gate instead suppresses ONE advisory ID, by name, with a
// written basis and an expiry date, and keeps failing on everything else.
//
// Behaviour:
//   · runs the same `npm audit --omit=dev` CI always ran (nothing is skipped)
//   · FAILS (exit 1) on any high/critical advisory not in the allowlist
//   · PASSES an allowlisted advisory, and prints exactly which and why
//   · WARNS loudly (still exit 0) once an entry is past its expiry, so a
//     temporary acceptance cannot silently become permanent
//   · reports STALE entries whose advisory no longer appears, so the
//     allowlist gets cleaned up when the upstream fix lands
//
// Usage: node qa/security/audit-gate.mjs
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..', '..')
const BLOCKING = new Set(['high', 'critical'])

const { allow = [] } = JSON.parse(readFileSync(join(HERE, 'audit-allowlist.json'), 'utf8'))
const allowById = new Map(allow.map(a => [a.id, a]))

// npm audit exits non-zero when it finds anything — that is expected here, so
// read stdout regardless and only treat unparseable output as a hard error.
const res = spawnSync('npm', ['audit', '--omit=dev', '--json'], {
  cwd: ROOT, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024,
})
let report
try {
  report = JSON.parse(res.stdout)
} catch {
  console.error('audit-gate: could not parse `npm audit --json` output')
  console.error((res.stderr || res.stdout || '').slice(0, 2000))
  process.exit(1)
}

// Collect advisories at a blocking severity. IDs live on object-form `via`
// entries; a package whose `via` is only strings (e.g. react-router-dom) is
// vulnerable transitively and carries no ID of its own, so keying on IDs
// covers the dependent automatically once its root advisory is handled.
const found = new Map() // GHSA id -> { id, title, severity, packages:Set }
for (const [pkg, v] of Object.entries(report.vulnerabilities || {})) {
  for (const via of v.via || []) {
    if (typeof via === 'string' || !via.url) continue
    const id = (via.url.match(/GHSA-[\w-]+/) || [])[0] || via.url
    const sev = (via.severity || v.severity || '').toLowerCase()
    if (!BLOCKING.has(sev)) continue
    if (!found.has(id)) found.set(id, { id, title: via.title || '(no title)', severity: sev, packages: new Set() })
    found.get(id).packages.add(pkg)
  }
}

const today = new Date().toISOString().slice(0, 10)
const blocked = []
const accepted = []
for (const adv of found.values()) {
  const entry = allowById.get(adv.id)
  if (entry) accepted.push({ adv, entry })
  else blocked.push(adv)
}
const stale = allow.filter(a => !found.has(a.id))

const counts = report.metadata?.vulnerabilities || {}
console.log(`audit-gate: npm audit --omit=dev → ${counts.total || 0} advisory/advisories ` +
  `(critical ${counts.critical || 0}, high ${counts.high || 0}, moderate ${counts.moderate || 0}, low ${counts.low || 0})`)

for (const { adv, entry } of accepted) {
  const expired = entry.expires && today > entry.expires
  console.log(`\n${expired ? '⚠ EXPIRED ACCEPTANCE' : 'ACCEPTED'} ${adv.id} [${adv.severity}] — ${adv.title}`)
  console.log(`  packages : ${[...adv.packages].join(', ')}`)
  console.log(`  accepted : ${entry.accepted}  expires: ${entry.expires}`)
  console.log(`  basis    : ${entry.basis}`)
  if (expired) {
    console.log(`  ⚠ This acceptance expired on ${entry.expires} (today ${today}). It is STILL suppressing`)
    console.log('    a CI failure. Re-rule on it: bump to a patched version and delete this entry, or')
    console.log('    consciously extend the expiry in qa/security/audit-allowlist.json.')
  }
}

for (const a of stale) {
  console.log(`\nSTALE allowlist entry ${a.id} — no longer reported by npm audit.`)
  console.log('  The upstream fix has probably landed: delete this entry from audit-allowlist.json.')
}

if (blocked.length) {
  console.log(`\n${blocked.length} NEW high/critical advisory not covered by the allowlist:`)
  for (const a of blocked) {
    console.log(`  ✗ ${a.id} [${a.severity}] — ${a.title}`)
    console.log(`      packages: ${[...a.packages].join(', ')}`)
  }
  console.log('\nThis is a real finding. Do not add it to the allowlist without an owner ruling')
  console.log('recording the basis and an expiry date.')
  process.exit(1)
}

console.log(`\naudit-gate: PASS — ${accepted.length} documented acceptance(s), 0 unreviewed high/critical.`)
process.exit(0)
