# S42 — FULL SITE AUDIT (production)

**Date:** 2026-08-03 · **Target:** https://englishgate-school.com (live, not localhost)
**Build audited:** `index-BXIRxzSG.js` / `index-CEWuIhr5.css` · **Repo HEAD:** `272c909` (S41 scene), tree clean
**Scope:** `/` · `/programs` · `/staff` · `/workshop` · `/testimonials` · `/moments` · `/contact` · `/register`
(the three review pages are out of scope by instruction)
**Matrix:** 2 languages × 3 viewports (390 / 768 / 1440) = 48 page loads, plus targeted interaction passes.

Phase A is **read-only**. Nothing in this audit was fixed. Findings only.

---

## Summary

| Severity | Count |
|---|---|
| **P0** broken | **0** |
| **P1** wrong | **4** |
| **P2** rough | **4** |
| **P3** polish | **6** |
| **Total** | **14** |

**All five open rulings were given by the owner on 2026-08-04 and are encoded (S44):** F-06 and F-08
and F-10 became fixes; F-07 and F-12 were ruled correct as published and are closed with no code
change. F-14's deadline was removed rather than met — the flip now fires on its own date.

---

## Phase B / C outcome

Phase B dispatched four parallel agents with **disjoint file ownership** so they could not collide.
Phase C re-ran the auditor's own checks from scratch against a local production build — it did **not**
read the fixers' claims. **109/109 independent assertions passed, 0 failures.**

| ID | Status | Note |
|---|---|---|
| F-01 | **FIXED — verified** | `#home-next` anchor restored on Home. Cue now scrolls 858px (AR) / 875px (EN). |
| F-02 | **FIXED — verified** | Footer clearance now applies at `md`+. FAB overlap **54.3% → 0%** at 768/820/1024, and 30.6% → 0% at 1440; 390 byte-identical. |
| F-03 | **FIXED — verified** | `SectionHead` gained an optional `headingLevel`; exactly **1 h1 on all 7 routes**, both languages, both viewports. |
| F-04 | **FIXED — verified** | 404 now serves `noindex, follow` and removes the canonical; both restore correctly on navigating away. |
| F-05 | **FIXED — verified** | Per-route title + in-language description on `/programs`, `/staff`, `/contact`; AR description on `/`. Zero placeholder leaks. |
| F-06 | **RULED → FIXED (S44)** | Owner ruling 2026-08-04: middle band widens to «١٠–١٧»; adult band stays ١٨+. Encoded in both languages. Bands are labels — the routing buckets were already correct, so no logic changed. |
| F-07 | **RULED → CLOSED, correct as published** | Owner ruling 2026-08-04: two currencies is the TRUTH — private lessons stay $550/$750, courses stay ٣٦٠٬٠٠٠ د.ع. Nothing added, nothing converted. No code change. |
| F-08 | **RULED → FIXED (S44)** | Owner ruling 2026-08-04: AR mode prints money in Arabic-Indic numerals. Price strings only — digits converted, currency tokens and positions untouched; WhatsApp prefills deliberately unchanged. |
| F-09 | **FIXED — verified** | Footer WhatsApp link now carries the existing general prefill. 0 empty prefills, 0 wrong numbers. |
| F-10 | **RULED → FIXED (S44)** | Owner ruling 2026-08-04: prefills are ALWAYS Arabic in both modes — the desk answering them is Arabic. 22 EN-mode outliers switched to the academy's existing Arabic wording; the rule is documented in the strings.js header. |
| F-11 | **DEFERRED** | Transient font 502 — 2/48 then 12/12 clean. Nothing to fix; monitor only. |
| F-12 | **RULED → CLOSED, stays as-is** | Owner ruling 2026-08-04: the attribution is a licence condition and stays exactly as published. No code change. |
| F-13 | **DEFERRED** | `/logo.png` → WebP. Deliberately not taken: the nav logo is the element that wrongly won LCP before the S41-pre fix, and re-plumbing it through a `<picture>` risks that work for 30 KB. Worth doing in a sprint that can re-run the LCP probe as its acceptance test. |
| F-14 | **FIXED (S44) — self-acting** | The flip is now data-driven: every event carries `endsOn`, and UPCOMING/PAST are derived from today's date at module load. The Aug 8–9 workshop moves itself to PAST on 2026-08-10 with no edit and no deploy. Proved against a faked clock by `qa/s44-workshop-flip.mjs` (19/19). |

