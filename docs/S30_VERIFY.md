# S30 / S30.1 — Verification table (regression hunt + content points + LinkedIn)

**Date:** 2026-07-14 · **State:** HOLDING at localhost, uncommitted, awaiting owner approval.
**Screenshots:** `qa/s30-shots/` — after-fix per section (`a1`–`a6`, home about teaser) plus the two reproduced before-states (`before-a3.png`, `before-a6.png`). Production-comparison and mobile/WebKit variants were captured during the hunt (all clean) in the session scratchpad.
**Assertion net:** `qa/s30.mjs` — 40 rendered-DOM checks covering every point below; runs against any base URL.

| Point | Before | Now | Evidence |
|---|---|---|---|
| 0 media | interrupted-encode fear | No 0-byte/partial media; all 7 mp4s decode | STEP-0 scan; `public/videos/_originals/` intact |
| A1 About circle | reported empty/shifted | Not reproducible (chromium+webkit × desktop+mobile × local+prod — photo in mask in all shots); BlobFrame already ships explicit dims + aspect | `src/components/BlobFrame.jsx:84-95`; `qa/s30-shots/a1-about-section.png` |
| A2 How heading | reported clipped | Not reproducible (4 rigs); heading/reveal sound in code | `src/sections/HowItWorks.jsx:53-60`; `qa/s30-shots/a2-how.png` |
| A3 before/after | REPRODUCED: portrait clip ~1300px vs ~450px copy → dead zone; mascot squash-prone (svg width:100%, no height) | Portrait cap `lg:max-w-3xl`→`24rem` (guard: video ≤1.6× copy); Mascot svg now has explicit px width+height + wrapper aspect-ratio + preserveAspectRatio | `src/sections/Video.jsx:80-84`, `src/components/Mascot.jsx:24-45`; `before-a3.png` → `a3-beforeafter.png` |
| A4 belt cards + stray squiggle | caption-less cards could differ; squiggle not reproducible | Belt/wall photos `aspect-square object-cover` (guard: identical rendered dims); `.hl-underline` hardened (explicit attrs + inline gold) so partial-CSS can never explode it into a giant dark squiggle | `src/pages/Home.jsx:204,287`, `src/sections/Staff.jsx:162`, `src/components/HighlightWord.jsx:8-16` |
| A5 gallery squiggles | not reproducible (clean in prod+local, 3 engines) | Same `.hl-underline` hardening (it sits in every highlighted heading incl. belt + gallery); Doodle/SpotObject audited — already explicitly sized | `src/components/Doodle.jsx:16-19`; `qa/s30-shots/a5-gallery.png` |
| A6 testimonials | REPRODUCED: left half empty beside tall phone clip | Header gained director's sub; invite strip carries her CTA line — fuller balanced column | `src/sections/Testimonials.jsx:13,32,55`, `src/components/FeedbackShared.jsx:13-28`; `before-a6.png` → `a6-testimonials.png` |
| B1 hero | comma rhythm | Her exact «..» rhythm (hamza-normalized only) | `src/strings.js` hero.subheadline |
| B2 trust chips | ✅ S28 | all four verbatim rendered | `src/strings.js` trust.items |
| B3 تأسيس اللغة / drop «باللغة الإنكليزية» | ✅ S28 | verified rendered | `src/strings.js` home.stages |
| B4 About ٢٠٢٠ | ✅ S28, committed (`6a81230`) | verified rendered | `src/strings.js` about.intro |
| B5 levels header + chips | ✅ S28 | verbatim rendered | `src/strings.js` home.programsTitle/highlights |
| B6 before/after copy | ✅ S28 | headline + sub + 3 points rendered | `src/strings.js` video.* |
| B7 testimonials header | ❌ home section still «ماذا تقول العائلات» | «آراء أولياء الأمور» + sub + CTA line; old heading asserted GONE | `src/strings.js` testimonials, `src/sections/Testimonials.jsx:13` |
| B8 contact heading | ✅ S28 | verbatim | `src/strings.js` contact.headline |
| B9 FAQ Q1/Q4/Q8 | ✅ S28 | all three; «أين تقعون» gone | `src/strings.js` faq |
| B10 «سنطلعك على مستواه» | S30 build had «سنُطلعك» (damma) — the S30.1 report | plain verbatim form in FAQ Q5 + trackChild; damma variant asserted absent | `src/strings.js` faq[4], trackChild.body |
| B11 payment | ✅ S28 | verbatim | `src/strings.js` faq[6] |
| B12 missed-class | «لا توجد حصص تعويضية…» | warm: «لا تقلق — نرسل فيديو ملخصاً لكل درس…»; zero «لا توجد حصص» | `src/strings.js` faq[3] |
| B13 journey + kill all 9s | hero card still «٩ مستويات» (hardcoded) | count-free card («مستويات متسلسلة»); zero تسع/٩/9-levels in DOM, meta, OG, JSON-LD, assistant KB; stats = real only | `src/sections/Hero.jsx:18-28` |
| B14 careers | ✅ S28 | intro verbatim, «وظائف», plain heading | `src/pages/CareersPage.jsx:31` |
| C LinkedIn | absent | SOCIALS entry (footer+contact auto), SVG icon, bilingual labels, JSON-LD sameAs, utm-free | `src/lib/contact.js:22-28`, `src/components/Icon.jsx`, `index.html` sameAs |

## S30.1 dead-string cleanup (source-level, so nothing can regress back)

| Phrase | Cleaned at | Was |
|---|---|---|
| «سنُطلعك» (damma variant) | `src/strings.js:744` trackChild.body, `:998` faq[4].a (+ comment `:743`) | copy normalized to the director's plain «سنطلعك على مستواه» |
| «لا توجد حصص» | `src/strings.js:992` (comment) | comment rephrased |
| «٩ مستويات» | `src/strings.js:815` (comment) | comment rephrased |
| «شواغر» | `src/strings.js:752` (comment) | comment rephrased |
| «تسع/تسعة مستويات» | — | zero occurrences found in src/ |

Post-clean sweep: `grep -rn "لا توجد حصص|تسع مستويات|تسعة مستويات|٩ مستويات|شواغر|سنُطلعك" src/` → **zero hits**.

## Open production-side item

Cloudflare zone edge still serves `/videos/*` with a pre-S27 header set (`cross-origin-resource-policy` missing; 304 revalidation renews the stale object). Needs an owner zone-cache purge — code-side is done.
