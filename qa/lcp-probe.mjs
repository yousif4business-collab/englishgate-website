// qa/lcp-probe.mjs — STANDING TOOL (S41-pre).
//
// METHOD (state it whenever you quote a number): Chromium, mobile 390x844
// dsf2, cold context, AR mode, LCP read from a PerformanceObserver with
// buffered:true, median of N runs. Usage:
//     node qa/lcp-probe.mjs [baseUrl] [runs]
//     LCP_THROTTLE=4 node qa/lcp-probe.mjs   # 4x CPU throttle
//
// ⚠ NOISE FLOOR — READ BEFORE TREATING A NUMBER AS PASS/FAIL.
// On a loaded dev machine this measurement is dominated by host noise. The
// SAME unchanged build measured medians of 476 / 996 / 1096 / 1380 ms across
// four attempts, with single runs spanning 0–3548 ms, at load average 4.5–6.5.
// A sub-100ms regression budget is meaningless below that. Quote these medians
// as INDICATIVE ONLY. A real lab-LCP gate belongs on an idle CI runner —
// logged as a Phase-C candidate.
//
// WHAT IT IS ACTUALLY GOOD FOR, noise or not: identifying WHICH element is the
// LCP candidate, and how many candidates ever emit. That is how the S41-pre
// defect was found — the whole routed subtree animated from opacity:0, so no
// page content could be an LCP candidate at all and a 40x45px nav logo won by
// default. Element identity is noise-immune; milliseconds here are not.
import { chromium } from 'playwright-core'
const BASE = process.argv[2] || 'http://localhost:4173'
const RUNS = +(process.argv[3] || 5)
const THROTTLE = +(process.env.LCP_THROTTLE || 1) // 1 = off; see the note below
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
import { existsSync } from 'node:fs'
const b = await chromium.launch({ headless: true, ...(existsSync(CHROME) ? { executablePath: CHROME } : {}) })
const vals = []
for (let i = 0; i < RUNS; i++) {
  const c = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
  await c.addInitScript(() => { try { sessionStorage.setItem('eg_intro_seen', '1'); localStorage.setItem('eg_lang', 'ar') } catch {} })
  const p = await c.newPage()
  const cdp = await c.newCDPSession(p)
  if (THROTTLE > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: THROTTLE })
  await p.goto(BASE + '/', { waitUntil: 'load' })
  await p.waitForTimeout(3000)
  // capture the element INSIDE the observer — the entry's `element` reference
  // is frequently null by the time you read it back from the buffer
  const { lcp, el } = await p.evaluate(() => new Promise(res => {
    let v = 0, tag = '?'
    new PerformanceObserver(l => {
      for (const e of l.getEntries()) {
        v = e.startTime
        const n = e.element
        if (n) tag = n.tagName.toLowerCase() + (n.className ? '.' + String(n.className).trim().split(/\s+/)[0] : '') + (n.textContent ? ' «' + n.textContent.trim().slice(0, 28) + '»' : '')
      }
    }).observe({ type: 'largest-contentful-paint', buffered: true })
    setTimeout(() => res({ lcp: Math.round(v), el: tag }), 400)
  }))
  vals.push(lcp)
  if (i === 0) console.log(`  LCP element: ${el}`)
  await c.close()
}
vals.sort((a, z) => a - z)
console.log(`  runs: ${vals.join(' / ')} ms`)
console.log(`  MEDIAN LCP: ${vals[Math.floor(vals.length / 2)]} ms`)
await b.close()
