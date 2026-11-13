# Site security audit — englishgate-school.com

**Dated 2026-08-12.** Measured against production by value (`curl -sI`, a real
Chromium session, and the Supabase REST API), not read off the source.
The next audit diffs against this file.

Bundle at audit time: `index-BTY47gBh.js` · commit `e934bcf`.

---

## 0. Headline: the premise of this audit was wrong, in our favour

The batch that commissioned this work assumed the security headers were
missing and needed shipping. **They were already there, enforced, and already
guarded by CI** (`npm run qa:security`, `qa/security/run.mjs`,
`.github/workflows/security.yml`). Every header on the request list was
present on production before this audit began. What follows records what is
actually true, so nobody re-ships it a third time.

---

## 1. Response headers — measured on production

Requested vs. found, on `/` **and** on a hashed asset (both carry the full set;
Cloudflare Pages applies `/*` rules to assets too):

| Header | State | Value |
|---|---|---|
| `Content-Security-Policy` | **present, ENFORCED** | see below |
| `Strict-Transport-Security` | **present** | `max-age=31536000; includeSubDomains` |
| `X-Content-Type-Options` | **present** | `nosniff` |
| `X-Frame-Options` | **present** | `DENY` |
| CSP `frame-ancestors` | **present** | `'none'` |
| `Referrer-Policy` | **present** | `strict-origin-when-cross-origin` |
| `Permissions-Policy` | **present** | `camera=(), microphone=(), geolocation=(self), payment=()` |
| `Cross-Origin-Opener-Policy` | **present** | `same-origin` |
| `Cross-Origin-Resource-Policy` | present (not requested) | `same-origin` |

Nothing was shipped report-only, because there was nothing to promote: the CSP
has been enforced for many sprints and a five-route browser sweep
(`/`, `/contact`, `/programs`, `/placement`, `/workshop`) recorded **zero
console errors**, i.e. zero CSP violations. The "start report-only, promote
once clean" step in the brief was designed for a site that did not have this.

### The CSP, and why each entry exists

```
default-src 'self';
script-src  'self' https://static.cloudflareinsights.com 'sha256-IS0e94…34E0=';
style-src   'self' 'unsafe-inline';
font-src    'self';
img-src     'self' data: https://tile.openstreetmap.org;
media-src   'self';
connect-src 'self' https://static.cloudflareinsights.com https://cloudflareinsights.com
            https://qzwrflxhcumnwcramrdy.supabase.co;
object-src 'none'; base-uri 'self'; form-action 'none'; frame-ancestors 'none'
```

- **`static.cloudflareinsights.com`** — Cloudflare Web Analytics, the only
  third-party script on the site.
- **the `sha256-` hash** — the inlined intro-gate script in `index.html`. A
  hash allows that one exact script body; it is not `'unsafe-inline'`. Editing
  that block means recomputing the hash here *and* in `qa/security/run.mjs`.
- **`style-src 'unsafe-inline'`** — unavoidable today: React `style={{…}}`
  attributes (animation delays, aspect ratios, parallax) are governed by
  `style-src`. Removing it blanks large parts of the site. Closing this needs
  `style-src-attr` plus a full three-engine verify; it is the single largest
  remaining CSP weakness and is **deliberately not** closed here.
- **`tile.openstreetmap.org`** — map tiles on `/contact`. Images only.
- **`supabase.co`** — the two Edge Functions; the site's only write path.
- **`form-action 'none'`** — nothing may POST via a native form submit; the
  forms use `fetch`.
- **no `frame-src`** — the map is bundled Leaflet, not an iframe.
- **no `Cross-Origin-Embedder-Policy`** — deliberate; it breaks embeds.
- **no HSTS `preload`** — deliberate. Preload is a browser-shipped, hard to
  reverse commitment covering every subdomain. Not submitted, not recommended
  without a ruling.

### One conflict with the brief, unresolved on purpose

The brief asked for **`Permissions-Policy` denying geolocation**. Production
sends `geolocation=(self)` and that is **deliberate**: the "nearest branch"
button on `/contact` and the homepage calls the Geolocation API on tap, ranks
the three branches on-device, and stores/transmits nothing. Denying it would
kill a shipped feature to satisfy a checklist.

**Left as `(self)`. If the owner wants it denied, the feature goes with it —
that is a product ruling, not a security one.**

### HSTS `includeSubDomains` — the implication, stated

`includeSubDomains` has been live for many sprints, so this is a description,
not a new risk: **every** subdomain of `englishgate-school.com` must be
HTTPS-only, including `app.` and `center.`, which are separate Cloudflare
Pages projects. Both currently answer 200 over HTTPS (checked nightly by
`qa/daily-health.mjs`, which treats them as WARN-level canaries). A subdomain
that ever serves plain HTTP will be unreachable in any browser that has seen
this header, and the ~1-year `max-age` means the block outlives the mistake.