**Fixed and verified: 6 · Ruling needed: 5 · Deferred with reason: 3.**

### New findings raised by the fixers (added, not fixed — per scope lock)

| ID | Sev | Finding |
|---|---|---|
| F-15 | P3 | Promoting each lead head to `h1` leaves an **`h1 → h3` step** on `/programs`, `/staff`, `/contact` (their next head is an `h3`). axe `heading-order`, moderate. Strictly better than having no `h1`; closing it means promoting those sections' `GroupHead`/sub-heads to `h2`. |
| F-16 | P3 | `CanonicalSync` (`src/App.jsx`) still stamps **`og:url`** with the bogus path on a 404 — same defect class as F-04, different tag. Now moot for crawlers since the page is `noindex`, but wrong for link unfurls. |
| F-17 | P3 | `src/sections/Staff.jsx:266` fakes a heading with `role="heading" aria-level={3}` on a `<div>` — the only synthetic heading on the site. |
| F-18 | P3 | `.wa-tip` is `position:fixed; bottom:2.2rem` with **no `env(safe-area-inset-bottom)`**, unlike every other fixed bottom element; it can sit under a home indicator. It is `pointer-events:none`, so it blocks nothing. |
| F-19 | P3 | Opening `.asst-panel` at the very bottom of the page covers the footer CTA by ~28px. Pre-existing behaviour of a user-invoked dialog that carries its own WhatsApp button — nothing moved in F-02. |
| F-20 | P3 | The footer's bottom bar is `flex-row` with no `flex-wrap` from 640px up; at 768 the row survives only because the copyright text wraps. A longer string would squeeze the CTA instead of wrapping the row. |
| F-21 | P3 | `qa/s18.mjs:24` still lists `/feedback` in `ROUTES` and asserts a `.../feedback` canonical + sitemap entry, but `/feedback` has redirected to `/testimonials` since S38s. The check looks stale. **Not touched** — QA files are the owner's. |
| F-22 | P3 | The EN home meta description (`hero.subheadline`, ~250 chars) exceeds the ~155-char SERP cutoff and will be truncated. The AR one is ~155. A purpose-written home `metaDesc` would need a new `strings.js` string, which no fixer may invent. |

### S42 rider — GHSA-qwww-vcr4-c8h2 cleared

The allowlisted react-router advisory (accepted 2026-07-28, expiry **2026-08-15**) is closed, and the
allowlist entry deleted in the same commit per the file's own standing rule.

**It was not a bump — it was a major migration, because a bump does not exist.** The advisory's fixed
range is `>=8.3.0`, and `react-router-dom` has **no 8.x**: `npm view "react-router-dom@>=8.0.0"` returns
E404, its `latest` is 7.18.2, so the package is permanently inside the vulnerable range `>=7.12.0 <8.3.0`.
React Router v8 drops the `react-router-dom` shim; the patched artifact is `react-router@8.3.0`.

What changed:
- `react-router-dom@^7.18.1` → `react-router@^8.3.0` (one direct dependency replaced by one — the same
  library under the name it now ships as). Peers satisfied: v8 needs React ≥19.2.7; the app is on 19.2.7.
- **14 import sites** rewritten from `'react-router-dom'` to `'react-router'`. Only six APIs are used
  across the whole app — `BrowserRouter`, `Link`, `Navigate`, `Route`, `Routes`, `useLocation` — all
  present in v8's root entry, so no call-site semantics changed.
- Runtime dependency count went **down**: transitively `cookie` + `set-cookie-parser` → `cookie-es`.
  Bundle 345.31 kB → 344.50 kB.
- `qa/security/audit-allowlist.json` `allow` is now `[]`. The `_readme` and the mechanism stay.

`npm audit --omit=dev` → **found 0 vulnerabilities**. `audit-gate` → **PASS, 0 documented acceptances,
0 unreviewed high/critical** — no EXPIRED warning, and no STALE warning either (the entry is gone, not
orphaned).

