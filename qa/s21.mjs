// S21/S21.1 permanent QA — run against a preview build:
//   node qa/s21.mjs [--base http://localhost:4173]
//
//  1. TEAM BELT (S21.1 regression guard): the homepage belt renders EXACTLY
//     16 unique staff photos per marquee sequence, and — WITHOUT reduced
//     motion, in BOTH languages — at least one belt card actually intersects
//     the viewport when scrolled to. (The RTL marquee bug hid the whole belt
//     mid-animation while reduced-motion QA saw it parked visible; this
//     check runs the real animation so the belt can never silently vanish.)
//  2. DEAD ZONES (S21.1): at 1440/1920/2560 the 8th-month courses section
//     and the testimonials section must pair the video with side content on
//     the same row — no lone phone-frame with empty flanks.
//  3. ASSISTANT free-text QA: 15 sample questions (10 AR incl. Iraqi
//     dialect, 5 EN) must return the matched scripted answers, and 3
//     out-of-scope questions must return the honest no-match handoff.
import { chromium } from 'playwright-core'
import { existsSync } from 'node:fs'

const BASE = process.argv.includes('--base')
  ? process.argv[process.argv.indexOf('--base') + 1]
  : 'http://localhost:4173'
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const browser = await chromium.launch({ headless: true, ...(existsSync(CHROME) ? { executablePath: CHROME } : {}) })

