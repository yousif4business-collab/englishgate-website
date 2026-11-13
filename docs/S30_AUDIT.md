# S30 — Full Requirements Audit

**Date:** 2026-07-13 · **Auditor:** Claude (S30 sprint, report-only — no fixes applied)
**Sources:** git history since S13, CLAUDE.md, and the `src/` code itself. Every verdict is verified **in code** with file evidence — commit messages were not accepted as proof.
**Note:** the audit prompt listed `docs/` as a source; no `docs/` directory existed at audit time (this file creates it).

**Working-tree state at audit time:** production + mirror both serve the S28 build (`6a81230`, bundle `index-CLeWxjH5.js`, hash parity confirmed). The S29 keep-set (Arabic default, mascot placements, chat polish; intro reverted to gate v3; slogan dropped) is HELD uncommitted at localhost pending owner approval.

## Audit table

| # | Item | Status | Evidence (file:line) | Fix needed |
|---|---|---|---|---|
| 1.1 | Video belt: parent video first + badge | ✅ | `src/sections/Testimonials.jsx:26` picks the video item; `:40-45` renders it first-column with `badge={f.videoBadge}`; the parent clip is the only consented video (`src/data/testimonials.js:30-35`) | — |
| 1.2 | Before/after labels + end-overlay CTA | ✅ | `src/sections/Video.jsx:73` `edgeLabels={{top: t.before, bottom: t.after}}`; `:74-79` `endOverlay` (title + WhatsApp CTA + close) | — |
| 1.3 | 16-photo team belt | ⚠️ | `src/data/team-photos.js:4-11` — **12** photos ship, by S23 decision: photos 8+10 unwired (confirmed gender mismatch, likely عمر↔مريم transposition), photos 15–16 pending director confirmation | Blocked on director: confirm the transposed pair + photos 15–16 |
| 1.4 | Mascot signboard (gallery + contact) | ✅ | `src/components/Gallery.jsx:70`, `src/sections/Contact.jsx:67` | — |
| 1.5 | Placement-test gate card | ✅ | `src/sections/Programs.jsx:93-108` (gate card, `t.gate`, reveals before the level cascade) | — |
| 1.6 | Dark title badges on all videos | ✅ | `VideoTitleBadge` at 7 call sites: Video, CoursesEight, VideoSection→VideoFrame, Testimonials, TeacherModal, FeedbackPage card, VideoModal | — |
| 1.7 | Tracking in FAQ 05 + About | ✅ | `src/strings.js` faq items[4] `track: true`; `src/sections/FAQ.jsx:79` renders the tracking block; `src/sections/About.jsx:87-90` (`tc.soon` teaser pill) | — |
| 1.8 | نبأ بلال fully gone | ✅ | zero hits for «نبأ» repo-wide; remaining «بلال» hits are *different* staff members (سلام بلال، دعاء بلال — `src/data/staff.js:37-38`) | — |
| 1.9 | Both tel: numbers | ✅ | `src/lib/contact.js:5-9` (+964 771 748 5887 and +964 777 687 3528); rendered `src/sections/Contact.jsx:113`, `src/sections/Footer.jsx:129` | — |
| 1.10 | Zayouna pin + empty branch slot | ⚠️ | Zayouna pin + address `src/data/branches.js:16-24` ✅; the "empty slot" was **superseded in S15** by a real Mansour branch with the academy's own pin (`src/data/branches.js:25-35`) | None — deliberate evolution, recorded here |
| 2.1 | E+G mascot (states) | ✅ | `src/components/Mascot.jsx:4-19` (E+G letterform body; idle/wave/peek/celebrate/point/lost/intro states), celebrate at `src/index.css:518-519` | — |
| 2.2 | Staff-page animations + naskh names | ✅ | reveals `src/sections/Staff.jsx:98,150,155,177`; naskh `src/sections/Staff.jsx:36,129` + `src/index.css:1363` | — |
| 2.3 | Themed video frames per section | ✅ | `src/components/VideoSection.jsx:26-31` (littleKids=polaroid, activities=cinema-ticket, howToStart/format=phone-bezel); `src/sections/Video.jsx:71` polaroid; `src/sections/CoursesEight.jsx:83` phone | — |
| 2.4 | Gold play button + progress ring | ✅ | `src/components/VideoFrame.jsx:170` (gold `play-pulse` button), `:181-196` (gold ring fills with playback) | — |
| 3.1 | رفيق الرحلة section live | ✅ | `src/sections/Companion.jsx` rendered at `src/pages/Home.jsx:393`, feature flag ON (`src/config.js:4`) | — |
| 3.2 | Strings renamed from المرشد | ✅ | `src/strings.js:168` + `:718` ("renamed from Murshid"); no المرشد in UI copy (only as an assistant search keyword, `src/data/assistant.js:107`) | — |
| 3.3 | WhatsApp prefill | ✅ | `src/strings.js` companion `msg` EN/AR + `src/sections/Companion.jsx` CTA | — |
| 3.4 | Assistant KB answers about it | ✅ | `src/data/assistant.js:104-168` (keywords + answers sourced from the section's own copy, flag-gated) | — |
| 3.5 | FREE services presented in section | ❌ **MISSING** | Zero hits for مجاني/مجانية/free in companion context repo-wide. The section actually says only: intro («في إنجليش جيت، كل طفل يحصل على اهتمام يتجاوز الحصة: ثقة تكبر في الكلام، وحماس يُلاحَظ ويُتابَع، وتوجيه بسيط يصل إلى الأهل») + 3 pillars (بناء الثقة / متابعة فردية / شراكة مع الأهل) + CTA — **nothing states these services are free** | Add the free-services point using the director's exact wording (CLAUDE.md rule 2: no invented claims) |
| 4-S24 | S24 = security audit (no code commit of its own) | ⚠️ | Findings fixed in S25 (`9bb196f`); deliberate leftover: `style-src 'unsafe-inline'` accepted by owner decision (`public/_headers:6-9`) | Owner-deferred, documented; revisit only via style-src-attr with a full 3-engine verify |
| 4-S25 | Fonts self-hosted, frame-src removed, code-split, 12 photo mappings | ✅ | `9bb196f`+`4cc5c75`; `public/fonts/`, CSP at `public/_headers:33` | — |
| 4-S26 | `media-src 'self'` + video-under-CSP guard | ✅ | `09e0c7a`; `public/_headers:34`, permanent guard in `qa/security/run.mjs` | — |
| 4-S27 | Headers + alt + player chrome / video re-encode | ⚠️ | `9b1e521` (Accept-Ranges, CORP, preload=metadata, spinner+retry, alt text) ✅ live. But `ab7ef50`'s "audio fix" **recompressed the video streams** (H.264 High→Main, generation loss) instead of stream-copying; `535361e` (S27-AUDIO) rebuilt only the 3 named files losslessly from `_originals/`. **Loose end A: 4 videos still carry the recompressed encode** — `activities-live-sessions.mp4`, `how-to-start.mp4`, `little-kids-4-to-9.mp4`, `online-offline-courses.mp4` (all verified `current=Main, original=High`; pristine sources in gitignored `public/videos/_originals/`). **Loose end B:** the Cloudflare zone edge serves `/videos/*` with a stale pre-S27 header set (`cross-origin-resource-policy` missing, `cf-cache-status: REVALIDATED` — 304s renew the stale object indefinitely); requires a zone cache purge from the owner's dashboard account | A: rebuild the 4 videos from `_originals` with `-c:v copy` + AAC-LC (same recipe as S27-AUDIO). B: owner runs a one-click zone cache purge (`/videos/*` or purge-everything) |
| 4-S28 | Director's 14 copy edits | ✅ | `6a81230`, deployed, hash parity confirmed. Loose ends: FAQ Q1 age-range still an honest placeholder (`src/strings.js` `TODO(fact)`); Programs-page level card «التأسيس» left unrenamed (the S28 "level card" edit was applied to the home journey cards, where both sub-edits fit — flagged at delivery) | Director: provide the real age range; confirm whether the Programs level card also becomes «تأسيس اللغة» |
| 5 | S29 keep-set + old intro | ✅ | Held **uncommitted**: intro = gate v3 (`src/components/Intro.jsx:6`), Arabic default (`src/context/LanguageContext.jsx:10-13`, `index.html:4`), mascots (`src/pages/Home.jsx` journey+CTA, `src/sections/Contact.jsx:74-77`), chat polish (`src/components/Assistant.jsx` queueBot/typing indicator/avatar). Slogan dropped — 0 occurrences in the built bundle. All pinned by `qa/s29.mjs` (19 checks green) | Awaiting owner approval to deploy ("S29 approved — deploy") |
| 6 | Live vs local | ✅ | Production **and** mirror both serve `index-CLeWxjH5.js` = S28 (`6a81230`) — the latest *committed* build, in parity. Local dist (`index-BvJqobSM.js`) is the held S29 set, deliberately ahead | Gap closes when S29 deploys |

## Totals

**18 ✅ · 5 ⚠️ · 1 ❌** (24 rows)

## Priority queue (owner decisions)

1. **❌ 3.5** — companion free-services copy: needs the director's exact wording.
2. **⚠️ 4-S27 A** — rebuild the 4 recompressed videos (lossless fix ready locally, same S27-AUDIO recipe).
3. **⚠️ 4-S27 B** — owner zone-cache purge for stale `/videos/*` headers.
4. **⚠️ 1.3** — director confirms photo pair 8/10 + photos 15–16.
5. **⚠️ 4-S28** — director provides FAQ Q1 age range (+ Programs «تأسيس اللغة» decision).
