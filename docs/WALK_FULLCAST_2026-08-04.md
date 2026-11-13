# FULL-CAST WALK — PUBLIC FACE · 2026-08-04

Adversarial, **verify-only**. Nothing was fixed. Seven personas walked **production**
(`https://englishgate-school.com`, real network, real DNS) with their own goal, device
frame and doubts.

**Bundle under test:** `index-BXIRxzSG.js` = commit `272c909` (S41).

> **Read this first.** Production is **three commits behind `main`**. The S42 audit fixes
> (`fcd7c41`) and the react-router migration (`97c0cb4`) are committed, pushed and
> **not deployed** — the Cloudflare deploy is blocked on a credential problem
> (wrangler is authenticated as `yousif.hisoka09@gmail.com`, but the Pages project lives
> in `Yousifabdulkareem4business@gmail.com`'s account). So several breaks below are
> **already fixed in `main` and blocked only by that deploy**. They are marked
> **[FIXED–UNDEPLOYED]** and are not new work. Distinguishing the two is the single most
> important thing in this document.

Evidence screenshots: `docs/walk-2026-08-04/`.

---

## Counts

| Severity | New this walk | Already known, confirmed still live |
|---|---|---|
| **P0** broken | **0** | 0 |
| **P1** wrong | **2** | 3 |
| **P2** rough | **3** | 3 |
| **P3** polish | **2** | 1 |
| **Total** | **7** | **7** |

Coverage: 14 routes × 2 languages × 390 / 1440 = **56 page captures**, plus targeted
interactive runs (path-finder, both forms, hostile probe). **0 console errors,
0 warnings, 0 failed requests across all 56.**

---

## P1 — verbatim

### W-01 · The workshop page publishes an internal note naming the director as the blocker — four days before the event

**Route:** `/workshop`, AR **and** EN, every viewport.
**Live text (AR):** «اسم مؤقت — الاسم النهائي عند رسل»
**Live text (EN):** "Working title — the final name is with Rusul"
**Source:** `src/strings.js:1152` (`nameDraft`) — a deliberate, published string, not a leak.
**Repro:** load `https://englishgate-school.com/workshop`; the line sits directly under the
section sub-headline, above «ليش هالورشة؟».
**Evidence:** `docs/walk-2026-08-04/W-01-workshop-interim-name-ar.jpg`

The event itself is fully confirmed and correct on the page (free · ٨–٩ آب · ٥:٣٠–٧:٣٠
مساءً — all three match `src/data/workshops.js` exactly). The honesty policy that produced
this line is right in principle. But the event is **Aug 8–9 and today is Aug 4**: at T-4 a
parent deciding whether to bring her family reads that the academy has not settled the name
of its own event and is waiting on its director. It converts an invitation into a draft.
This is a content decision that has come due, not a defect — **رسل confirms the name, or the
line goes.**

### W-02 · Two routes have no `<h1>` and are **not** covered by the pending fix

**Routes with zero `h1` on production:** `/about`, `/programs`, `/staff`, `/testimonials`,
`/contact`, `/faq` — six routes, both languages, both viewports.
**Repro:** any of the six → `document.querySelectorAll('h1').length === 0`.

Four of those six (`/programs`, `/staff`, `/contact`, `/testimonials`) are fixed by the
undeployed F-03 commit. **`/about` and `/faq` are not.** They were outside F-03's scope and
will still render no `h1` after the blocked deploy lands. `/about` is the page a parent opens
to answer «منو انتو».

---

## P2

### W-03 · The review pages tell crawlers to index them

`/review-s38`, `/review-s39`, `/review-s40`, `/review-s41` each return **HTTP 200** with
`<meta name="robots" content="index, follow">`, a self-referencing `<link rel=canonical>`,
and a matching `og:url`. `robots.txt` `Disallow:`s all four, and they are **correctly absent
from `sitemap.xml`**, and a link sweep across all 56 captures found **zero** inbound links to
them — so discovery is unlikely. But `Disallow` prevents *crawling*, not *indexing*: a
disallowed URL discovered by any other route can still be indexed URL-only, and because
crawlers are forbidden to fetch the page they can never read the `noindex` that would
actually suppress it. The two directives work against each other. The undeployed F-04 fix
adds `noindex` to the 404 page only; it does not touch these.

### W-04 · The academy's own name is misspelled in the one message designed to be forwarded

**Route:** `/testimonials` → «شارك تجربتك».
**Prefill sent:** `السلام عليكم، أود مشاركة تجربة عائلتي مع إنغلش جيت: `
**Source:** `src/strings.js:1063` (`shareMsg`).

The site spells the academy **«إنجليش جيت» 30 times** and **«إنغلش جيت» once** — here. This
is the message a happy parent forwards to other families, so the one string most likely to be
read by a stranger carries the wrong spelling. **Still present in `main`** — S42 did not touch it.

### W-05 · The homepage says nothing to an adult learner

Zero occurrences of `بالغين` / `١٨` / `adult` / `18+` in the homepage text, either language.
Adult provision exists and is correct — `/programs` carries the `18+ (adult)` path-finder
band and an adults private-lessons card, and `/faq` states "adult courses run online only" —
but an adult arriving from a WhatsApp share lands on a page that addresses only parents, and
nothing on it signals the academy would take *him*. He has to already suspect it to go looking.

---

## P3

### W-06 · `/testimonials` prints the same quote twice

`parent-01` («حبيبي كلش اشكركم ع جهودكم وكادركم لحلو ولمميز…») renders in the testimonial belt
near the top of the page **and again** in the feedback wall below it. Same page, same words,
roughly one screen apart. With only four consented quotes, spending two of the six visible
slots on one family reads as thinner social proof than the academy actually has.
**Evidence:** `docs/walk-2026-08-04/W-06-testimonials-duplicate-quote-ar.jpg`

### W-07 · `/register` resolves to the 404 page

`https://englishgate-school.com/register` → HTTP 200, the 404 component. This is a facet of
the known F-04 (every unknown URL is a soft 404) and the head-tag half of it is
**[FIXED–UNDEPLOYED]**. Logged separately because `/register` is a URL a family could
plausibly try or be given by hand: the real intake is
`https://app.englishgate-school.com/register`, a different host. Nothing on the site routes
`/register` there.

---

## Already known — confirmed still live on production

All of these are S42 findings, re-verified against the live domain today.

| ID | Status | Confirmed live |
|---|---|---|
| F-01 | **[FIXED–UNDEPLOYED]** | Hero «اكتشف المزيد» still points at `#home-next`, which does not exist → the cue silently does nothing. |
| F-03 | **[FIXED–UNDEPLOYED]** (4 of 6) | See W-02. |
| F-04 | **[FIXED–UNDEPLOYED]** | `/register`, `/staff-mapping`, `/definitely-not-a-page` all → HTTP 200 + `index, follow` + self-canonical. |
| F-05 | **[FIXED–UNDEPLOYED]** | `/programs`, `/staff`, `/contact` carry the generic site title. |
| F-09 | **[FIXED–UNDEPLOYED]** | The footer WhatsApp icon opens an **empty** compose box — 14 routes × 2 languages, the only WhatsApp entry point on the site with no prefill. |
| F-06 | **RULING NEEDED** | Path-finder bands are ٥–٩ / ١٠–١٦ / ١٨+. A 17-year-old has no option. |
| F-07 | **RULING NEEDED** | `/programs` publishes `360,000 د.ع` (courses) and `$750` / `$550` (private lessons) on one page. Evidence: `docs/walk-2026-08-04/F-07-programs-two-currencies-ar.jpg` |
| F-12 | **RULING NEEDED** | `© OpenStreetMap contributors` renders as Latin text in AR mode on `/contact`. |

---

## Consent holds — **all holding**

| Hold | Expected | Live | Verdict |
|---|---|---|---|
| `parent-04` (names the child «شموسه») | absent | not present in page text | **HELD** |
| `parent-05` (names the child «حرير») | absent | not present in page text | **HELD** |
| Consented quotes | 4 (`parent-01/02/03/06`) | 4 rendered | **MATCHES** |
| Course-moment clips (4, held 2026-08-01) | absent | 0 references anywhere in `/moments` DOM | **HELD** |
| رسل's photograph | absent | director card renders the ر monogram treatment | **HELD** |
| Consented video | 1 (`parents-feedback`) | 1 `<video>`, `day-one-before-after.mp4` + the parents clip | **MATCHES** |

Every photograph of a child on the site traces to the `SESSIONS_ENABLED` set cleared by رسل
on 2026-07-27. No held asset appears anywhere.

---

## Facts checked against the repo — all true

Checked live text against `src/data/*.js` at the **deployed** commit (`272c909`).

- **20 educators** — the `/staff` counter settles at ٢٠ / 20, the page headline says
  «٢٠ تربويًا», and **all 20 roster names render**. Zero missing, zero extra.
- **17 photographs / 3 monograms** — exactly matches the three `null` photo slugs in
  `staff.js` (بشرى عقيل · آية ثائر · رقية ماجد حامد).
- **3 branches in Baghdad** — الاعظمية · زيونة · المنصور, matching `branches.js`.
- **Both phone numbers** — `+964 771 748 5887` and `+964 777 687 3528`, matching `contact.js`.
- **Workshop** — free · ٨–٩ آب · ٥:٣٠–٧:٣٠ مساءً, matching `workshops.js`.
- **Prices** — `360,000 د.ع` / `360,000 IQD`, `$750`, `$550`, matching `strings.js`.
- **Month label** — `COURSE_MONTH = 8` → «كورسات الشهر الثامن». **Correct today.** It is a
  manual flag with no expiry logic: it becomes wrong on **2026-09-01** unless rolled.
- **Single WhatsApp number** — all 132 distinct WhatsApp links across the site use
  `9647717485887`. No stray number.

Nothing on the live site contradicts the repo. **There is nothing here a rival could
screenshot as a lie.**

---

## S7 — hostile probe

**Clean.** No finding beyond W-03.

- **Console:** 0 errors, 0 warnings, 0 page errors across all 56 captures.
- **Network:** 0 responses ≥ 400.
- **Sourcemaps:** none — no `sourceMappingURL` in the production bundle.
- **File exposure:** `/.env`, `/.git/config`, `/package.json`, `/CLAUDE.md`,
  `/docs/AUDIT_SITE_2026-08-03.md`, `/qa/verify-points.mjs`, `/staff/incoming/`,
  `/videos/_originals/` all return the SPA shell (`text/html`), **not** the file. Nothing leaks.
- **Third-party hosts contacted:** exactly two — `static.cloudflareinsights.com` and
  `tile.openstreetmap.org`. **Both are disclosed by name** in `/privacy` and `/cookies`,
  including that map tiles send request data to OpenStreetMap.
- **Headers:** CSP with `object-src 'none'`, `base-uri 'self'`, `form-action 'none'`,
  `frame-ancestors 'none'`; HSTS 1 year + `includeSubDomains`; `X-Frame-Options: DENY`;
  `nosniff`; `referrer-policy: strict-origin-when-cross-origin`;
  `permissions-policy: camera=(), microphone=(), geolocation=(self), payment=()`.
- **`sitemap.xml`:** 14 public routes, no review pages, **no `/feedback`** (so the live sitemap
  is correct; F-21's note that `qa/s18.mjs` still asserts a `/feedback` entry stands).

---

## What each persona actually found

### S1 — the deciding mother · AR · 390 · evening

**Her four questions, from a cold landing on the homepage:**

| Question | Answered on the homepage? |
|---|---|
| منو انتو؟ | **Yes** — academy name, «عن الأكاديمية», the learning-journey section. |
| وين؟ | **Yes** — all three branches named. Street addresses live on `/contact` (reasonable). |
| شكد؟ | **Yes** — `360,000 د.ع` appears on the homepage. **She never has to DM to learn the price.** |
| شلون أبلش؟ | **Yes** — placement-test CTA and WhatsApp, both above the fold region. |

**Her child (٦ سنوات، ما يقرأ) gets the right answer.** Path-finder → «٥ – ٩ سنوات» → «لسّه لا»
→ **«التأسيس — جولي فونكس»**, with what it builds, group size, rhythm, assessment, and a
booking CTA. This is the strongest thing on the site.
Evidence: `docs/walk-2026-08-04/S1-pathfinder-result-ar.jpg`

**Where trust breaks for her:** the footer WhatsApp icon opening a blank message
(F-09, undeployed), the hero cue that does nothing (F-01, undeployed), and — if she goes to
the workshop — W-01.

### S2 — the English-only father · EN · desktop

**No Arabic leakage.** The only Arabic string in EN mode on all 14 routes is `عربي`, the
language toggle's own label — the documented exemption. `<html lang="en" dir="ltr">` correct
on every route; no RTL artefacts; no horizontal overflow at 1440 or 390.

**Parity holds** — same routes, same facts, same prices, same 20 teachers.

**One asymmetry, by design:** his WhatsApp messages are sent **in Arabic**. Booking a course
or asking about private lessons from the EN site composes Arabic text (`أرغب بالحجز في كورس
شهر ٨ (الإلكتروني)`). That is deliberate — it is the academy's inbox, not page copy — but he
cannot read what he is about to send. This is exactly the open ruling **F-10**.

### S3 — the adult learner (18+, for himself)

**Can he tell the academy serves adults?** Not from the homepage — see **W-05**.
**Once on `/programs`:** yes, and well. `18+ (adult)` band, an Adults private-lessons card
(`$550`, 3 months, 3 lessons/week), and `/faq` states adult courses run **online only** —
consistent with `adultsBody` in `strings.js`.
**Is he addressed as a parent when he isn't one?** The path-finder heading asks
«شنو يناسب طفلك؟» / "What suits your child?" — but selecting `18+` correctly drops the
can-they-read question and returns the adults track. Framing is parent-first; the logic is not.

### S4 — the skeptical aunt

Everything she could check, checked out. See **Facts checked against the repo** and
**Consent holds** above. Her one live catch is **W-04** (the misspelt name in the share
message). The month label is correct today and expires 2026-09-01.

### S5 — رسل herself · phone

**What would make her proud:** her 20 people all present and correctly named, including the
four display names taken from each teacher's own wording; 17 real photographs; the three
without photos carrying a designed monogram rather than a grey box; her own card carrying the
brand-illustrated pending treatment instead of a scraped social photo; the held quotes and
held clips genuinely absent; the path-finder answering a real mother's real question in two taps.

**What would embarrass her in front of a parent tomorrow:** **W-01** — a public page that says
her academy has not named its own workshop and is waiting on her, four days out. Then the
duplicate quote (**W-06**), which makes four families look like three.

### S6 — the prospect who acts

**Forms are honest.** Both real forms — placement (`/placement`) and workshop interest
(`/workshop`) — were exercised end-to-end with clearly-marked test data.

- **Nothing was delivered to the academy.** The site is **zero-backend**: submit runs
  `window.open('https://wa.me/…')` and composes a message; nothing sends until a human presses
  send inside WhatsApp. `window.open` was stubbed and all `wa.me` requests aborted at the
  browser, so **no message reached the academy's real number and no test record exists to delete.**
- **The composed message is truthful and complete** — placement: `السلام عليكم، أريد حجز موعد
  اختبار تحديد مستوى — الاسم: … · العمر: 6 · أونلاين`; workshop: name, phone, and the correct
  date/time `(٨–٩ آب، ٥:٣٠–٧:٣٠ مساءً)`.
- **The confirmation tells the truth about what happens next.** It says
  «فُتح واتساب لإرسال طلب الحجز» — *WhatsApp was opened to send your request* — plus a
  recovery anchor «إذا لم يُفتح، اضغط هنا» using the identical link. It never claims the
  academy received anything. This is the correct claim for a zero-backend site.
- **Validation is real.** Empty submit is blocked, `window.open` never fires, three specific
  errors render («يرجى إدخال الاسم» / «يرجى إدخال العمر» / «يرجى اختيار حضوري أو أونلاين»),
  and focus moves to the first bad field.
  Evidence: `S6-placement-validation-ar.jpg`, `S6-placement-confirmation-ar.jpg`

**Every WhatsApp prefill, read as a human recipient:** 132 distinct links, one number, **18
distinct messages**. All are polite, specific and identify the ask. Two problems only — the
empty one (F-09, undeployed) and Arabic-to-an-English-reader (F-10, open ruling).

**Hero → placement:** the hero's own CTAs are «راسلنا على واتساب», «استكشف المستويات» →
`/programs`, and «اكتشف المزيد» → `#home-next` (**F-01**, dead). The placement CTA is reached
from `/programs`, not the hero.

---

## THE FIVE MOMENTS TRUST BREAKS

Ranked across S1–S5 by how much ground is lost at that moment, not by how hard it is to fix.

**1. «اسم مؤقت — الاسم النهائي عند رسل» — the workshop, four days out.** *(W-01)*
She is deciding whether to give the academy an evening of her family's time. The page tells
her the academy has not decided what to call it. Everything else on that page is confirmed and
correct — free, the dates, the times — and this one line makes all of it look provisional.
It is the only place on the site where the visitor is shown the seam between what the academy
knows and what it has not settled. **Fix: رسل names it, or the line goes. Nothing else changes.**

**2. The most obvious WhatsApp button opens an empty message.** *(F-09 — fixed, undeployed)*
The floating/footer WhatsApp icon is the single most-tapped affordance for an Iraqi mother on
a phone at night. Every other WhatsApp entry on the site writes her opening line for her; this
one hands her a blank box and makes her compose the first sentence to a stranger — the exact
moment hesitation wins. **This is already fixed in `main`. It is live only because the deploy is blocked.**

**3. The hero invites a gesture, then ignores it.** *(F-01 — fixed, undeployed)*
«اكتشف المزيد» is the first thing the page asks her to do. It silently does nothing — no
scroll, no error, no movement. Nothing *looks* broken, which is worse: the page simply
doesn't respond to her. That reads as "this is a bit broken", and she generalises it from the
site to the academy. **Also already fixed in `main`, blocked only by the deploy.**

**4. Two currencies on one page.** *(F-07 — open ruling)*
`/programs` quotes courses at `360,000 د.ع` and private lessons at `$750` / `$550`. She cannot
compare the academy's two offers to each other without doing an exchange-rate calculation in
her head, and a rival can screenshot it as "they price in dollars". The number is not wrong —
the *pair* is what costs trust.

**5. A 17-year-old has no path.** *(F-06 — open ruling)*
The path-finder offers ٥–٩, ١٠–١٦, and ١٨+. A mother of a 17-year-old taps through the tool
built to tell her "your child belongs here" and is told, by omission, that he doesn't. She does
not read that as a gap in a form — she reads it as an answer.

**What this list says about the next sprint:** two of the top three are already fixed and are
live purely because a Cloudflare credential is wrong. **Unblocking that deploy is the
highest-value trust work available, and it is not code.** Of what remains, W-01 and F-06/F-07
are all decisions only رسل and Yousif can make — the next sprint's real content is a short
list of rulings, not a bug queue.

---

## Method notes — and three probe designs discarded

Discarded rather than reported, because each produced a plausible-looking finding that was an
artefact of the probe:

1. **"Session photographs are upscaled and blurry."** `naturalWidth` reported 559×746 for a
   file displayed at 382 CSS px on a DPR-3 phone. False. Under a `w`-descriptor `srcset`,
   `naturalWidth` is **density-corrected**, not the file's intrinsic width. The served file was
   fetched and measured directly: **1280×1707**, and `sha256` **byte-identical** to
   `public/images/sessions/sessions-01-1280-v2.webp`. Correctly provisioned. No finding.
2. **"The staff counter contradicts the roster — ١٤ in Arabic, 13 in English."** False. That is
   the `CountUp` animation sampled mid-count. Sampled every 800 ms for 6 s: both settle at
   **٢٠ / 20** and stay there. No finding.
3. **"The path-finder never returns a result."** False — my locator matched `/^لا$/` while the
   real button reads «لسّه لا». Corrected; the tool works exactly as designed.

**Harness choices**, recorded so the numbers can be reproduced: `eg_lang` seeded via
`addInitScript` so first paint is already in the persona's language; `eg_intro_seen` and
`eg_hero_scene_seen` seeded so the walk sees the page rather than the once-per-session intro;
`content-visibility: visible` injected and the page scrolled to its full height before every
measurement and screenshot, because `.cv-auto` hides off-screen sections from probes.
Chromium = installed Google Chrome. All timings are from a single machine on one network and
are not offered as performance findings.