---

## 2. The SPA-fallback class (A-02) — partly closed, one part blocked

Measured before the fix:

| Path | Before | After this sprint |
|---|---|---|
| `/robots.txt` | 200 `text/plain` ✔ already real | unchanged |
| `/sitemap.xml` | 200 `application/xml` ✔ already real, 14 routes | unchanged |
| `/favicon.ico` | **200 `text/html`** — the SPA shell | **real ICO shipped** |
| `/apple-touch-icon.png` | **200 `text/html`** — the SPA shell | **real PNG shipped** |
| any unknown path | **200 `text/html`** — styled page, wrong status | **still 200 — see below** |

`favicon.ico` (16/32/48 in one container) and `apple-touch-icon.png` (180×180)
are cut from the existing `public/logo.png`. **No artwork was invented.**
Whether the icon should become the mascot instead of the EG shield remains an
open owner decision, unchanged by this fix.

### The 404 status is BLOCKED, and both mechanisms in the brief are disproven

The brief said to use "`_redirects` or the `404.html` convention". Both have
been tested against this production site and both fail:

- **`404.html`** — Cloudflare Pages treats a top-level `404.html` as its
  built-in custom-404 handler, which **outranks** the SPA catch-all. Shipping
  it 404'd **13 of 14 routes** in production (S48/S48c). This is the single
  worst outage this site has had. **Do not re-attempt.**
- **`_redirects`** — a `/assets/* … 404` rule was tried twice, as a directory
  and as an explicit file. It **does not fire** on Pages; the catch-all still
  wins (S49).

The only mechanism that can return 404 for unknown paths *without* breaking
client-side routing is a **Pages Function** (`functions/[[path]].js`) that
distinguishes known routes from unknown ones. That is the parked A-02 sprint.

**Status: honest 404s remain OPEN.** The post-deploy gate records the
asset-miss probe on every run so the exposure cannot be forgotten.

---

## 3. Dependencies and supply chain

- **`npm audit --omit=dev`: 0 vulnerabilities.** The five dev-only highs
  recorded previously do not appear in the production tree.
- **Source maps shipped: 0.** `find dist -name '*.map'` is empty.
- **Third-party runtime origins: exactly two**, confirmed by recording every
  network request across five routes in a real browser:
  - `static.cloudflareinsights.com` (×5) — Cloudflare Web Analytics.
  - `tile.openstreetmap.org` (×15) — map tiles, `/contact` only.
  No fonts, no CDNs, no tag managers, no ad or tracking pixels. Fonts are
  self-hosted (`public/fonts/`).
- Other external URLs in the bundle (`wa.me`, `t.me`, `telegram.org`,
  instagram/facebook/tiktok/linkedin, `maps.google.com`, `openstreetmap.org`)
  are **link targets only** — nothing is fetched from them at runtime.
  `react.dev`, `reactrouter.com`, `leafletjs.com`, `schema.org`, `w3.org` are
  attribution strings and XML namespaces.
- **Secrets in `dist`: none beyond the Supabase anon key**, which is public by
  design — see §5.

---

## 4. Hosting posture (Cloudflare Pages)

| Check | Result |
|---|---|
| TLS certificate | Google Trust Services, valid **2026-07-06 → 2026-10-04**, Cloudflare auto-renews |
| HTTP → HTTPS | **301** enforced |
| Canonical host | `sitemap.xml` uses the **apex** |
| `www.` subdomain | **200 — serves the site, does NOT redirect** ⚠ |
| Old preview deployments | **publicly reachable, indefinitely** ⚠ |
| Asset caching | `public, max-age=31536000, immutable` on `/assets/*`, `/videos/*`, `/fonts/*` ✔ |
| HTML caching | `no-cache, must-revalidate` ✔ |

### ⚠ `www` is a second live canonical

`https://www.englishgate-school.com/` returns **200** and serves the identical
bundle — it does not redirect to the apex. Two hosts serving one site splits
SEO signal and doubles the surface. The sitemap already declares the apex
canonical, so the fix is a **301 from `www` to the apex**.

**Not shipped here, and it cannot be:** this is a zone-level Redirect Rule,
and the DNS zone lives in a **different Cloudflare account** than the Pages
project. It is an owner action in that dashboard. `_redirects` cannot express
a host-based redirect on Pages (see §2 for how much that file has already been
proven not to do).

### ⚠ Every past deployment is still on the public internet

`*.pages.dev` deployment URLs stay reachable forever by default. Verified:

```
f3202968.englishgate-site.pages.dev → 200 · index-CBEDYz5x.js
c0b16d13.englishgate-site.pages.dev → 200 · index-BxKxoE6e.js   ← the VETOED build
a8396134.englishgate-site.pages.dev → 200 · index-CSArxA-y.js
```

