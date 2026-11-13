# QA/QC Report — English Gate Academy site

Date: 2026-07-06 · Harness: `qa/matrix.mjs` (playwright-core driving installed Google Chrome, no browser download) · Base: local dev + `vite preview` production build for Lighthouse.

## 🔒 Security posture is CONTINUOUSLY VERIFIED (2026-07-07)

CSP + security headers, source-map absence, dist secret hygiene, external-link
safety, and the 3-engine acceptance scan are no longer point-in-time audits:
`npm run qa:security` (qa/security/run.mjs) asserts all of it, runs on every
push + weekly via .github/workflows/security.yml (red build blocks merge), and
writes qa/security/REPORT.md. Deliberate header decisions (no COEP, no hotlink
protection, no HSTS preload, style-src 'unsafe-inline' kept) are documented in
public/_headers — change a header there and the suite's expectations in the
same commit. Vulnerability disclosure: /.well-known/security.txt (WhatsApp
reception, expires yearly — renew the Expires line each summer). Dependabot
keeps npm deps + GitHub Actions patched weekly.

## ⚠️ WebKit is now a PERMANENT part of this repo's QA matrix (2026-07-07)

All QA above was Chromium-only, and real-iPhone screenshots later exposed three
WebKit-only failures that Chromium never showed (unsized icon SVGs rendering as
empty/solid boxes, the lazy hero photo never loading, the translucent mobile
menu). Before every deploy, run BOTH against a production build (`vite preview`):

- `node qa/webkit-iphone.mjs --base http://localhost:4173` — iPhone 14 Pro
  (393×852 @3x) in Playwright's **WebKit** engine: full-page shots EN+AR →
  `qa/webkit-iphone/` + contact sheet, icon audit (every slot has an inline
  `<svg>` with a nonzero bbox), hero `<img>` loaded+visible, mobile menu
  opaque/full-viewport/above the sticky CTA. One-time setup:
  `npx playwright-core install webkit`.
- `node qa/scan.mjs --base http://localhost:4173 --engine webkit` (and again
  without `--engine` for Chromium) — broken-image + empty-chip scan.

### iOS Safari bug batch — root causes (2026-07-07, all fixed & verified in WebKit)
| Bug (real iPhone) | Root cause | Fix |
|---|---|---|
| Nearly every icon an empty/solid box | `Icon.jsx` SVGs had no width/height attributes; WebKit doesn't stretch unsized SVG flex items (falls back to 300×150) while Chromium does | `cloneElement` gives every icon svg explicit `width`/`height` + `display:block`; same treatment in `Doodle.jsx` (`height:auto` → computed px) |
| Hero photo never appeared (only the teal blob) | `loading="lazy"` image inside the intro-hidden/transformed hero subtree — WebKit never promoted it; box height also depended on `aspect-ratio` alone | `BlobFrame` photo mode rebuilt: eager plain `<img>` in normal flow (`fetchPriority="high"` on the hero), intrinsic width/height hints, organic-radius `overflow:hidden` wrapper, blob as separate layer behind |
| Mobile menu semi-transparent, page bleeding through | In-flow drawer used `bg-surface/97` + `backdrop-blur`; blur unreliable on iOS → alpha background showed content behind | Rebuilt as `position:fixed; inset:0; height:100dvh` overlay with SOLID `bg-surface`, `z-45` (above sticky CTA z-40, below nav z-50), body scroll-lock + close-on-route-change kept |
| `/staff/haider-ali-nasser.jpg` avatar blank (WebKit scan catch) | File was PNG data with a `.jpg` name — WebKit trusts the `image/jpeg` Content-Type and refuses it; Chromium sniffs | Re-encoded as real JPEG; marquee-duplicated avatars also `loading="eager"` (WebKit never lazy-loads off-screen marquee clones) |
| (sweep) Teacher modal `max-h-[88vh]` could clip behind Safari's URL bar | `vh` vs dynamic viewport | → `max-h-[85dvh]` |

Sweep also verified: Tailwind v4 emits `-webkit-backdrop-filter` for every
`backdrop-filter` utility (checked compiled CSS), `.modal-backdrop` carries both
prefixes, no `background-clip:text`, no CSS-mask icons anywhere (the video
ticket-notch mask is inline-styled with both prefixes), no sticky-inside-overflow.

Note for full-page WebKit screenshots: Playwright WebKit's native `fullPage`
capture leaves unpainted (blank) tiles past ~2000 CSS px on very long pages —
`qa/webkit-iphone.mjs` stitches viewport tiles itself instead.

## A. Responsive matrix — ✅ GREEN

**140 combinations tested**: 10 pages (`/`, `/about`, `/programs`, `/staff`, `/contact`, `/faq`, `/careers`, `/terms`, `/privacy`, `/cookies`) × 2 languages (EN + AR/RTL) × 7 viewports (360×800, 375×667, 390×844@3x, 430×932, 768×1024, 834×1194, 1024×768).

Final result: **`{"checks":140,"failures":0}`** (`qa/matrix-results.json`). Screenshots for every page+viewport+language in `qa/screens/en/` and `qa/screens/ar/` (140 PNGs, kept out of git).

