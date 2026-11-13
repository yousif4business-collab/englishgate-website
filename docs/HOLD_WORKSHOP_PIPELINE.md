# HOLD — workshop rewire (pre-rulings, 2026-08-04)

**STATUS: HELD. Nothing built.**
**Trigger to build:** the app side relays **«workshop pipeline live»**. As of 2026-08-04 no
such relay has been received. Until it is, `/workshop` keeps its current
WhatsApp-composer behaviour and this file changes nothing on the site.

Owner pre-rulings recorded so the build is a single pass on the day. Ships **as ONE
RELEASE** — the privacy text is hard-coupled to the code and must not lag it by even one
deploy.

---

## The two blockers that must be resolved ON THE DAY

Neither is a decision — both are facts the relay has to carry, and the release cannot ship
without them.

### 1. CSP `connect-src` — the release fails without the endpoint's origin

Today, in `public/_headers`:

```
connect-src 'self' https://static.cloudflareinsights.com https://cloudflareinsights.com
```

**The site makes zero `fetch` calls today** — grep for `fetch(`/`XMLHttpRequest` in `src/`
returns nothing. The workshop POST would be its **first**, and the current policy would
block it outright in the browser. So:

> **The relay must include the exact endpoint origin** (scheme + host), which gets added to
> `connect-src` in the same commit. Without it the form silently fails CSP and every
> submission takes the fallback path — which would look like "the pipeline is down" rather
> than "we forgot a header".

`form-action 'none'` needs **no** change: submission is a JS `fetch`, not a form POST, so
that directive is not involved.

### 2. What the relay must carry

- endpoint origin + path
- the anon key, and confirmation it is **INSERT-only** (pre-ruling 5)
- the **response shape** — exact keys for name / dates / times / branch, and the key that
  carries the bot link when there is one
- whether **branch** is per-workshop. `src/data/workshops.js` has **no branch field today**;
  if the response supplies it, the thank-you screen is its only consumer and the data file
  stays as-is.

---

## Pre-rulings, as given

### 1. PRIVACY — same-release, hard-coupled

`src/data/legal.js` gains, truthfully:

> «نموذج الورشة يحفظ: الاسم، رقم الهاتف، والبريد إن أُدخل — لغرض تنظيم الورشة وتأكيد
> الحضور فقط. لا يُشارك مع أي جهة خارجية.»

EN mirror the same. The WhatsApp-path sentence **stays** for the fallback flow — both truths,
clearly separated.

**Scope is larger than one sentence — this is the part to not underestimate.** Three
passages currently assert the opposite, in **both languages (6 passages)**, plus the file's
own header comment:

| # | Where | The claim that stops being true |
|---|---|---|
| 1 | Terms → `legal.js:27` (EN) / `:41` (AR) | Heading **"No accounts, and two forms that only open WhatsApp"** · body "Neither one submits anything to a server… Nothing is stored on this website." |
| 2 | Privacy `intro` → `:54` (EN) / `:69` (AR) | "no accounts, **no database**, and no tracking cookies. It **stores nothing about you**." |
| 3 | Privacy → `:57` (EN) / `:72` (AR) | "the site's two forms work the same way… **this website never receives it, and stores none of it**." |

Note the **heading** in #1 is itself a claim, not just its body. And `legal.js`'s header
comment already states the rule this release must honour:

> "…said the site has 'no forms'… That stopped being true when the workshop form shipped
> (S38f/S38o)… If a sprint adds or removes a form, **THIS FILE is part of that sprint**."

The header comment needs updating too — it currently describes the site as "two forms that
compose a WhatsApp message client-side and **store nothing**".

**This release changes the site's privacy posture categorically** — from "stores nothing,
anywhere" to "one form transmits three fields to our own backend". The intro sentence is the
sharpest edit and should be written first, because everything else is detail beneath it.

### 2. FORM SHAPE

- **name** — already present
- **phone** — already Iraqi-validated in `src/sections/Workshops.jsx`:
  `IQ_MOBILE = /^07\d{9}$/` with `digitsOnly()`. **Same pattern as register — no change needed.**
- **email — OPTIONAL**, «البريد الإلكتروني (اختياري)». New field on this form. The pattern
  already exists in `src/sections/Placement.jsx:28` (`EMAIL_SHAPE`) — reuse it, do not invent
  a second one. v1 sends nothing to the address; the field is future-ready per the app ruling.

Validation stays **guided, never blocking** — the existing `noValidate` + JS pattern, which
is deliberate and already better than HTML5 `required` (that passes on `"   "`).

### 3. THANK-YOU SCREEN — the always-leg

- «تم التسجيل ✓»
- workshop facts rendered **from the function's response** (name / dates / times / branch).
  Placeholder name flows through untouched until رسل's edit — the screen does not second-guess
  what the backend returns.
- **if** the response carries a bot link → «اضغط للتأكيد عبر تيليگرام» button
- **if not** → «راح نتواصل وياكم للتأكيد»
- WhatsApp **demoted, not removed**: the existing «تفضّل واتساب؟ راسلنا مباشرة» line stays,
  working, secondary.

Note: this makes the response the source of truth for the thank-you screen, where
`data/workshops.js` is the source for the page above it. If the two ever disagree the screen
shows the backend's version — correct, but worth a QA assertion that they match on the happy path.

### 4. FAILURE HONESTY

If the pipeline call fails, the form falls back to the **current WhatsApp composer behaviour**
with an honest line:

> «ما گدرنا نسجّل تلقائيًا — أرسل عبر واتساب»

**A family never hits a dead submit. One truth on screen** — never both the success state and
the fallback line at once. CSP failures, network failures, and non-2xx all take this path.

### 5. ANON KEY

Same client pattern as the register form: anon **INSERT-only** against the relayed endpoint.
The site stays otherwise static — **this is its only `fetch`, scoped to `/workshop`**. No new
runtime dependency (plain `fetch`, no client SDK), per the standing rule.

### 6. RELEASE

Full bar + **the privacy diff shown in the report** + deploy **as ONE release**.
`/review` update if visuals shift.

---

## Build order on the day

1. Relay lands → record endpoint origin, anon key, response shape.
2. `public/_headers` — add the origin to `connect-src`. **First**, or everything else looks broken.
3. `src/sections/Workshops.jsx` — email field, submit → `fetch`, thank-you screen, fallback leg.
4. `src/strings.js` — new copy both languages (thank-you, bot-link button, no-bot line, failure
   line, email label). Prefills stay Arabic in both modes (F-10 rule, documented in that file's header).
5. `src/data/legal.js` — the 6 passages above + the header comment. **Same commit.**
6. QA: a new assertion file covering success / no-bot-link / failure-fallback / CSP-blocked,
   plus "one truth on screen" and that no submission is silently lost.
7. Full bar → one deploy → report with the privacy diff quoted.

## What is NOT in this hold

- W-01, the interim workshop name («اسم مؤقت — الاسم النهائي عند رسل»), stays a رسل item —
  a one-line ship the moment the name arrives, independent of this pipeline.
- The F-14 auto-flip already shipped (S44) and is unaffected: `endsOn` moves the Aug 8–9 event
  to `PAST` on 2026-08-10 whether or not this pipeline exists.
