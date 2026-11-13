// S30 acceptance — director's content points rendered EXACTLY (B1–B14),
// layout-regression guards (A3/A4/A6 + mascot aspect), LinkedIn (C).
// Every check reads the RENDERED DOM — not the source strings.
// Usage: node qa/s30.mjs [--base http://localhost:4173]
import { existsSync } from 'node:fs'
import { chromium } from 'playwright-core'

const BASE = process.argv.includes('--base')
  ? process.argv[process.argv.indexOf('--base') + 1]
  : 'http://localhost:4173'
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'

const failures = []
const check = (name, ok, detail = '') => {
  console.log(`${ok ? '  ✓' : '  ✗ FAIL'} ${name}${!ok && detail ? ` — ${String(detail).slice(0, 140)}` : ''}`)
  if (!ok) failures.push(name)
}

const browser = await chromium.launch({ headless: true, ...(existsSync(CHROME) ? { executablePath: CHROME } : {}) })
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
await ctx.addInitScript(() => { try { sessionStorage.setItem('eg_intro_seen', '1'); localStorage.setItem('eg_lang', 'ar') } catch {} })
const p = await ctx.newPage()

const textOf = async path => {
  await p.goto(BASE + path, { waitUntil: 'networkidle' })
  await p.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 700) { scrollTo(0, y); await new Promise(r => setTimeout(r, 40)) } })
  // cv-auto skips off-screen sections' content — innerText would miss them
  // (the same workaround the screenshot tooling uses).
  // whitespace-normalized: headings line-wrap and innerText inserts \n
  // mid-phrase (e.g. «آراء أولياء\nالأمور») — the copy itself is intact.
  return p.evaluate(() => {
    document.querySelectorAll('.cv-auto').forEach(el => { el.style.contentVisibility = 'visible' })
    return document.body.innerText.replace(/\s+/g, ' ')
  })
}

