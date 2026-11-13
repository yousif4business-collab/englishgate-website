# FULL SITE AUDIT — 2026-08-05 · read-only against PRODUCTION

Bundle under test: `index-L-tY_4Zd.js` = commit `b95e4b0` (S47, placement rewire).
Nothing was fixed. Findings only.

> **Brief correction:** the brief describes "placement still composer". That was true
> until **S47 shipped an hour before this audit** — placement now POSTS to
> `placement-request`. Auditing the site as it is, not as the brief describes it, so
> the privacy check below is *both doors post*, not the stated split.

---

## Counts

| Severity | Count |
|---|---|
| **P0** broken | **1** |
| **P1** wrong | **0** |
| **P2** rough | **1** |
| **P3** polish | **1** |

---

## P0 — verbatim

### A-01 · The stylesheet is served as `text/html` to browsers — the site renders UNSTYLED

**Route:** every route, both languages. **Reproduced on two independent engines.**

```
Chromium: Refused to apply style from
  'https://englishgate-school.com/assets/index-dyiloPz1.css'
  because its MIME type ('text/html') is not a supported stylesheet MIME type,
  and strict MIME checking is enabled.
WebKit  : CSS response = 200 text/html; charset=utf-8
Both    : getComputedStyle(document.body).backgroundColor === rgba(0, 0, 0, 0)
          document.styleSheets[0].cssRules === "blocked"
```

`text/html` at that path is the SPA catch-all — the asset is not being found, so
index.html is returned in its place with a 200.

**What does NOT reproduce it.** `curl` gets the correct file every time:

```
plain                        → 200 text/css; charset=utf-8  141603 b  cf-cache-status: HIT
Accept: text/css + Sec-Fetch-Dest: style + Referer → 200 text/css  141603 b
Accept-Encoding identity / gzip / gzip,deflate,br,zstd → 200 text/css  (all)
in-page fetch(..., {cache:'reload'}) → 200 text/css  141603 b
```

So **the file exists at the origin and is correct** (141,603 bytes, opens with
`@font-face{font-family:Cairo…`), and it is present in the deployed `dist/assets/`.
Browsers loading it as a stylesheet get HTML; curl and `fetch` get CSS.

**Root cause NOT established.** The evidence is consistent with a poisoned edge cache
entry that browser stylesheet requests resolve to and curl does not — `cf-cache-status:
HIT` confirms edge caching is in play, and `/assets/*` carries
`Cache-Control: public, max-age=31536000, immutable`, so a bad entry persists for a
year rather than self-healing. I could not prove the cache key, and I am not asserting
one. What is proven: **two independent engines render the live site unstyled.**

**Why this is P0 rather than P1:** it is not a subtle regression — a family opening the
site sees unstyled HTML. It was introduced by the S47 deploy window (the first sweep of
this audit caught it minutes after that deploy, and it has not self-healed since).

**Suggested first move (not taken — this audit is read-only):** purge `/assets/*` at the
edge and re-verify with both engines. Note the standing constraint that zone-level cache
operations are handled by the owner in the other Cloudflare account's dashboard.

---

## P2

### A-02 · `immutable` + SPA catch-all is a cache-poisoning shape, independent of A-01

`public/_headers` sets `/assets/*` → `max-age=31536000, immutable`, which is correct for
content-hashed assets. But Cloudflare Pages answers a **missing** asset path with the SPA
shell at **200**, not 404. Any client that requests a hashed asset in the window before
it is available at its edge node caches *HTML under an asset URL for a year*, and no
subsequent deploy dislodges it because the URL never changes.

This is the shape behind A-01 and it will recur on future deploys regardless of how A-01
is resolved. It is also the same class as the two false alarms recorded in the method
notes below — the SPA catch-all makes "missing" and "present but wrong" indistinguishable
from the outside.

---

## P3

### A-03 · A dev-only chunk ships to production

`StaffMappingPage` is gated on `import.meta.env.DEV` and its route never resolves in
production (`/staff-mapping` serves the 404 page — verified), but the chunk is still
built into `dist/assets/` and deployed. It is the only file in the bundle containing an
emoji (`✓`). No user can reach it; it is dead weight and a false positive for any emoji
scan run against `dist/`.

---

## What is CLEAN — verified, not assumed

### Console / network
- **0 uncaught page errors** across 14 routes × 2 languages.
- **0 responses ≥ 400** across the same sweep.
- The only console errors are A-01's stylesheet refusals — one per route, same cause.

### The two fetch origins
`connect-src` carries exactly the expected set, and the workshop origin covers the
placement endpoint (shared project) — **verified present, not re-added** by S47:

```
connect-src 'self' https://static.cloudflareinsights.com
            https://cloudflareinsights.com https://qzwrflxhcumnwcramrdy.supabase.co
```