Because a router major bump breaks *client-side* behaviour that full page loads never exercise, a
dedicated **22-assertion SPA-navigation guard** was run on top of the normal bar: in-app `Link`
navigation across four routes with **zero full page reloads**, the `<Navigate replace>` `/feedback` →
`/testimonials` redirect, history back/forward, scroll-reset on route change, and the F-04 head
lifecycle driven entirely client-side (404 → `noindex` + canonical removed → click home → `index, follow`
+ canonical restored). **22/22 passed in both languages, zero uncaught errors.**

### Full bar (Phase C)

`verify-points 27/27 ALL GREEN` · `s14 0 failures (20 teachers, 3 branches)` · `matrix 196 checks / 14 pages / 2 langs / 7 viewports, 0 failures` · `scan chromium 0 findings` · `scan webkit 0 findings` · `qi-card ALL PASSED` · `webkit-iphone ALL PASSED` · `lint 0 errors`.

LCP element identity after the fixes is unchanged: `/` still crowns **`h1.h-display`**, `/programs` `p.mt-4`, `/staff` `img.absolute`.

---

## P1 — wrong

### F-01 · The homepage scroll cue points at an element that does not exist
- **Route:** `/` (both languages) · desktop only (`hidden lg:flex`, so ≥1024px)
- **Repro:** load `/` at 1440×900, click the «اكتشف المزيد» / "Scroll to explore" cue at the bottom of the hero.
- **Evidence:** the cue is `<a href="#home-next">` (`src/sections/Hero.jsx:193`) but **no element in `src/` carries `id="home-next"`** — `grep -rn 'home-next' src/` returns only that one line. Measured live: `targetExists: false`, and clicking moves the page `from: 0 → to: 0`. `useSmoothAnchors` (`src/hooks/useSmoothAnchors.js`) bails with `if (id && !target) return` *before* `preventDefault`, so the dead href silently no-ops.
- **Regression age:** the id was last present in `ce5bc42` (S39 home restructure); it has been dead through S40 and S41.
- **Note:** the S38t/S41 hit-target fix is intact — the cue is correctly clickable (`hitTestSelf: true`, z-10, 720×50). Only its destination is missing.
- **Proposed fix:** put `id="home-next"` on the section that follows the hero band (TrustStrip's successor on Home), or point the cue at an id that already exists.

### F-02 · The assistant FAB covers the footer's WhatsApp CTA at tablet widths
- **Routes:** all 7 in-scope routes (the footer is global), both languages
- **Repro:** load any route at **768×1024**, scroll to the bottom of the page, try to tap the footer's «راسلنا على واتساب» / "Message us on WhatsApp".
- **Evidence:** measured overlap of the footer CTA by `button.asst-fab`:

  | viewport | overlap | centre hit-test |
  |---|---|---|
  | 768×1024 | **54.3 %** | **blocked** by `button.asst-fab` |
  | 768×1180 | **54.3 %** | **blocked** |
  | 820×1180 | **55.2 %** | **blocked** |
  | 1440×900 | 30.6 % | not blocked |
  | 390×844 | 0 % | clean |

  Tapping the centre of that CTA opens the assistant instead of WhatsApp. Corroborated independently by the contrast pass, which measured the CTA's "background" as `rgb(12,60,68)` — that is `--color-block-deep: #0C3B47`, the FAB's own fill, bleeding over the button.
- **Root cause:** the spacer that reserves room above the footer is `class="h-20 md:hidden"` (`src/App.jsx`) — it exists **only below `md`**, i.e. only where the collision does not happen. From `md` up nothing reserves space for the FAB, whose `bottom` is `6rem` at ≥768px (`src/index.css:249-252`).
- **Proposed fix:** reserve equivalent footer clearance at `md` and above (or inset the footer's last column clear of the FAB's corner).

### F-03 · Four routes render no `<h1>` at all
- **Routes:** `/programs`, `/staff`, `/testimonials`, `/contact` — **0 `<h1>` in every language and every viewport** (12 combos each). `/`, `/workshop`, `/moments` and the 404 each have exactly 1.
- **Repro:** `document.querySelectorAll('h1').length` on each route → `0`.
- **Evidence:** heading outline starts at `<h2>`: `/programs` → h2 «رحلة واحدة متصلة»; `/staff` → h2 «الأشخاص خلف كل تقدّم»; `/contact` → h2 «زورونا أو تواصلوا معنا». Corroborated by the LCP probe: with no h1 on `/programs`, the LCP element is a body paragraph (`p.mt-4`).
- **Impact:** screen-reader page structure and SEO both lose the page's primary heading.
- **Proposed fix:** promote each page's existing top section heading from `h2` to `h1` (copy unchanged — it is already the right text).

### F-04 · Every unknown URL is an indexable soft 404
- **Routes:** any path not in the route table, including `/register` (which the audit brief named — **it is not a route**; the real registration lives at the external `app.englishgate-school.com/register`).
- **Repro:** `curl -sI https://englishgate-school.com/definitely-not-a-page` → `HTTP/2 200`. Same for `/register`, `/sw.js`, anything.
- **Evidence:** `public/_redirects` is `/*  /index.html  200`, so the SPA shell answers everything with **HTTP 200**. The 404 page then renders «يبدو أن هذه الصفحة ضاعت» / "This page wandered off" while the document still declares `<meta name="robots" content="index, follow">` and `CanonicalSync` writes a **self-referential canonical** (`https://englishgate-school.com/register`). `/sw.js` likewise returns `content-type: text/html`.
- **Impact:** search engines may index arbitrary mistyped URLs as real pages.
- **Proposed fix:** have `NotFoundPage` set `robots: noindex` (and drop the self-canonical) while it is mounted — same `useEffect` convention `MomentsPage` already uses for title/description.

---

## P2 — rough

### F-05 · Three routes carry the generic title, and four serve an English meta description in Arabic mode
- **Routes:** title — `/programs`, `/staff`, `/contact`; description — those three **plus `/`** (and the 404)
- **Repro:** read `document.title` and `meta[name=description]` on each route in AR mode.
- **Evidence:** these routes keep the static shell's `أكاديمية إنجليش جيت | English Gate Academy` and the shell's **English** description — *"English Gate Academy — a premier English academy for children in Baghd…"* — while in AR/RTL mode. `/workshop`, `/testimonials` and `/moments` do set their own per-route AR title and description (the `useEffect` convention in `src/pages/MomentsPage.jsx`). Canonical tags are correct on every route.
- **Note:** the generic title is *correct* for `/` — it is the site title. Home's issue is the English description only.
- **Proposed fix:** adopt the existing `MomentsPage` title/description effect on the four routes that lack it, using strings that already exist per mode.

### F-06 · The path finder has no answer for a 17-year-old
- **Route:** `/programs` → «شنو يناسب طفلك؟»
- **Repro:** open the path finder; the age choices are «٥ – ٩ سنوات» / «١٠ – ١٦ سنة» / «١٨ سنة فما فوق» (`5 – 9` / `10 – 16` / `18+`).
- **Evidence:** `src/sections/PathFinder.jsx` `AGES = ['young','older','adult']` with labels from `strings.pathFinder.a1`. **Age 17 falls in the gap** — a 17-year-old cannot answer question 1 truthfully. All six reachable combinations were tested live in both languages and every one returns the documented operations rule correctly, so the logic is right; only the age coverage is incomplete.
- **Proposed fix:** widen the middle band to «١٠ – ١٧» or the adult band to «١٧+» — **which one is an operations decision, not a code decision** (see also F-07's note that this is Yousif's call, not a fixer's).

### F-07 · Two currencies published on the same page — **RULING NEEDED**
- **Route:** `/programs`, both languages
- **Evidence:** the page publishes `360,000 د.ع` / `360,000 IQD` for the 8th-month courses **and** `$750` / `$550` for private one-to-one lessons, side by side. `src/strings.js` carries `kidsPrice: '$750'`, `adultsPrice: '$550'` in **both** the AR and EN blocks. The repo already flags the underlying uncertainty: *"رسل's pricing question is still unanswered, so they are one edit from being pulled"* (`src/strings.js`, privateTeaching).
- **Why this is not a fixer's call:** converting or restating a price would invent a fact. Only the academy can say whether private lessons are genuinely priced in USD.
- **Recommendation:** confirm with رسل whether private lessons are quoted in USD; if yes, keep and leave as-is; if no, restate in IQD.

### F-08 · Arabic mode mixes Arabic-Indic and Western numerals in published prices — **RULING NEEDED**
- **Route:** `/programs` (and `/` for the course price), AR mode
- **Evidence:** in the same AR view the site renders `٣ أشهر`, `٣٦ محاضرة`, `٥ – ٩ سنوات`, `١٠٠ ألف` (Arabic-Indic) alongside `360,000 د.ع` and `$750` / `$550` (Western). Both conventions are in `src/strings.js` today.
- **Why this is not a fixer's call:** it is a house-style decision about how money is written in Arabic; the S21 note says the price strings deliberately mirror the director's own public announcements.
- **Recommendation:** decide one convention for money in AR mode and apply it to the price strings only (leave the director's WhatsApp prefills untouched).

---

## P3 — polish

### F-09 · The footer's WhatsApp icon is the only WhatsApp link on the site with no prefill
- **Routes:** all 7, both languages (14/14 combos)
- **Evidence:** `src/sections/Footer.jsx:160` uses `waLink()` with no argument. Every other WhatsApp entry point on the site carries a contextual message; audited **0 wrong numbers** and **0 missing `rel="noopener"`** across all 14 combos.
- **Proposed fix:** pass the general `contact.whatsappMsg` to that one link.

### F-10 · WhatsApp prefill language is inconsistent in EN mode — **RULING NEEDED**
- **Evidence:** in EN mode, `courses8` ("Book on WhatsApp") and `privateTeaching` ("Ask about private lessons") send **Arabic** text; `pathFinder`, `workshop` and `placement` send **English**. `courses8`'s Arabic is explicitly deliberate and documented (*"her exact Arabic text in BOTH modes: it is the message her team receives, not page copy"*); `privateTeaching` follows the same shape with no such note.
- **Recommendation:** confirm the rule is "prefills are always the team's Arabic" and add the missing note, or switch the two English-mode outliers — either way, one stated convention.

### F-11 · Intermittent 502 on a font asset
- **Evidence:** `/fonts/nunito-latin-600-normal.woff2` returned **502** on 2 of 48 page loads (`moments_en_390`, `staff_en_1440`), surfacing as the only console errors in the entire sweep. On direct retest it returned **200 on 12/12** requests. Transient edge behaviour, not a missing file.
- **Proposed fix:** none required; monitor. Raise only if it recurs.

### F-12 · Map attribution is Latin text in Arabic mode — **RULING NEEDED**
- **Route:** `/contact`, AR mode
- **Evidence:** the only non-exempt Latin strings anywhere in AR mode are Leaflet's tile attribution, "OpenStreetMap" and "contributors". (The wordmark "English Gate" and the «عربي»/EN toggle are exempt by standing rule; "Pre-Level One" is a documented director decision to keep that level name in English in both modes.)
- **Why this is not a fixer's call:** OSM attribution is a licence condition; altering or translating it has legal implications.
- **Recommendation:** leave as-is unless you want the surrounding chrome localised — confirm acceptable.

### F-13 · The logo is the site's only non-modern raster asset
- **Evidence:** of 62 unique images loaded across the sweep, the only legacy-format asset the site owns is `/logo.png` (30,490 bytes, `image/png`). Every other own-asset is `.webp`. The remaining PNGs are third-party OpenStreetMap tiles.
- **Proposed fix:** ship a WebP logo with the PNG as fallback.

### F-14 · The workshop date has no expiry
- **Route:** `/workshop`, `/` teaser
- **Evidence:** `src/data/workshops.js` `UPCOMING` holds the single event `parents-aug-2026` — «٨–٩ آب» / "August 8–9", 5:30–7:30 PM, free. Verified rendering correctly today. **Today is 2026-08-03, so this is accurate now**, but on 2026-08-10 the page will still present a finished event as upcoming; `PAST` is empty and nothing moves the entry automatically.
- **Proposed fix:** none today — flagging the date so it is moved to `PAST` (or replaced) on 2026-08-10.

---

## Verified clean (no findings)

These were checked and passed — recorded so the same ground is not re-swept.

- **Layout / overflow:** zero horizontal overflow in **all 48 combos** (2 langs × 3 viewports × 8 routes).
- **Path-finder logic:** all 6 reachable age × reading combinations return the documented operations rule, in both languages. Keyboard-reachable, `aria-pressed` on every choice.
- **Language toggle:** round-trips on **all 8 routes** — path preserved, `lang`/`dir` flip correctly, headline returns identical.
- **Forms:** `/workshop` and `/placement` block **empty *and* whitespace-only** submits in both languages, with localised `role="alert"` messages, `aria-invalid`, and focus moved to the first bad field. No WhatsApp popup, no navigation. (`noValidate` is deliberate — HTML5 `required` passes on `"   "`.)
- **Consent:** zero leaks. The two held quotes (parent-04 / parent-05, naming شموسه and حرير) appear nowhere; the 4 held clips are absent; the director's card correctly shows no photograph.
- **Staff truth:** all **20** roster names render in both languages, **17** photos = exactly the 17 non-null entries in `staff.js`, zero broken images.
- **Contact truth:** both published numbers, `tel:` links, WhatsApp `9647717485887`, Telegram, all three branch names and all map pins match `contact.js` / `branches.js` exactly.
- **Content truth:** «كورسات الشهر الثامن» / "8th-Month Courses" matches `COURSE_MONTH = 8` and is current for August; workshop date/time/free-ness match `workshops.js`; age floor 5 consistent.
- **Links:** 50 unique links crawled — **0 broken internal links**, 0 dangling anchors other than F-01. All socials resolve in a real browser (Facebook → "English gate", Instagram → the academy's handle, TikTok, app register 200). LinkedIn returns its `authwall` to any signed-out client — shape is valid, cannot be verified without an account.
- **Media:** all 7 videos serve `206` with real content-lengths. The `ERR_ABORTED` entries in the network log are normal cancelled range requests, not failures.
- **Images:** 0 broken, 0 missing `alt`. Every image lacking width/height is a third-party OSM tile.
- **Accessibility:** 45 tab stops on `/programs` — **0 unreachable, 0 without a visible focus ring**, no traps. Zero tap targets under 32px on any route at 390px. Landmarks present on every route.
- **Contrast (WCAG AA):** no failures on stable, unobstructed text. Measured from **rendered pixels** (declared colour vs the real painted background) because Tailwind v4 `color-mix()` backgrounds make a computed-style walk unreliable — a naive pass produced 30 false positives, all of which dissolved under pixel measurement. The only sub-AA readings that survived are the three caused by F-02's overlap.
- **Security headers:** CSP, HSTS, `X-Frame-Options: DENY`, `nosniff`, Referrer-Policy, Permissions-Policy and COOP/CORP all present on production.
- **S41 scene:** first visit plays (`scene-play`, 13 word spans, `h1` opacity 1 throughout); same-session return does not replay; `prefers-reduced-motion` never splits the headline and never sets the class. Entrance discipline is behaving exactly as designed.

---

## LCP probe — element identity (3 key routes)

Method: Chromium, mobile 390×844 dsf2, cold context, AR, `PerformanceObserver` buffered, 5 runs.
**Element identity is the finding; the milliseconds are indicative only (±800 ms noise floor on this machine) and are not pass/fail.**

| Route | LCP element | median (indicative) |
|---|---|---|
| `/` | **`h1.h-display`** «خلّي طفلك يبلّش رحلته ويانا…» | 552 ms |
| `/programs` | `p.mt-4` «مسارات ضمن رحلة واحدة متصلة» | 1384 ms |
| `/staff` | `img.absolute` | 1368 ms |

`/` still crowns the `h1` in production — the S41 Phase 1 fix is holding. On `/programs` a body paragraph wins
because the route has no `h1` at all (F-03).

---

## Method notes

- All measurements are against **production**, not a local build.
- Three probe designs were discarded during the audit for producing false positives, and their output is **not** in this report: a computed-style contrast walk (30 false positives from Tailwind v4 `color-mix()`), a fixed-element overlap heuristic (flagged the closed mobile drawer, which has no pointer events), and a bottom-of-page hit test that caught one element in a scroll race that would not reproduce.
- A first contrast implementation screenshotted every element individually, stalled at 0 % CPU after 16 minutes, and was killed under the hang rule; it was replaced with a two-screenshots-per-scroll-step design and re-run cleanly.
- `qa/verify-points.mjs` was **not** read for assertions, modified, or executed as part of this audit. `qa/lcp-probe.mjs` was copied to a scratch file to add a route parameter; **the repo tool itself is untouched.**
