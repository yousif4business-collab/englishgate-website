// S27 — REAL playback test: the playhead must ACTUALLY ADVANCE.
// Born from the frozen-playhead bug: HE-AAC audio tracks let videos reach
// readyState 4, fire `playing`, and still sit at 0:00 forever, because the
// audio renderer never establishes the media clock. Every earlier test
// asserted the wrong things (play() resolved / muted-only playback), so it
// shipped. This test clicks the real overlay button (trusted gesture,
// UNMUTED, headed) and asserts currentTime passes 0.5s — in Chromium and
// WebKit — then repeats muted as a separate signal to localize any failure
// to the audio path.
// S27-AUDIO: covers ALL THREE site videos, not just one — the home
// #courses-8 and #video VideoFrames plus the testimonials VideoModal
// (parents-feedback), since every file's audio track ships independently.
//
// S52a-b REPAIR — this file had been dead since S38s and nobody noticed,
// because it is not in the standing bar. Two independent breakages, both from
// that sprint, neither related to any media change:
//   1. it drives the site in AR (it seeds eg_lang='ar'), but looked for
//      `button[aria-label^="Play"]` — and S38s localised that label, so in AR
//      the play button announces «شغّل الفيديو» and the selector matched
//      nothing. It now reads the label from the same place the app does.
//   2. it opened `/feedback`, a route S38s renamed to `/testimonials`.
// Keep PLAY_LABEL in step with strings.ar.feedback.whyPlay if that ever moves.
// Usage: node qa/video-playback.mjs [--base http://localhost:4173]
import { existsSync } from 'node:fs'
import { chromium, webkit } from 'playwright-core'

const BASE = process.argv.includes('--base')
  ? process.argv[process.argv.indexOf('--base') + 1]
  : 'http://localhost:4173'
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'

// Environments differ: some (CI containers, daemon-spawned sessions) cannot
// open an audio output device at all, which freezes ANY unmuted playback —
// including a known-good control file. So each engine first plays the
// bundled AAC-LC control fixture unmuted on a bare page:
//   control plays + site video plays   → PASS
//   control plays + site video frozen  → REAL REGRESSION → FAIL
//   control frozen                     → environment has no audio → unmuted
//                                        leg SKIP(env), muted leg must pass
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
const FIXTURE = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'control.mp4')
const CONTROL_HTML = `<!doctype html><video id=v controls playsinline src="data:video/mp4;base64,${readFileSync(FIXTURE).toString('base64')}"></video><button id=b onclick="v.play()">P</button>`

// The overlay button's accessible name, in the language this test drives the
// site in (strings.ar.feedback.whyPlay). VideoFrame emits either that label
// alone or «<label>: <caption>», so a prefix match is the right shape.
const PLAY_LABEL = 'شغّل الفيديو'

const failures = []
for (const [engine, launcher, opts] of [
  ['chromium', chromium, existsSync(CHROME) ? { executablePath: CHROME } : {}],
  ['webkit', webkit, {}],
]) {
  const browser = await launcher.launch({ headless: false, ...opts })

  // ── audio-environment calibration: unmuted control on a bare page ──
  const cal = await browser.newPage()
  await cal.setContent(CONTROL_HTML)
  await cal.click('#b')
  await cal.waitForTimeout(2500)
  const controlT = await cal.evaluate(() => document.getElementById('v').currentTime)
  await cal.close()
  const audioEnv = controlT > 0.5
  console.log(`${engine}: audio environment ${audioEnv ? 'OK' : 'UNAVAILABLE'} (control t=${controlT.toFixed(2)})`)

  // All three shipped videos — each file's audio track fails independently.
  //   frame → VideoFrame with the gold overlay button (trusted-gesture play)
  //   modal → /feedback VideoCard opens VideoModal with a native <video controls>
  const TARGETS = [
    { name: 'course-announcement-8', path: '/', kind: 'frame', section: '#courses-8' },
    { name: 'day-one-before-after', path: '/', kind: 'frame', section: '#video' },
    { name: 'parents-feedback', path: '/testimonials', kind: 'modal', poster: 'parents-feedback-poster' },
  ]

  for (const muted of [false, true]) {
    if (!muted && !audioEnv) {
      console.log(`SKIP ${engine} UNMUTED — no audio device in this environment (control frozen too)`)
      continue
    }
    for (const target of TARGETS) {
      const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } })
      await ctx.addInitScript(() => { try { sessionStorage.setItem('eg_intro_seen', '1'); localStorage.setItem('eg_lang', 'ar') } catch {} })
      const p = await ctx.newPage()
      await p.goto(BASE + target.path, { waitUntil: 'networkidle' })

      let video
      if (target.kind === 'frame') {
        const sec = p.locator(target.section)
        video = sec.locator('video')
        // center the VIDEO itself, not the (viewport-tall) section — VideoFrame
        // pauses any video that drops below 35% visibility, so a section-level
        // scroll can leave the video paused at 0 and flake the test
        await video.evaluate(v => v.scrollIntoView({ block: 'center' }))
        await p.waitForTimeout(800)
        if (muted) await video.evaluate(v => { v.muted = true })
        await sec.locator(`button[aria-label^="${PLAY_LABEL}"]`).click()
      } else {
        // open the testimonial modal via its real card (trusted gesture)
        await p.locator(`button:has(img[src*="${target.poster}"])`).first().click()
        video = p.locator('.modal-panel video')
        await video.waitFor({ timeout: 5000 })
        if (muted) await video.evaluate(v => { v.muted = true })
        // native <video controls>: a real click on the body toggles playback
        // in Chromium; WebKit needs the programmatic nudge (the click above
        // grants user activation) — play() on an already-playing video is a
        // no-op, so doing both is safe in both engines
        await video.click({ position: { x: 200, y: 200 } }).catch(() => {})
        await video.evaluate(v => v.play().catch(e => { window.__playRejected = e.name }))
      }

      // allow network fetch + decode, then require real progress
      let t = 0
      for (let w = 0; w < 20; w++) {
        await p.waitForTimeout(500)
        t = await video.evaluate(v => v.currentTime)
        if (t > 0.5) break
      }
      const err = await video.evaluate(v => (v.error ? v.error.code + '/' + (v.error.message || '') : null))
      const rejected = await p.evaluate(() => window.__playRejected || null)
      const label = `${engine} ${muted ? 'muted' : 'UNMUTED'} ${target.name}`
      if (t > 0.5 && !err) console.log(`PASS ${label} — playhead advanced to ${t.toFixed(2)}s`)
      else if (!err && rejected === 'NotAllowedError') {
        // autoplay-policy refusal, not a media failure — the codec never got
        // a chance to fail. Environment limitation, distinct from the bug.
        console.log(`SKIP ${label} — play() blocked by autoplay policy (${rejected}), not a media error`)
      } else {
        failures.push(`${label}: playhead FROZEN at ${t.toFixed(2)}s err=${err}`)
        console.log(`FAIL ${label} — playhead at ${t.toFixed(2)}s err=${err}`)
      }
      await ctx.close()
    }
  }
  await browser.close()
}
console.log(failures.length ? failures.length + ' FAILURES' : 'PLAYHEAD ADVANCES — ALL PASS')
process.exit(failures.length ? 1 : 0)