**Zero CSP violations on either flow.** Both were exercised end-to-end against production:

| flow | result |
|---|---|
| workshop registration | `HTTP 200` · thank-you rendered from the response · bot CTA live · **0 CSP violations** |
| placement request | `HTTP 200` · thank-you rendered from the response · deposit `١٠٠٬٠٠٠ د.ع` · **0 CSP violations** |

### Forms — current state
- **Workshop:** posts to `workshop-register`. Full v1.2 shape (mode · attendee type ·
  branch when in-person). Falls back to the WhatsApp *support* composer on any failure.
- **Placement:** **posts to `placement-request`** (changed by S47). The WhatsApp composer
  is demoted to support («حاولت أحجز وما مشت»), not a second booking door.
- The smoke row's thank-you **reproduces**: re-running the placement flow against
  production returns 200 and renders the same facts from the response, deposit included.

### Privacy text vs what actually posts
**Matches reality.** The passages were rewritten in S47 to state that **both** forms post
to the academy's own system, naming each field per door, and that a failed submission
falls back to WhatsApp and stores nothing. The ages-of-child line is correctly **absent** —
v1.3 is not deployed, so no such field is collected.

### Content truth vs repo data
| fact | live | repo | verdict |
|---|---|---|---|
| Teachers | 20 names render | `staff.js` roster = 20 | **match** |
| Branches | 3 (الأعظمية · زيونة · المنصور) | `branches.js` = 3 | **match** |
| Course price | `٣٦٠٬٠٠٠ د.ع` | `strings.js` | **match** (F-08 numerals applied) |
| Private lessons | `$٧٥٠` / `$٥٥٠` | `strings.js` | **match** (F-07: two currencies is the truth) |
| Path-finder bands | ٥–٩ · ١٠–١٧ · ١٨+ | F-06 ruling | **match** |
| Deposit | rendered from the response, never hardcoded | — | **match** |

### Consent holds — all holding
`parent-04` («شموسه») and `parent-05` («حرير») absent · 4 consented quotes render ·
course-moment clips absent · رسل's photograph absent (monogram treatment).

---

## «اسم مؤقت» exposure map — the W-01 pressure list

The placeholder title is now visible in **five** places, up from one when W-01 was raised:

1. `/workshop` — the interim-name badge, «اسم مؤقت — الاسم النهائي عند رسل», rendered
   unconditionally under the page sub-headline.
2. `/workshop` — the workshop card title itself, from `data/workshops.js`.
3. **The registration thank-you screen** — `workshop.title` comes back from the database
   as literally «اسم مؤقت» and is rendered to every family who registers.
4. **The Telegram confirmation** the bot sends on that registration.
5. The academy's own database row, which staff read.

**T-3.** Every family who registers now receives a placeholder as the name of the event
they are attending. This is no longer a page-copy blemish; it is in the confirmation.

---

## The owed items — plain state

| item | state |
|---|---|
| **v1.3 fields** (kids_count / kids_ages / self_age) | **NOT deployed.** The columns do not exist on `workshop_registrations`; the function accepts and silently drops the fields. Site correctly does not collect them, and the privacy text correctly omits the ages line. |
| **Placement relay** | **LANDED and shipped** (S47). Endpoint live, probed, wired; deposit derived server-side. |
| **Branch-lookup switch** | **Still owed.** `offered_branches` arrives only in a registration response, and anon has no SELECT, so the chooser reads three branch ids configured in `data/workshops.js`. Declared deviation; needs a read endpoint. |
| **F-14 flip** | **ARMED and proven.** `qa/s44-workshop-flip.mjs` 19/19; boundary is `end_date + 1` (Aug 9 23:59:59 upcoming → Aug 10 00:00:01 past). Fires without a deploy. |

---

## Method notes — two false alarms discarded, one escalated

1. **"Byte mismatch on the deployed bundle"** (earlier release) — a `curl` during the
   propagation window received the SPA shell for an asset path. Re-fetched through the
   browser stack: byte-identical. **Artifact.**
2. **"The stylesheet 404 is my own poisoned cache"** — my first instinct here, and it was
   wrong. A brand-new Chromium profile reproduced it, then **WebKit reproduced it on a
   separate engine and cache**. Escalated to A-01 rather than dismissed. The lesson is the
   inverse of note 1: an artifact-shaped symptom is not automatically an artifact.
3. **Emoji in `dist/`** — one `✓` found in the built output, traced to the dev-only
   `StaffMappingPage` chunk which no production route resolves. Recorded as A-03, not as
   an emoji-rule violation.

Harness: production only, real network. `eg_lang` seeded so first paint is in the
persona's language; `content-visibility: visible` injected before measurement.