// ── home: B1, B2, B3, B5, B6, B7 ─────────────────────────────────────────────
{
  const t = await textOf('/')
  check('B1 hero: director subtitle with her «..» rhythm', t.includes('بكل ثقة، انطلقوا برحلتكم ويانا. مستويات متدرجة.. مدربين محترفين.. أجواء تنافسية تساعد على التطور اللغوي. بيئة آمنة.. متابعة مستمرة.. تجربة رائعة للمتدربين!'))
  for (const chip of ['ابدأ باختبار تحديد المستوى', 'مستويات متعددة ومنتظمة', 'اطلاع أولياء الأمور بكافة التفاصيل', 'كادر محترف يملك الخبرة والمعرفة'])
    check(`B2 trust chip: «${chip.slice(0, 22)}…»`, t.includes(chip))
  check('B3 journey card «تأسيس اللغة»', t.includes('تأسيس اللغة'))
  check('B3 last card has NO «باللغة الإنكليزية»', t.includes('المحادثة والتواصل') && !t.includes('المحادثة والتواصل باللغة الإنكليزية'))
  check('B5 levels header «مستويات متعددة، مسارات مختلفة، هدف واحد»', t.includes('مستويات متعددة، مسارات مختلفة، هدف واحد'))
  check('B5 chips «ابدأ باختبار…» + «سلسلة أكاديمك ستار»', t.includes('سلسلة أكاديمك ستار'))
  check('B6 before/after headline «من البداية إلى التحدث بطلاقة»', t.includes('من البداية إلى التحدث بطلاقة'))
  check('B6 sub «شاهد تطور الأطفال معنا»', t.includes('شاهد تطور الأطفال معنا'))
  for (const pt of ['كل طفل ينطلق من مستواه الحقيقي', 'مستويات متعددة إلى غاية واحدة', 'التطور يبدأ من التشجيع والدعم لكل خطوة'])
    check(`B6 point «${pt.slice(0, 20)}…»`, t.includes(pt))
  check('B7 testimonials heading «آراء أولياء الأمور»', t.includes('آراء أولياء الأمور'))
  check('B7 old heading «ماذا تقول العائلات» GONE', !t.includes('ماذا تقول العائلات'))
  check('B7 sub «شاهد آراء أولياء أمور الأطفال حول تطورهم»', t.includes('شاهد آراء أولياء أمور الأطفال حول تطورهم في أكاديميتنا'))
  check('B7 CTA line «شارك رأيك لأجل تطوير طفل آخر»', t.includes('شارك رأيك لأجل تطوير طفل آخر'))
  check('B13 no «تسع مستويات» anywhere on home', !/تسع(ة)? مستويات|٩ مستويات/.test(t))

  // A3 guard: before/after columns roughly balanced (video ≤ 1.6× copy height)
  const bal = await p.evaluate(() => {
    const sec = document.querySelector('#video')
    const cols = sec?.querySelectorAll(':scope .grid > div')
    if (!cols || cols.length < 2) return null
    const h = el => el.getBoundingClientRect().height
    return { copy: Math.round(h(cols[0])), video: Math.round(h(cols[1])) }
  })
  check('A3 before/after columns balanced (video ≤1.6× copy)', bal && bal.video <= bal.copy * 1.6, JSON.stringify(bal))
  // A3/A4 guard: every mascot keeps the shield aspect (never squashed)
  const squashed = await p.evaluate(() =>
    [...document.querySelectorAll('.mascot')].map(m => {
      const r = m.getBoundingClientRect()
      return r.width > 0 ? +(r.height / r.width).toFixed(2) : null
    }).filter(x => x !== null && Math.abs(x - 214 / 200) > 0.06)
  )
  check('A3 no squashed mascots (aspect 200:214 everywhere)', squashed.length === 0, `bad ratios: ${squashed.join(',')}`)
  // A4 guard: all belt photos identical square boxes
  const belt = await p.evaluate(() => {
    const imgs = [...document.querySelectorAll('img[src*="/staff/"]')]
    const sizes = imgs.map(i => { const r = i.getBoundingClientRect(); return `${Math.round(r.width)}x${Math.round(r.height)}` })
    return [...new Set(sizes)]
  })
  check('A4 belt cards identical dimensions', belt.length <= 2, `distinct sizes: ${belt.join(' | ')}`)
}

// ── /contact: B8 + C ─────────────────────────────────────────────────────────
{
  const t = await textOf('/contact')
  check('B8 contact heading «زورونا أو تواصلوا معنا»', t.includes('زورونا أو تواصلوا معنا'))
  const li = await p.locator('a[href*="linkedin.com/in/english-gate-academy"]').count()
  check('C LinkedIn link on contact (clean URL)', li >= 1)
  const utm = await p.locator('a[href*="utm_"]').count()
  check('C no utm_ params in any link', utm === 0)
}

// ── /faq: B9, B10, B11, B12 ──────────────────────────────────────────────────
{
  await p.goto(BASE + '/faq', { waitUntil: 'networkidle' })
  // answers live in accordions — open them all before reading
  const btns = await p.locator('button:has-text("؟")').all()
  for (const b of btns) await b.click().catch(() => {})
  await p.waitForTimeout(600)
  const t = await p.evaluate(() => document.body.innerText.replace(/\s+/g, ' '))
  check('B9 Q1 «أي الأعمار تستقبلون؟»', t.includes('أي الأعمار تستقبلون؟'))
  check('B9 Q4 «ماذا لو تغيّب طفلي عن إحدى الحصص»', t.includes('ماذا لو تغيّب طفلي عن إحدى الحصص'))
  check('B9 Q8 «أين نزوركم؟» (not «أين تقعون»)', t.includes('أين نزوركم؟') && !t.includes('أين تقعون'))
  // S30.1: the director's verbatim form is PLAIN «سنطلعك» (no damma) — and
  // the damma variant must not sneak back in.
  check('B10 «سنطلعك على مستواه» present (plain, verbatim)', t.includes('سنطلعك على مستواه') && !t.includes('سنُطلعك'))
  check('B11 payment «راسل فريقنا على الواتساب ليزودكم بتفاصيل التحويل مباشرة.»', t.includes('راسل فريقنا على الواتساب ليزودكم بتفاصيل التحويل مباشرة.'))
  check('B12 missed-class: NO «لا توجد حصص», summary-video line present', !t.includes('لا توجد حصص') && t.includes('نرسل فيديو ملخصاً لكل درس في المجموعة الرسمية'))
  check('B13 journey answer verbatim', t.includes('رحلة متعددة المستويات، تتسلسل من المستويات الأولى لبناء أساس اللغة إلى التحدث بطلاقة في مستوى أكاديمك ستار، ضمن مناهج عالمية موثوقة.'))
  check('B13 no «تسع مستويات» on faq', !/تسع(ة)? مستويات|٩ مستويات/.test(t))
}