The middle one is the work the owner vetoed and rolled back. It is rolled back
on the live domain and **still publicly servable at a stable URL**. Every past
bug, every superseded price, every retired claim is likewise still live
somewhere. These URLs carry the same headers and the same Supabase write path,
so they are not merely stale documents — they are working forms.

**Fix:** Cloudflare Access on preview deployments (Pages → Settings → Preview
deployments → require authentication). Not enabled here — it needs the Pages
dashboard, and gating previews may affect how the owner reviews future builds.
**Recommended, pending a ruling.**

---

## 5. The one write path

The site writes in exactly one way: the workshop and placement intake forms
POST to Supabase **Edge Functions** (`/functions/v1/workshop-register`,
`/functions/v1/placement-request`). There is no other server-side surface.

- **The key in the bundle is the `anon` publishable key.** Decoded claim:
  `{"iss":"supabase","ref":"qzwrflxhcumnwcramrdy","role":"anon"}`. This is
  **public by design** — it identifies the project, it does not authorise
  anything on its own. Finding it in `dist` is expected and is not a leak.
  Nobody should panic about it in a later audit; that is why it is written
  down here.
- **RLS refuses anonymous reads. Re-asserted by value today:**

  ```
  GET /rest/v1/workshop_registrations → 401
  GET /rest/v1/placement_requests     → 401
  GET /rest/v1/workshops              → 401
  ```

  No family's name or phone number is readable with the shipped key.

### Rate limiting — the honest answer

**Before this sprint: nothing on the site's side.** The placement function
returns a `rate_limited` code, so *some* server-side limit exists, but it
lives in the app repo and its shape is not visible from here. A script could
POST junk registrations at whatever rate that limit allows.

**Shipped this sprint (`src/lib/form-guard.jsx`), both forms:**

- **Honeypot** — an off-screen, `aria-hidden`, `tabIndex={-1}` field named
  `website`. Non-empty ⇒ the submit is dropped **silently**; telling a bot why
  it failed is how it learns to pass. Verified: not keyboard-reachable across
  12 tabs, and a filled trap produced **0 POSTs**.
- **Minimum fill time (3 s)** — rather than reject a fast submit (which would
  punish a false positive with a dead button), the request is *delayed* to the
  three-second mark and then sent. A human never reaches it; a scripted loop
  loses throughput. Nobody is ever told "no" for being quick.

**What this is worth, stated plainly:** it stops a bot driving the real form
in a real browser — the common, lazy case. It does **nothing** against a
direct POST to the endpoint, because everything client-side is advisory: the
attacker controls the client. Real protection is server-side (reject on the
honeypot field, per-IP quotas in the Edge Function) or a challenge.

**CAPTCHA / Cloudflare Turnstile is the stronger option and is NOT shipped.**
It adds friction for every family that registers honestly, on phones, on Iraqi
mobile data. That trade is the owner's to make, not a builder's. **Pending a
ruling.**

---

## 6. Deliberately not done

| Item | Why |
|---|---|
| Honest 404 status | Both mechanisms in the brief are disproven on Pages; needs the parked A-02 Pages Function sprint |
| `www` → apex 301 | Zone lives in a different Cloudflare account — owner action |
| Preview-URL lockdown | Needs the Pages dashboard; may change the owner's review flow — recommended, pending ruling |
| Turnstile / CAPTCHA | Real friction for families — owner's ruling |
| `Permissions-Policy: geolocation=()` | Would kill the working "nearest branch" feature |
| CSP `style-src` without `'unsafe-inline'` | Needs `style-src-attr` + a full three-engine verify; largest remaining CSP weakness |
| HSTS `preload` | Hard to reverse, covers all subdomains, not submitted |
| Mascot favicon | The icon artwork question is an open owner decision; this sprint only made the file real |

---

## Re-running this audit

```bash
curl -sI https://englishgate-school.com/                    # headers
curl -sI https://englishgate-school.com/assets/index-*.js   # headers on assets
npm audit --omit=dev                                        # dependencies
find dist -name '*.map'                                     # source maps (expect none)
npm run qa:security                                         # the header CI guard
node qa/post-deploy-gate.mjs                                # routing + asset-miss probe
```

---
---

# Sweep — SITE section, 2026-08-14

**Measured against production by value**, not read off the source or recalled
from the audit above. Bundle at sweep time: `index-B7cJY3my.js` · commit
`a7442b7` (S62 built but HELD on localhost — not in this bundle).

Every probe that touches the write path was run with the request
**intercepted in-browser and answered locally**, so nothing in this sweep put a
row in the owner's queue. The one thing that cannot be proven without writing
is stated as unproven rather than assumed.

## Findings, ranked