let fails = 0
const ok = (name, cond, detail = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`)
  if (!cond) fails++
}

const ctxFor = async (lang, width = 1280, height = 900) => {
  const ctx = await browser.newContext({ viewport: { width, height } }) // NO reducedMotion — real animations
  await ctx.addInitScript(l => { try { sessionStorage.setItem('eg_intro_seen', '1'); localStorage.setItem('eg_lang', l) } catch {} }, lang)
  return ctx
}

// ── 1. Team belt ──────────────────────────────────────────────────────────
for (const lang of ['en', 'ar']) {
  const ctx = await ctxFor(lang)
  const p = await ctx.newPage()
  await p.goto(BASE + '/', { waitUntil: 'networkidle' })
  const uniq = await p.$$eval('.marquee-seq:not([aria-hidden]) img[src*="/staff/"]', imgs => new Set(imgs.map(i => i.getAttribute('src'))).size)
  ok(`belt [${lang}] exactly 16 unique photos`, uniq === 16, `got ${uniq}`)
  // S23: director's mapping after the visual sanity check — exactly 12
  // verified-clean cards carry a name+role caption; the 4 pending photos
  // (8, 10, 15, 16) stay caption-free until she answers
  const captioned = await p.$$eval('.marquee-seq:not([aria-hidden]) button', btns => {
    const seen = new Set()
    for (const b of btns) {
      const img = b.querySelector('img[src*="/staff/"]')
      if (img && b.textContent.trim()) seen.add(img.getAttribute('src'))
    }
    return seen.size
  })
  ok(`belt [${lang}] exactly 12 captioned cards`, captioned === 12, `got ${captioned}`)
  // scroll the belt into view and prove a card is PAINTABLE inside the
  // viewport mid-animation (this is what the RTL bug broke)
  const firstImg = p.locator('.marquee img[src*="/staff/"]').first()
  await firstImg.scrollIntoViewIfNeeded()
  await p.waitForTimeout(700)
  const visible = await p.evaluate(() => {
    const imgs = document.querySelectorAll('.marquee img[src*="/staff/"]')
    return [...imgs].some(i => {
      const r = i.getBoundingClientRect()
      return r.width > 0 && r.right > 0 && r.left < innerWidth && r.bottom > 0 && r.top < innerHeight && i.naturalWidth > 0
    })
  })
  ok(`belt [${lang}] card visible in viewport mid-animation`, visible)
  await ctx.close()
}

// ── 2. Dead zones at 1440 / 1920 / 2560 ──────────────────────────────────
// For each section: find the <video>'s frame; require ≥1 content element
// vertically overlapping the video's mid-band but horizontally BESIDE it,
// and require the row (video + side content) to span ≥ 45% of the section's
// content width.
const SECTIONS = [
  { sel: '#courses-8', side: '#courses-8 .card-hover' },
  { sel: '#testimonials', side: '#testimonials .rounded-\\[2rem\\]' },
]
for (const lang of ['en', 'ar']) {
  for (const width of [1440, 1920, 2560]) {
    const ctx = await ctxFor(lang, width, 1000)
    const p = await ctx.newPage()
    await p.goto(BASE + '/', { waitUntil: 'networkidle' })
    for (const { sel, side } of SECTIONS) {
      const r = await p.evaluate(([sectionSel, sideSel]) => {
        const section = document.querySelector(sectionSel)
        if (!section) return { err: 'no section' }
        section.scrollIntoView({ block: 'center' })
        const video = section.querySelector('video')
        if (!video) return { err: 'no video' }
        const v = video.getBoundingClientRect()
        const sides = [...document.querySelectorAll(sideSel)].map(el => el.getBoundingClientRect())
          .filter(s => s.height > 40 && s.top < v.bottom && s.bottom > v.top && (s.left >= v.right - 20 || s.right <= v.left + 20))
        const all = [v, ...sides]
        const left = Math.min(...all.map(b => b.left))
        const right = Math.max(...all.map(b => b.right))
        const content = section.querySelector('.max-w-6xl, .max-w-5xl, .max-w-7xl') || section
        const cw = content.getBoundingClientRect().width
        return { beside: sides.length, coverage: (right - left) / cw }
      }, [sel, side])
      ok(`dead-zone [${lang} ${width}] ${sel} side content beside video`, !r.err && r.beside >= 1, r.err || `beside=${r.beside}`)
      ok(`dead-zone [${lang} ${width}] ${sel} row coverage ≥ 45%`, !r.err && r.coverage >= 0.45, r.err || `${Math.round((r.coverage || 0) * 100)}%`)
    }
    await ctx.close()
  }
}

// ── 3. Assistant free-text QA ─────────────────────────────────────────────
// [lang, question, substring(s) that MUST appear in the answer]
const QUESTIONS = [
  // 10 Arabic (incl. Iraqi dialect)
  ['ar', 'شقد سعر الكورس الاونلاين؟', ['360,000']],
  ['ar', 'بيش رسوم كورسات شهر ٨؟', ['360,000']],
  ['ar', 'شلون اسجل ابني عندكم؟', ['واتساب']],
  ['ar', 'وين فروعكم بالضبط؟', ['زيونة', 'المنصور']],
  ['ar', 'اكو دروس اونلاين لو بس حضوري؟', ['حضورياً وأونلاين']],
  ['ar', 'شنو اختبار تحديد المستوى؟', ['اختبار تحديد المستوى']],
  ['ar', 'كم مستوى عندكم بالمنهج؟', ['Pre-Level One']],
  ['ar', 'شلون ادفع بكي كارد؟', ['كي كارد']],
  ['ar', 'اي عمر تقبلون بالاكاديمية؟', ['يرحّب']],
  ['ar', 'منو المعلمين عندكم؟', ['تربويًا']],
  // S22: رفيق الرحلة (answers from the section's own copy)
  ['ar', 'شنو خدمة رفيق الرحلة؟', ['اهتمام يتجاوز الحصة']],
  ['ar', 'عندكم مرشد يتابع الطلاب؟', ['رفيق الرحلة']],
  // 5 English
  ['en', 'How much does the online course cost?', ['360,000']],
  ['en', 'Where are your branches located?', ['Zayouna', 'Mansour']],
  ['en', 'How do I register my child?', ['WhatsApp']],
  ['en', 'What ages do you accept?', ['welcomes young learners']],
  ['en', 'Is there a placement test for levels?', ['placement test']],
  // S22: Journey Companion
  ['en', 'What is the Journey Companion service?', ['beyond the lesson']],
]
const OUT_OF_SCOPE = [
  ['ar', 'اكو مسبح بالاكاديمية؟'],
  ['ar', 'شنو ساعات الدوام يوم الجمعة؟'],
  ['en', 'Do you offer French lessons?'],
]
const NO_MATCH = { ar: 'ما عندي جواب دقيق على هذا', en: 'I don’t have a precise answer' }

for (const lang of ['en', 'ar']) {
  const ctx = await ctxFor(lang)
  const p = await ctx.newPage()
  await p.goto(BASE + '/', { waitUntil: 'networkidle' })
  await p.locator('button.asst-fab').click()
  const panel = p.locator('[role="dialog"]')
  const input = panel.locator('input[type="text"]')

  // S29: answers reveal at a natural typing pace (700ms–2.4s per line) and
  // the input is guarded while "typing" — wait for the indicator to clear
  // before reading the log or asking the next question.
  const settled = async () => {
    await p.waitForTimeout(300) // let the indicator mount
    await p.waitForFunction(() => !document.querySelector('.asst-dot'), undefined, { timeout: 20000 })
    await p.waitForTimeout(150)
  }

  for (const [qLang, q, expects] of QUESTIONS.filter(x => x[0] === lang)) {
    await input.fill(q)
    await input.press('Enter')
    await settled()
    const txt = await panel.locator('.overflow-y-auto').textContent()
    const hit = expects.every(e => txt.includes(e)) && !txt.includes(NO_MATCH[qLang])
    ok(`assistant [${lang}] "${q.slice(0, 30)}"`, hit, hit ? '' : 'expected: ' + expects.join(' + '))
  }
  for (const [qLang, q] of OUT_OF_SCOPE.filter(x => x[0] === lang)) {
    await input.fill(q)
    await input.press('Enter')
    await settled()
    const txt = await panel.locator('.overflow-y-auto').textContent()
    const handoffVisible = await panel.locator('a[href*="wa.me"]').count()
    ok(`assistant [${lang}] OOS "${q.slice(0, 30)}" → honest handoff`, txt.includes(NO_MATCH[qLang]) && handoffVisible >= 1)
  }
  await ctx.close()
}

await browser.close()
console.log(fails === 0 ? 'ALL S21 CHECKS PASSED' : `${fails} FAILURES`)
process.exit(fails ? 1 : 0)
