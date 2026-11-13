// S45 — the workshop registration pipeline, proved on the site's side.
//
// The contract's rule: "Assert response-vs-page agreement — every value the
// thank-you screen shows must be the value the response returned. A page that
// renders a date the response did not send is the failure this assertion
// exists to catch."
//
// The endpoint is INTERCEPTED here rather than called for real, for two
// reasons: a real call writes a row into the academy's production database,
// and interception is the only way to exercise the variants that matter —
// null times, an online workshop with no branch, an armed bot, and every
// error code. The live wiring is proved separately by one real submission
// against production after deploy.
//
// Usage: node qa/s45-workshop-pipeline.mjs [--base http://localhost:5201]
import fs from 'fs'
import path from 'path'
import { chromium } from 'playwright-core'

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const BASE = process.argv.includes('--base')
  ? process.argv[process.argv.indexOf('--base') + 1]
  : 'http://localhost:5201'
const ENDPOINT = /qzwrflxhcumnwcramrdy\.supabase\.co\/functions\/v1\/workshop-register/

let pass = 0, fail = 0
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log(`  ✓ ${name}`) }
  else { fail++; console.log(`  ✗ ${name}  ${extra}`) }
}

// ── the contract's own sample response, verbatim ──────────────────────────
const FULL = {
  ok: true,
  already_registered: false,
  attendance_mode: 'online',
  attendee_type: 'my_child',
  confirm_url: null,
  bot_ready: false,
  workshop: {
    title: 'اسم مؤقت',
    starts_on: '2026-08-08',
    ends_on: '2026-08-09',
    session_start_time: '17:30:00',
    session_end_time: '19:30:00',
    is_online: true,
    offered_branches: [
      { id: 'b77a9b57-3bf8-447f-a2fd-dd651360cf76', name_ar: 'الأعظمية', address_ar: 'x' },
    ],
    branch_name: 'الأعظمية',
    branch_address: 'نهاية شارع عمر — عمارة صيدلية قصر بلاسم — الطابق الأول',
    branch_phone: '07717485887',
  },
}
const clone = o => JSON.parse(JSON.stringify(o))

async function run(browser, { lang = 'ar', reply, expect }) {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true,
    deviceScaleFactor: 3, locale: lang === 'ar' ? 'ar-IQ' : 'en-US',
  })
  await ctx.addInitScript(l => {
    try {
      localStorage.setItem('eg_lang', l)
      sessionStorage.setItem('eg_intro_seen', '1')
      sessionStorage.setItem('eg_hero_scene_seen', '1')
    } catch { /* private mode */ }
  }, lang)
  // never let a real request leave, and never let WhatsApp actually open
  await ctx.route(/wa\.me|whatsapp/i, r => r.abort())
  await ctx.route(ENDPOINT, reply)

  const page = await ctx.newPage()
  await page.goto(`${BASE}/workshop`, { waitUntil: 'networkidle' })
  await page.addStyleTag({ content: '*{content-visibility:visible !important}' })
  await page.evaluate(() => { window.__opened = null; window.open = u => { window.__opened = u; return null } })

  await page.locator('input[id$="-name"]').first().fill('اختبار QA — يرجى الحذف')
  await page.locator('input[id$="-phone"]').first().fill('07701234567')
  const em = page.locator('input[id$="-email"]').first()
  if (await em.count()) await em.fill('qa@example.com')
  // v1.2 — the function REQUIRES both; nothing is pre-selected by design
  await page.locator('[data-testid="ws-mode-online"]').click()
  await page.locator('[data-testid="ws-who-my_child"]').click()
  await page.locator('form button[type=submit]').first().click()
  await page.waitForTimeout(1400)

  const out = await page.evaluate(() => {
    const g = sel => document.querySelector(`[data-testid="${sel}"]`)
    const txt = sel => g(sel)?.innerText.trim() ?? null
    return {
      registered: !!g('ws-registered'),
      fallback: !!g('ws-fallback'),
      title: txt('ws-title'),
      when: txt('ws-when'),
      time: txt('ws-time'),
      where: txt('ws-where'),
      botCta: !!g('ws-bot-cta'),
      noBot: !!g('ws-no-bot'),
      opened: window.__opened,
      body: document.body.innerText,
    }
  })
  await ctx.close()
  return expect(out)
}

