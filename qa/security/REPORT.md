# Security QA report — englishgate-school.com

Generated: 2026-08-15T14:58:39.916Z · mode: full 3-engine matrix · **✅ ALL GREEN** (80 checks)

This suite runs via `npm run qa:security` locally and via
`.github/workflows/security.yml` on every push + weekly cron. CSP, security
headers, source-map absence, dist secrets, external-link hygiene, and the
3-engine acceptance scan are all continuously verified — a regression turns
the build red.

## Posture summary
- **Headers (live)**: CSP (default-src 'self', no unsafe script sources, frame-ancestors 'none'), HSTS w/ includeSubDomains (no preload — deliberate, see public/_headers), XFO DENY, XCTO nosniff, Referrer-Policy, Permissions-Policy, COOP same-origin. COEP + hotlink protection deliberately absent (Maps iframe / OG previews).
- **style-src 'unsafe-inline'** — ACCEPTED-FOR-NOW (S24 audit #3, deferred by owner decision in S25): React style attributes are load-bearing site-wide (documented in public/_headers). Revisit via style-src-attr with a full 3-engine verify.
- **S25 hardening**: fonts self-hosted (Google font origins removed from CSP), frame-src removed entirely (no iframes exist — falls back to default-src 'self').
- **Build**: sourcemaps hard-off in vite.config.js; dist scanned for secret shapes + sensitive files on every run.
- **Client**: no innerHTML/dangerouslySetInnerHTML anywhere; all _blank links noopener+noreferrer; wa.me/tel encoded.
- **Supply chain**: npm audit --omit=dev in CI; Dependabot weekly (npm + actions); package-lock.json committed.
- **Disclosure**: /.well-known/security.txt → WhatsApp reception, expires yearly.

## Checks
### headers

| check | result |
|---|---|
| CSP has default-src | ✅ |
| CSP has script-src | ✅ |
| CSP has style-src | ✅ |
| CSP has font-src | ✅ |
| CSP has img-src | ✅ |
| CSP has media-src | ✅ |
| CSP has object-src | ✅ |
| CSP has base-uri | ✅ |
| CSP has form-action | ✅ |
| CSP has frame-ancestors | ✅ |
| CSP has no frame-src (S25) and no Google font origins | ✅ |
| HSTS max-age ≥ 15552000 + includeSubDomains | ✅ |
| X-Frame-Options: DENY | ✅ |
| X-Content-Type-Options: nosniff | ✅ |
| Referrer-Policy: strict-origin-when-cross-origin | ✅ |
| Permissions-Policy denies camera/mic/payment, geo self-only | ✅ |
| Cross-Origin-Opener-Policy: same-origin | ✅ |
| Cross-Origin-Resource-Policy: same-origin | ✅ |
| video 200 advertises Accept-Ranges: bytes | ✅ |
| video Range probe gets 206 + Content-Range | ✅ |
| video responses carry HSTS + CORP | ✅ |

### dist

| check | result |
|---|---|
| dist/ exists (run npm run build first) | ✅ |
| no source maps ship | ✅ |
| no sensitive files inside dist/ | ✅ |
| no secret-shaped strings in built output | ✅ |
| every embedded JWT is the anon publishable key (1 found: anon) | ✅ |

### links

| check | result |
|---|---|
| external links safe [chromium-mobile-en] | ✅ |
| every <img> has an alt attribute [chromium-mobile-en] | ✅ |
| external links safe [chromium-mobile-ar] | ✅ |
| every <img> has an alt attribute [chromium-mobile-ar] | ✅ |
| external links safe [chromium-desktop-en] | ✅ |
| every <img> has an alt attribute [chromium-desktop-en] | ✅ |
| external links safe [chromium-desktop-ar] | ✅ |
| every <img> has an alt attribute [chromium-desktop-ar] | ✅ |
| external links safe [webkit-mobile-en] | ✅ |
| every <img> has an alt attribute [webkit-mobile-en] | ✅ |
| external links safe [webkit-mobile-ar] | ✅ |
| every <img> has an alt attribute [webkit-mobile-ar] | ✅ |
| external links safe [webkit-desktop-en] | ✅ |
| every <img> has an alt attribute [webkit-desktop-en] | ✅ |
| external links safe [webkit-desktop-ar] | ✅ |
| every <img> has an alt attribute [webkit-desktop-ar] | ✅ |
| external links safe [firefox-mobile-en] | ✅ |
| every <img> has an alt attribute [firefox-mobile-en] | ✅ |
| external links safe [firefox-mobile-ar] | ✅ |
| every <img> has an alt attribute [firefox-mobile-ar] | ✅ |
| external links safe [firefox-desktop-en] | ✅ |
| every <img> has an alt attribute [firefox-desktop-en] | ✅ |
| external links safe [firefox-desktop-ar] | ✅ |
| every <img> has an alt attribute [firefox-desktop-ar] | ✅ |

### csp

| check | result |
|---|---|
| zero CSP violations [chromium-mobile-en] | ✅ |
| zero console errors [chromium-mobile-en] | ✅ |
| zero CSP violations [chromium-mobile-ar] | ✅ |
| zero console errors [chromium-mobile-ar] | ✅ |
| zero CSP violations [chromium-desktop-en] | ✅ |
| zero console errors [chromium-desktop-en] | ✅ |
| zero CSP violations [chromium-desktop-ar] | ✅ |
| zero console errors [chromium-desktop-ar] | ✅ |
| video plays under shipping CSP [chromium] | ✅ |
| zero CSP violations [webkit-mobile-en] | ✅ |
| zero console errors [webkit-mobile-en] | ✅ |
| zero CSP violations [webkit-mobile-ar] | ✅ |
| zero console errors [webkit-mobile-ar] | ✅ |
| zero CSP violations [webkit-desktop-en] | ✅ |
| zero console errors [webkit-desktop-en] | ✅ |
| zero CSP violations [webkit-desktop-ar] | ✅ |
| zero console errors [webkit-desktop-ar] | ✅ |
| video plays under shipping CSP [webkit] | ✅ |
| zero CSP violations [firefox-mobile-en] | ✅ |
| zero console errors [firefox-mobile-en] | ✅ |
| zero CSP violations [firefox-mobile-ar] | ✅ |
| zero console errors [firefox-mobile-ar] | ✅ |
| zero CSP violations [firefox-desktop-en] | ✅ |
| zero console errors [firefox-desktop-en] | ✅ |
| zero CSP violations [firefox-desktop-ar] | ✅ |
| zero console errors [firefox-desktop-ar] | ✅ |
| video plays under shipping CSP [firefox] | ✅ |

### scan

| check | result |
|---|---|
| acceptance scan clean [chromium] | ✅ |
| acceptance scan clean [webkit] | ✅ |
| acceptance scan clean [firefox] | ✅ |
