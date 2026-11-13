# QA SWEEP — public site — 2026-08-01

**Target:** `https://englishgate-school.com` (production, live)
**Build under test:** `index-BHzNtV1B.js` · commit `20489e0`
**Posture:** audit. The only write performed was the one authorised workshop
test submission (§A). Nothing else was modified; no database was touched.

---

## HEADLINE — the premise of §A does not hold

The brief describes the workshop form as *"the one public door into the
database"* and asks for anon-key verification that an INSERT was accepted and
cannot be read back.

**There is no database, and no submission is stored anywhere.** Verified four
independent ways:

1. `src/sections/Workshops.jsx` — the entire submit handler is
   `window.open(waLink(msg))`. No `fetch`, no `POST`, no client.
2. Repo-wide grep for `supabase | anon.?key | postgrest | createClient | fetch( | axios` across `src/` returns **nothing**.
3. No `.env` files exist; no `VITE_*` key is referenced anywhere.
4. The shipped CSP is `connect-src 'self' https://static.cloudflareinsights.com https://cloudflareinsights.com`. Even if code tried to reach a database host, **the browser would refuse the connection.**

**Consequences that matter more than the wording:**

- **No test row was created.** There is nothing for Center staff to delete.
  Disregard the "flag the row" instruction — it has no referent here.
- The "write-only" property holds **more strongly** than asked: anon cannot read
  back submissions because no submission exists to read. Data never leaves the
  visitor's browser except as text they carry into WhatsApp themselves.
- **The academy has no server-side record of workshop interest.** If a visitor
  fills the form and then does not press send in WhatsApp, the academy never
  learns they were interested. That is a business gap, not a bug — see F-2.

---

## A. THE WORKSHOP FLOW — end to end, live

Submitted on production with the agreed test values
(name **«تجربة النظام — QA»**, phone **07700000001**) at AR/390, EN/390, AR/1440.

| Observation | Result |
|---|---|
| Popup opened | `https://api.whatsapp.com/send/?phone=9647717485887&text=…` (the wa.me redirect target) |
| Payload | correct — greeting, workshop, date/time, then the entered name and phone, URL-encoded |
| Non-WhatsApp network calls caused by submit | **none** (the only request was a carousel image, unrelated) |
| Console errors | 0 in all three runs |
| Form after submit | **still filled** — fields are not cleared |
| Success confirmation | **none rendered** |

Screenshots: `A-filled-{ar,en}-390`, `A-filled-ar-1440`, and the matching
`A-after-*` frames, in the QA scratch set.

**The submitted values are handed to WhatsApp's compose screen. Nothing is
sent automatically, and nothing is persisted.** The test therefore left no
trace on any system.

---

## B. FORM ABUSE

13 cases against the live form. Nothing is stored, so the question is what the
form **accepts**, what it **rejects**, and whether any payload escapes encoding.

### Rejected (4)

| Case | Mechanism | Feedback to user |
|---|---|---|
| empty both | HTML5 `required` | "Fill out this field" ✅ |
| name only | HTML5 `required` on phone | shown ✅ |
| phone only | HTML5 `required` on name | shown ✅ |
| **whitespace only** | JS guard `!name.trim()` | **NOTHING — silent no-op** ❌ |

### Accepted (9) — all reach WhatsApp

Arabic-only name · 1-character phone · letters as phone (`not-a-phone`) ·
300-character phone · 500-character name · `<script>alert(1)</script>` ·
`<img src=x onerror=alert(1)>` · `' OR 1=1 --` / `'; DROP TABLE students; --` ·
CRLF `QA\r\nBcc:…`

### Injection outcome — **escaped, not stored, not executed**

- Every payload was **URL-encoded** by `encodeURIComponent` in `waLink()` — no
  raw `< > " '` survived into the URL.
- **0 JavaScript dialogs fired** across the whole run — nothing executed.
- No `innerHTML` or `dangerouslySetInnerHTML` exists anywhere in `src/`, so
  there is no render-side sink either.
- SQL strings are inert: there is no database and no query.

So the honest answer to "stored, escaped, or rejected" is: **not stored,
escaped on the way out, and never executed.**

### Double submit

3 clicks → **3 WhatsApp tabs**. No throttle, no `disabled` state on the button,
no debounce.

### Rate limiting

**None exists, and none is possible here.** There is no server to enforce it.
The only limit is the browser's popup blocker.

---

## C. PUBLIC SWEEP

11 routes × AR + EN at 390px — 22 page loads.