Per-combination assertions:
1. **No horizontal overflow** (`scrollWidth ≤ innerWidth+1`, with DOM-walk offender listing on failure)
2. **Mobile nav**: hamburger opens/closes, `aria-expanded` toggles, body scroll locks while open and releases on close, all 7+ links reachable — EN and RTL
3. **Tap targets ≥ 44px** for interactive elements
4. **No body text < 12px** on mobile; AR headings wrap without clipping (visual pass over AR screenshots)
5. **Videos**: fit containers, `poster` set, `preload="none"`, **tap** (touch event, not hover/click) starts playback and reveals native controls
6. **Marquee belts** never widen the page; floats disabled <640px; flanked video side content stacks under the video on mobile
7. **Floating WhatsApp**: `bottom: calc(1.5rem + env(safe-area-inset-bottom))` + `viewport-fit=cover` added; desktop-only (mobile uses the StickyCTA bar, which already had safe-area padding); StickyCTA never overlaps nav (bottom-anchored, nav is top)
8. **Zero console errors / zero 4xx-5xx** per page (excluding two documented externals below)

### Bugs found by the matrix → fixed
| Bug | Fix |
|---|---|
| Legal pages: contact pill (`white-space: nowrap`) overflowed viewport on phones — the only overflow site-wide | `.btn-wrap` opt-in wrapping + `max-width:100%` on all pill buttons |
| Footer links 26px tall; nav logo 40px; map "Get directions" 36px; lang toggle 32px; hamburger 38px | 44px min tap areas across Nav + Footer + map chip |
| `/programs` stage labels 10.5px | → 12px |
| No body-scroll lock while mobile drawer open | Added (with cleanup on route change/unmount) |
| Language didn't persist across reloads | `localStorage eg_lang` persistence |
| Video frames assumed 16:9 before play (`preload="none"` ⇒ no metadata), cropping portrait posters | Poster's `naturalWidth/Height` now drives the frame's aspect ratio |

### Excluded as external/dev-only (documented, not site bugs)
- Cloudflare Insights beacon CORS error — occurred on **localhost only**; the placeholder-token beacon has now been **removed entirely** (see C).
- Google Maps tile requests intermittently 502 from Google's tile servers under repeated automated loads.

## B. Touch/hover pass — ✅
- All card lifts / logo tilt / polaroid straighten are CSS `:hover`/`motion-safe` **enhancements** — fully inert on touch, nothing functional behind hover.
- Magnetic buttons gated by `pointer: fine` — disabled on touch devices.
- Marquee `:hover` pause is a desktop nicety; belts also pause off-screen via IntersectionObserver on all devices.
- Video play is a real `<button>` — verified via synthesized **touch** events on every video page in both languages.

## C. Security & robustness — ✅
1. **Headers** (`public/_headers`): CSP (`script-src 'self' + cloudflareinsights`, `frame-src` YouTube + Google Maps, `object-src 'none'`, `frame-ancestors 'none'`), `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy`, HSTS. Verified live post-deploy.
2. **External links**: every `target="_blank"` carries `rel="noopener noreferrer"` (repo-wide audit). All `wa.me` prefills (Arabic included) go through `encodeURIComponent`.
3. **Secrets**: repo grep for keys/tokens/passwords — none. The one hit was the **placeholder** `CF_ANALYTICS_TOKEN` beacon in `index.html`, which was live-firing with a dummy token → **removed** (re-add with the real token from CF dashboard → Web Analytics; CSP already allows it).
4. **404**: unknown routes now render a styled bilingual NotFound page (was: silently re-rendered Home).
5. **`npm audit`: 0 vulnerabilities.**
6. **Lighthouse (mobile, production build, simulated throttling)**:

| Page | Performance | Accessibility | Best Practices | SEO |
|---|---|---|---|---|
| `/` | 80 | **100** | **100** | **100** |
| `/programs` | 74 | **100** | **100** | **100** |

Cheap wins applied: `color-contrast` 0 → **PASS** via token-level fixes (`--color-teal` #1C8AA0→#167184 for text/chips, `--color-gold-deep` →#8A6410, `--color-muted` →#52666B, footer white opacities raised, dark ink text on gold/WhatsApp-green buttons). Perf 74–80 is bounded by webfonts + SPA bundle under 4G throttle — per instruction, not chased further.

### Also fixed during QA
- Meta descriptions claimed "Karrada, Adhamiya, and Mansour" — the academy has **one** location → "Adhamiya, Baghdad".
- Director avatar rendered Cairo's Kufi isolated **ر**, which reads as a Latin "J" (confirmed via CDP: glyph painted by Cairo-ExtraBold). All initial-avatars (4 more teachers' names start with ر) now use a classical naskh stack (`.initial-ar`) — unmistakably Arabic on every platform. Verified by screenshot.
- `strings.js` briefly double-encoded by a tooling step — repaired byte-exact and verified (`node` parse + Arabic greps + AR screenshots).

## D. This report
Everything tested, found, and fixed is listed above. Harness: `qa/matrix.mjs` (re-runnable: `node qa/matrix.mjs [--screens]`). Raw results: `qa/matrix-results.json`. Lighthouse JSONs: `qa/lh-home.json`, `qa/lh-programs.json` (not committed).

### Addendum (mascot rollout)
- `<Mascot />` added (SVG from the real logo geometry; transform/opacity only, off-screen paused, reduced-motion static, RTL-aware arms). Placements: intro, 404, FAQ, Programs Foundation card, Careers. Matrix re-run after rollout: **140/140 green**.
- Found & fixed during rollout: `.wa-float { position: relative }` from the perf pass was overriding Tailwind's `fixed` — the desktop WhatsApp button had been sitting in document flow at the page bottom instead of floating. Now verified floating bottom-end in EN (right) and AR (left).

**Final status: matrix 140/140 green · a11y 100/100 · BP 100 · SEO 100 · 0 npm vulnerabilities · headers verified.**