// ── /about: B4 + stats ───────────────────────────────────────────────────────
{
  const t = await textOf('/about')
  check('B4 founding paragraph («تأسست … عام ٢٠٢٠»)', t.includes('تأسست أكاديمية بوابة اللغة الإنجليزية عام ٢٠٢٠'))
  check('B13 stats row has سنة التأسيس, no «9 مستويات»', t.includes('سنة التأسيس') && !/9 مستويات|٩ مستويات|تسع(ة)? مستويات/.test(t))

  // S31 (item 3): BlobFrame geometry guard — the About photo must sit INSIDE
  // its organic clip wrapper and the wrapper inside the blob box (the
  // reported "photo shifted down out of its frame" failure shape). Probed
  // 16 ways (2 engines × 2 langs × 4 widths × mid-reveal/settled) clean at
  // guard time; this keeps it that way forever.
  await p.locator('#about img[src*="student-portrait"]').scrollIntoViewIfNeeded().catch(() => {})
  await p.waitForTimeout(900)
  const blob = await p.evaluate(() => {
    const img = document.querySelector('#about img[src*="student-portrait"]')
    if (!img) return null
    const wrap = img.parentElement
    const outer = wrap.parentElement
    const ir = img.getBoundingClientRect(), wr = wrap.getBoundingClientRect(), or = outer.getBoundingClientRect()
    return {
      imgInWrap: ir.top >= wr.top - 1 && ir.bottom <= wr.bottom + 1,
      wrapInOuter: wr.top >= or.top - 1 && wr.bottom <= or.bottom + 1,
      natural: img.naturalWidth > 0,
    }
  })
  check('S31 About photo sits inside its frame (no shift-out)', blob && blob.imgInWrap && blob.wrapInOuter && blob.natural, JSON.stringify(blob))
}

// ── /careers: B14 ────────────────────────────────────────────────────────────
{
  const t = await textOf('/careers')
  check('B14 intro verbatim', t.includes('يسعدنا دائماً ضم التربويين المتميزين الذين يحبون مساعدة الأطفال على التطور باللغة الإنكليزية.'))
  check('B14 «وظائف» not «شواغر»', t.includes('لا توجد وظائف متاحة حالياً') && !t.includes('شواغر'))
  const underline = await p.evaluate(() => !!document.querySelector('h1 .hl-underline'))
  check('B14 heading has NO underline decoration', !underline)
}

// ── footer: C on every page ──────────────────────────────────────────────────
{
  await p.goto(BASE + '/', { waitUntil: 'networkidle' })
  const li = await p.locator('footer a[href*="linkedin.com/in/english-gate-academy"]').count()
  check('C LinkedIn in footer', li >= 1)
}

await ctx.close()
await browser.close()
console.log(failures.length ? `${failures.length} FAILURES` : 'ALL S30 CHECKS PASSED')
process.exit(failures.length ? 1 : 0)