| Check | Result |
|---|---|
| HTTP 4xx / 5xx | **0 across the entire sweep** |
| Console errors | **0** |
| Images missing `alt` | **0** |
| Horizontal scroll | **none on any route** |
| Staff photos on `/staff` | **17** in both languages, 0 broken |
| Branch addresses on `/contact` | الأعظمية ✅ زيونة ✅ المنصور ✅ — both languages |
| Held course clips in DOM | **0 references** on any route |
| Held child names (شموسه / حرير) | **0 occurrences** on any route |

### Outbound origins — only two, both expected

- `static.cloudflareinsights.com` — analytics
- `tile.openstreetmap.org` — the contact-page map tiles

No unexpected third party. Forms contact nothing.

### Link resolution

| Target | Result |
|---|---|
| `wa.me/9647717485887` | 200 |
| `t.me/+9647717485887` | 200 |
| `tiktok.com/@ms_russul1` | 200 |
| `instagram.com/ms_russul1` | 200 |
| `linkedin.com/in/english-gate-academy-9b2b663a3` | **999** — LinkedIn's anti-bot code, returned to curl even with a browser UA. Not a broken link; reachable in a real browser. |
| `tel:` links | both present and well-formed: `+9647717485887`, `+9647776873528` |

### One reading that is NOT a defect

The home page reports 6 images with no `src`. **All six are inside `#sessions`**
— the Teaching Moments carousel gives a `src` only to the current and next
slides by design. A seventh briefly measured as incomplete
(`sessions-07-640.webp`); it serves **200, 58 KB**, and all 16 session assets
return 200. That was a measurement race against the live auto-advancing
carousel, not a broken asset.

---

## D. VERDICT — ranked

> **UPDATE 2026-08-01 (same day):** F-1, F-2, F-3 and F-4 were ruled and fixed
> in `S38o` — the form is trim-aware with inline errors, renders a success
> state carrying a popup-blocked recovery link, debounces submits, and guides
> the phone shape without blocking. Each was re-tested against the exact cases
> below. F-5 stands as stated: no server, so no rate limiting.


### F-1 · MEDIUM (UX) — whitespace-only submit fails silently

Typing only spaces into both fields and pressing submit does **nothing at
all**: HTML5 validation passes (the fields are non-empty), then the JS guard
`if (!name.trim() || !phone.trim()) return` exits without feedback.

*Repro:* /contact → workshop form → type `"   "` in both → submit → no error, no
WhatsApp, no message.
*Fix:* validate on trimmed values and surface a message, or `required` +
`pattern` that rejects whitespace-only.

### F-2 · MEDIUM (business) — no success state, and no record of interest

After a valid submit the form **does not clear and shows no confirmation**. On
a browser that blocks the popup, the visitor sees literally nothing and has no
way to know whether it worked. And because nothing is persisted, a visitor who
does not press send in WhatsApp is invisible to the academy.

*Repro:* fill validly → submit with popups blocked → page unchanged.
*Fix (UI):* render a confirmation and clear the fields; detect
`window.open() === null` and show the direct WhatsApp link inline as a fallback.
*Fix (business):* if workshop interest needs to be captured reliably, it needs a
real endpoint — which is the Center's job, not this static site's.

### F-3 · LOW — double submit opens a tab per click

No debounce or disabled state. Harmless (each tab is the same compose screen)
but untidy.
*Fix:* disable the button briefly after submit.

### F-4 · LOW — phone field accepts anything

`type="tel"` with no `pattern` or length bound: `1`, `not-a-phone`, and 300
characters all pass. Since the value only decorates a WhatsApp message the
academy reads by hand, impact is low, but an obviously invalid number wastes a
reply cycle.
*Fix:* a light `pattern` for Iraqi mobile formats, kept permissive.

### F-5 · INFO — no rate limiting anywhere

Stated honestly rather than implied: there is no server, so there is nothing to
rate-limit and no abuse surface beyond opening WhatsApp tabs in one's own
browser.

### Clean — no action

Injection (XSS/SQL/CRLF) encoded and inert · no 4xx anywhere · 0 console errors
· 17 staff photos intact · all three branch addresses live · held clips and held
child names absent from every route · only two expected outbound origins ·
no horizontal scroll · every image carries `alt`.

---

## Test artefact status

**No cleanup required.** The §A submission created no row, no file, and no
server-side state — it opened a WhatsApp compose window which was closed
without sending. Center staff have nothing to delete.
