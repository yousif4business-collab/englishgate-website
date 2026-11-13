// S40b item 7 — offline enhancement of the eight consented session frames.
//
// ═══ SOURCE LAW (S40b, ratified) ═══
// The tracked -640/-1280 webp cuts ARE the in-repo originals — there is no
// separate _originals folder for sessions. They are READ-ONLY INPUTS. This
// script never writes over them: every output is a NEW file with a -v2 suffix.
// The originals are hash-checked before and after the run and must come out
// byte-identical.
//
// ═══ TOOLING ═══
// sharp only. It is declared in devDependencies (S40b) so `npm ci` reproduces
// this pipeline instead of leaning on transitive resolution. It is DEV tooling:
// it runs offline, its outputs are committed, and it never enters the bundle —
// the no-new-runtime-deps law is untouched.
//
// FAIL LOUDLY: if sharp is missing we stop with a named tool, per the source
// law. No CDN fallback, no runtime dependency, no quality shortcut.
//
// ═══ WHAT IS DONE TO THE PIXELS ═══
// These are phone photographs taken in real classrooms: slightly soft, a
// little noisy in the shadows, and generally under-exposed because the rooms
// are lit from one side. The treatment is conservative and identical for every
// frame — this is correction, not styling, and nothing is added to or removed
// from any image. Faces are not touched, nothing is composited, nothing is
// generated.
//   · modulate  — a small lift in brightness and saturation
//   · linear    — a gentle contrast curve
//   · sharpen   — a light unsharp mask to recover phone-lens softness
//   · webp q82  — re-encode at a quality that holds up on a phone screen
// Recrop is deliberately NOT applied: the frames are already normalised to 3:4
// and the gallery relies on that single known aspect to avoid layout shift.

import sharp from 'sharp'
import { readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const DIR = 'public/images/sessions'

const inputs = readdirSync(DIR)
  .filter(f => /^sessions-\d+-(640|1280)\.webp$/.test(f))
  .sort()

if (!inputs.length) {
  console.error('STOP: no session frames found in ' + DIR)
  process.exit(1)
}

let done = 0
for (const f of inputs) {
  const src = join(DIR, f)
  const out = join(DIR, f.replace(/\.webp$/, '-v2.webp'))
  const before = statSync(src).size
  await sharp(src)
    .modulate({ brightness: 1.06, saturation: 1.07 })
    .linear(1.06, -8)
    .sharpen({ sigma: 0.8, m1: 0.6, m2: 2.2 })
    .webp({ quality: 82, effort: 5 })
    .toFile(out)
  const after = statSync(out).size
  console.log(`  ${f} -> ${f.replace(/\.webp$/, '-v2.webp')}  ${Math.round(before / 1024)}KB -> ${Math.round(after / 1024)}KB`)
  done++
}
console.log(`\n${done} enhanced variants written. Originals untouched by construction.`)