const json = body => route => route.fulfill({
  status: 200, contentType: 'application/json', body: JSON.stringify(body),
})
const err = (status, code) => route => route.fulfill({
  status, contentType: 'application/json', body: JSON.stringify({ error: code }),
})

const browser = await chromium.launch({ executablePath: CHROME })
console.log('S45 — workshop pipeline\n')

// ── 1. response-vs-page agreement, the contract's core assertion ──────────
console.log('response-vs-page agreement (AR)')
await run(browser, {
  lang: 'ar', reply: json(FULL),
  expect: o => {
    ok('thank-you rendered, not the fallback', o.registered && !o.fallback)
    ok('title === response.workshop.title', o.title === FULL.workshop.title, `${o.title}`)
    // the response's calendar values must be the ones on screen
    ok('date range shows both response days', /٨/.test(o.when) && /٩/.test(o.when) && /آب/.test(o.when), o.when)
    ok('time range shows both response times', /٥:٣٠/.test(o.time) && /٧:٣٠/.test(o.time), o.time)
    ok('branch name === response.branch_name', (o.where || '').includes(FULL.workshop.branch_name), o.where)
    ok('branch address === response.branch_address', (o.where || '').includes(FULL.workshop.branch_address), o.where)
    ok('no WhatsApp hand-off on success', !o.opened, String(o.opened))
    ok('ONE TRUTH: no fallback notice alongside success', !o.fallback)
  },
})

console.log('\nresponse-vs-page agreement (EN)')
await run(browser, {
  lang: 'en', reply: json(FULL),
  expect: o => {
    ok('EN thank-you rendered', o.registered)
    ok('EN title is the response title (placeholder flows verbatim)', o.title === FULL.workshop.title, `${o.title}`)
    ok('EN date range from response', /August/.test(o.when) && /8/.test(o.when) && /9/.test(o.when), o.when)
    ok('EN time range from response', /5:30/.test(o.time) && /7:30/.test(o.time), o.time)
  },
})

// ── 2. the bot leg lights up from the response alone ──────────────────────
console.log('\nbot CTA presence === confirm_url')
await run(browser, {
  lang: 'ar', reply: json(FULL),
  expect: o => ok('confirm_url null → no bot CTA, honest line instead', !o.botCta && o.noBot),
})
{
  const armed = clone(FULL)
  armed.confirm_url = 'https://t.me/egbot?start=w_abc123'
  armed.bot_ready = true
  await run(browser, {
    lang: 'ar', reply: json(armed),
    expect: o => {
      ok('confirm_url present → bot CTA rendered', o.botCta)
      ok('bot CTA replaces the "we will contact you" line', !o.noBot)
    },
  })
}

// ── 3. nulls are omitted, never invented ──────────────────────────────────
console.log('\nnull handling — omit, never invent')
{
  const noTime = clone(FULL)
  noTime.workshop.session_start_time = null
  noTime.workshop.session_end_time = null
  await run(browser, {
    lang: 'ar', reply: json(noTime),
    expect: o => {
      ok('null times → time line omitted', o.time === null, String(o.time))
      ok('null times → date still shown', !!o.when)
    },
  })
}
{
  const online = clone(FULL)
  online.workshop.branch_name = null
  online.workshop.branch_address = null
  online.workshop.branch_phone = null
  await run(browser, {
    lang: 'ar', reply: json(online),
    expect: o => {
      ok('all branch fields null → branch block omitted (online workshop)', o.where === null, String(o.where))
      ok('online workshop still shows when + title', !!o.when && !!o.title)
    },
  })
}