### 🔴 F-1 · HIGH — the vetoed build is still a WORKING, CREDENTIALLED form

Unchanged from the audit above, and now proven one step further. The rolled-back
build is not merely readable — it **composes a real write** to the live
function:

```
c0b16d13.englishgate-site.pages.dev  → HTTP 200 · index-BxKxoE6e.js
  POST https://qzwrflxhcumnwcramrdy.supabase.co/functions/v1/placement-request
  apikey header: present (live anon key)
  payload:       {"full_name":"Sweep Probe","age":9,"mode":"onsite","phone":"07700000000"}
```

(The POST was intercepted at the browser and never left the machine.)

**25 deployment URLs are still public.** The veto is therefore cosmetic: the
build the owner rejected still takes real family submissions into the real
queue, from a stable URL, for anyone holding the link.

**One thing the audit above did NOT record, in our favour:** every preview
carries `x-robots-tag: noindex`. So this is *not* a duplicate-canonical or SEO
problem — it is purely a live-write-path problem. That narrows the fix: it is
about access, not indexing.

**Fix (unchanged, owner-side):** Pages → Settings → Preview deployments →
require Cloudflare Access. **Feeds the owner's dashboard task.**

### 🟠 F-2 · MEDIUM — `www` is still a second live canonical

Re-confirmed today, unchanged:

```
https://www.englishgate-school.com/ → HTTP 200, no Location header
serving index-B7cJY3my.js — byte-identical to the apex
```

Unlike the preview URLs, `www` carries **no `noindex`** — so this, and not the
previews, is the actual duplicate-canonical exposure. Still a zone-level
Redirect Rule in a **different Cloudflare account**: owner action, cannot be
shipped from this repo.

### 🟡 F-3 · LOW / INFO — the bot controls are real, and are client-side only

Both were **probed, not remembered**, and both work:

| Probe | Result |
|---|---|
| honeypot filled (`#pl-website` = a URL), then submit | **0 requests fired — dropped** ✓ |
| submit 1025ms after the form mounted | request **held 2202ms**, left at 3226ms — past the 3000ms floor ✓ |

The honeypot is properly concealed from humans: `0×0`, `opacity:0`, positioned
off-canvas (`y −324`), `tabindex="-1"`, `autocomplete="off"`.

**The honest limit:** both controls live in the browser. A direct `curl`
bypasses both completely — every contract probe run against this function today
did exactly that and was answered by field validation, not by the guard. The
contract does carry a `rate_limited` code, so server-side throttling exists,
but **this sweep did not prove it** and deliberately did not try: confirming it
means deliberately tripping it. Not a defect — a boundary, recorded so nobody
mistakes the honeypot for server-side protection.

## Clean — verified, no action

| Check | Result |
|---|---|
| Security headers on `/` | all 8 present and correct |
| Security headers on `/assets/index-*.js` | **all 8 present** — `/*` and `/assets/*` rules DO combine on Pages (a narrower grep suggested otherwise mid-sweep; the full dump disproved it) |
| Source maps in `dist/` | **0** |
| JWTs in `dist/` | exactly **1**, decodes to `{"iss":"supabase","ref":"qzwrflxhcumnwcramrdy","role":"anon"}` — the publishable key that must ship |
| Other secret shapes (`service_role`, `sbp_`, `sk_live/test_`, `ghp_`, `AKIA`, PEM private keys) | none |
| `.env` / `*.pem` / `*.key` in `dist/` | none |

## Newest 3 deployments, and what each serves

| Deployment | Commit | Serves | Age |
|---|---|---|---|
| `c7ca08c4.englishgate-site.pages.dev` | `1fbbe0b` | `index-B7cJY3my.js` — **identical to live production** | 1 day |
| `b1976641.englishgate-site.pages.dev` | `d638daa` | `index-BIEXViSA.js` — the previous production | 2 days |
| `6badbcb6.englishgate-site.pages.dev` | `e934bcf` | `index-BTY47gBh.js` — the bundle the 2026-08-12 audit was run against | 3 days |

All three return 200 and all three carry `noindex`. Enumerated with
`npx wrangler pages deployment list --project-name=englishgate-site`, which
**now works** — the audit-era note that wrangler was authenticated as the wrong
identity (`Authentication error 10000`) is out of date; it resolves the
4business account today.

## Re-running this sweep

```bash
curl -sI https://englishgate-school.com/ | grep -iE 'content-security|frame|hsts|referrer'
curl -sI https://www.englishgate-school.com/ | head -1        # want a 301, still a 200
npx wrangler pages deployment list --project-name=englishgate-site
find dist -name '*.map'                                       # expect none
npm run qa:security
```

The honeypot/timing probes are not one-liners — they need the request
intercepted so they cannot write. Script kept out of the repo deliberately;
rebuild it from F-3's table, and keep the interception.