// ── 4. already_registered is not an error ─────────────────────────────────
console.log('\nalready_registered')
{
  const again = clone(FULL)
  again.already_registered = true
  await run(browser, {
    lang: 'ar', reply: json(again),
    expect: o => {
      ok('already_registered still renders the facts', o.registered && !!o.when)
      ok('already_registered is NOT treated as a failure', !o.fallback)
    },
  })
}

// ── 5. every error code falls back honestly ───────────────────────────────
console.log('\nerror codes → WhatsApp fallback, one truth on screen')
const CODES = [
  [400, 'name_invalid'], [400, 'phone_invalid'], [400, 'email_invalid'],
  [400, 'workshop_required'], [404, 'workshop_not_found'],
  [409, 'registration_closed'], [429, 'rate_limited'], [500, 'could_not_register'],
  [400, 'mode_invalid'], [400, 'attendee_type_invalid'],
  [400, 'branch_required'], [400, 'branch_not_offered'], [409, 'online_not_offered'],
  [409, 'capacity_reached'],
]
for (const [status, code] of CODES) {
  await run(browser, {
    lang: 'ar', reply: err(status, code),
    expect: o => {
      ok(`${code} (${status}) → fallback shown`, o.fallback, JSON.stringify(o).slice(0, 120))
      ok(`${code} → WhatsApp composer opened`, !!o.opened)
      ok(`${code} → ONE TRUTH (no success state)`, !o.registered)
    },
  })
}

// ── 6. the CSP-blocked / offline case — the failure this release was warned about
console.log('\nCSP-blocked / network failure')
await run(browser, {
  lang: 'ar', reply: route => route.abort('failed'),
  expect: o => {
    ok('blocked request → fallback, never a dead submit', o.fallback)
    ok('blocked request → composer opened', !!o.opened)
    ok('blocked request → no success state', !o.registered)
  },
})

// ── 7. a keyless build must not reach production ──────────────────────────
console.log('\nbuilt bundle carries the wiring')
{
  const dir = path.resolve('dist/assets')
  const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter(f => f.endsWith('.js')) : []
  const blob = files.map(f => fs.readFileSync(path.join(dir, f), 'utf8')).join('')
  ok('endpoint host is in the built bundle', blob.includes('qzwrflxhcumnwcramrdy.supabase.co'))
  ok('function path is in the built bundle', blob.includes('workshop-register'))
  ok('a well-formed anon JWT is inlined (not an empty env)', /eyJ[A-Za-z0-9_-]{30,}\.[A-Za-z0-9_-]{20,}/.test(blob))
  const headers = fs.readFileSync(path.resolve('public/_headers'), 'utf8')
  const csp = /connect-src[^;]*/.exec(headers)?.[0] ?? ''
  ok('CSP connect-src allows the endpoint origin', csp.includes('https://qzwrflxhcumnwcramrdy.supabase.co'), csp)
}

// ── S46: full-house must read DIFFERENTLY from closed, and its WhatsApp
// hand-off must be the WAITLIST ask, not the "help me register" support line.
console.log('\nS46 full-house — distinct from closed, waitlist valve')
{
  let fullText = null, closedText = null, fullHref = null
  await run(browser, { lang: 'ar', reply: err(409, 'capacity_reached'),
    expect: o => { fullText = o.body; ok('capacity_reached → fallback shown', o.fallback) } })
  await run(browser, { lang: 'ar', reply: err(409, 'registration_closed'),
    expect: o => { closedText = o.body } })
  ok('full-house says «اكتملت المقاعد»', /اكتملت المقاعد/.test(fullText || ''))
  ok('closed says «انتهى التسجيل»', /انتهى التسجيل/.test(closedText || ''))
  ok('the two codes read DIFFERENTLY to a family',
     /اكتملت المقاعد/.test(fullText || '') && !/اكتملت المقاعد/.test(closedText || ''))
  ok('full-house offers the waitlist', /قائمة الانتظار/.test(fullText || ''))
  ok('closed does NOT offer the waitlist', !/قائمة الانتظار/.test(closedText || ''))
}

await browser.close()
console.log(`\nS45 PIPELINE: ${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
