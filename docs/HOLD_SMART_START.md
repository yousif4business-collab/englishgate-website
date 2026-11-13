# HOLD — Smart Start program page (2026-08-12)

رسل announced Smart Start publicly with **«زوروا موقعنا لمعرفة كافة التفاصيل»**.
The site does not answer that yet. This is the build spec, ready to execute
cold. Everything below the line is either transcribed from her three story
images or an explicit constraint — **nothing here is invented.**

---

## The facts (transcribed — do not paraphrase, do not extend)

| Field | Value |
|---|---|
| Name | **Smart Start** (Latin, as she wrote it — brand name, `data-lang-exempt` in AR) |
| Mode | **حضوري فقط** — in person only, no online option |
| Ages | **٤–٥** |
| Starts | **٩/١** (1 September) |
| Hours | **٨:٠٠ صباحاً – ٢:٠٠ ظهراً** |
| Days | **٥ أيام أسبوعياً** |
| Duration | **مستمر طول العام الدراسي** |
| Shape | full-day English immersion |

**The day, in English** — six subjects, plus one Arabic lesson:
math · science · foundation · conversation · story time · activities
→ **«درس عربي واحد فقط»**

**Her pitch, VERBATIM — copy exactly, do not smooth:**
> «الأساس القوي من البداية يخلي الطفل يتعلم بثقة مو بخوف أو حفظ»

---

## What to build

1. **`/programs` gains a Smart Start card.** It must read as a **PROGRAM, not a
   course** — يومي، سنة كاملة, against `courses8`'s 2–3 month courses. Distinct
   visual treatment; do not clone `CourseCard`.
2. **A dedicated section** (anchor on `/programs`, e.g. `#smart-start`) carrying:
   - the facts table above,
   - the daily-subjects strip — **six SVG icons, NO EMOJI** (rule 5),
   - the philosophy line verbatim,
   - a **mode-purity note**: حضوري فقط — بلا أونلاين (consistent with S55's
     `placement.modePurity`, which is a separate string; do not reuse it, this
     one is stronger — Smart Start has no online variant at all),
   - the CTA below.

   A dedicated ROUTE is acceptable instead of a section, but costs more: router
   entry + page + `sitemap.xml` + the post-deploy gate's route count (it asserts
   ≥10 and iterates the sitemap). Section-on-`/programs` is the cheaper correct
   answer unless the owner wants its own URL.

3. **AR and EN both**, full purity (`qa/scan.mjs` must pass both engines).

---

## Hard constraints

- **CTA is the QUESTIONS door, not a booking door.**
  WhatsApp, prefill: **«أريد الاستفسار عن برنامج Smart Start»**
  Use `waLink()` from `lib/contact`. It must NOT link to `/placement`.
- **NO PRICE.** The owner has not supplied one. Honest absence beats an
  invented specific (rule 2). The standing prices-on-site question is unchanged.
- **No enrolment funnel.** See the open question below — do not invent one.
- No emojis anywhere; SVG icons only. The `⭐` in her story is decoration in a
  social post, not site copy.
- 390px first, full matrix, hold on localhost for «انشر» (rule 8 — this has
  visual surface).

---

## ⚠ OPEN QUESTION FOR THE OWNER — blocks the funnel, not the page

**How does a family actually enrol in Smart Start?**

The site now has exactly one intake door: `/placement` → queue → Telegram bot →
payment → exam. **Smart Start is ages 4–5.** A placement test for a four-year-old
is very likely wrong — S55's own copy says the placement test decides which
LEVEL a learner starts at, and an immersion program for pre-readers has no
levels to sort into.

**RULED 2026-08-12 (app relay announcement): DIRECT ENROLMENT — NO PLACEMENT
TEST.** Option 2 of the three below. Smart Start intake does not pass through
`/placement`, and the `smart_start` copy says so explicitly: ages 4-5, direct
enrolment. This was the reasoning in this file's original question — a queue
whose purpose is deciding a LEVEL has nothing to sort a pre-reader into — and
the owner has confirmed it.

~~1. same placement queue~~ · **2. direct enrolment (no test) — CHOSEN** ·
~~3. WhatsApp-only~~

**The CTA stays the QUESTIONS door until the relay actually lands.** The
mechanism for direct enrolment is the incoming app relay (below), not
something this page invents in the meantime.

**Second open question:** does Smart Start run at all three branches, or only
Adhamiya? `data/branches.js` has three; the story named none. Do not attach a
branch to it without a ruling — the same rule that keeps branch names off the
classroom photos (see `HomeTeasers.MomentsTeaser`).

---

## Why this is a hold and not a build

The session that received this brief was at the end of its context. Starting a
new section, two string blocks, six icons and a card — then stalling mid-file —
would have left a broken tree, which has cost this project a green-bar-against-
stale-`dist` incident before. The facts are transcribed here precisely so the
next session builds it in one pass without re-reading the story images.

**Nothing about this is blocked on engineering. It is one focused sprint.**


---

## INCOMING RELAY (announced 2026-08-12, NOT YET LANDED — do not build ahead of it)

The app's public registration form gains a **program selector**:

| | |
|---|---|
| Field | one selector, sets the interest tag |
| Options | **كورسات إنجليزي** \| **Smart Start** |
| `smart_start` copy | direct enrolment · no placement test · ages 4-5 |

**Build only when the relay lands** — the same discipline as
`HOLD_WORKSHOP_PIPELINE.md`, and for the same reason it was written: S45
shipped a v1 form against a v1.2 function, got `mode_invalid`, and had to be
reverted. **Probe the live endpoint first; never trust a sibling repo's
working tree.**

When it lands, expect to need: the selector's exact field name and accepted
values, whether it is required, and whether the existing intake function or a
new one receives it. None of that is knowable from the announcement.

Holds on localhost for «انشر» — visual surface (rule 8).

---

## STATUS 2026-08-13 (S61) — PAGE BUILT · SELECTOR STILL HELD

**The page is built** — `src/sections/SmartStart.jsx`, `#smart-start` on
`/programs`, strings in both blocks. Everything in "What to build" above is
shipped except the funnel, which was never in scope. Full bar green.

**The selector is still held. The relay has NOT landed** — probed live before
building, exactly as this file demanded:

```sh
SUPA=https://qzwrflxhcumnwcramrdy.supabase.co
ANON=$(grep VITE_SUPABASE_ANON_KEY .env | cut -d= -f2-)
# a) does the existing function know a program field?
curl -s -X POST "$SUPA/functions/v1/placement-request" \
  -H "apikey: $ANON" -H "Authorization: Bearer $ANON" -H 'Content-Type: application/json' \
  -d '{"full_name":"probe","age":5,"mode":"onsite","phone":"x","program":"smart_start"}'
# b) has a new function appeared?
curl -s -X POST "$SUPA/functions/v1/smart-start-request" \
  -H "apikey: $ANON" -H "Authorization: Bearer $ANON" -H 'Content-Type: application/json' -d '{}'
```

Measured 2026-08-13:

| Probe | Result |
|---|---|
| `placement-request` empty body | `400 {"error":"name_invalid"}` — alive, contract unchanged |
| `placement-request` + `program` | `400 {"error":"phone_invalid"}` — the unknown field is **tolerated, not validated** |
| `smart-start-request` · `program-request` · `registration-request` · `enroll-request` · `intake-request` | all `404 NOT_FOUND`, same as a control name that cannot exist |

**Deliberate limit of this probe:** whether `placement-request` silently
*consumes* a `program` field is NOT decidable from outside, because the only
payload that would prove it is one valid enough to insert a real record into
the owner's queue. Every probe above was kept invalid on purpose so nothing
could ever be written. Do not "settle" this by sending a valid one.

So the four unknowns this file listed — field name, accepted values, required
or not, which function receives it — are all still unknown. Nothing changed.
**Do not build the selector from the announcement text.** Wait for the relay.

---

## THE ARMED SPEC — SELECTOR (2026-08-14) · ARMED-HELD, DO NOT BUILD YET

A relay claiming **«CONTRACT LIVE»** arrived 2026-08-13 and was **DISPROVEN by
probe the same day.** The claim and the measurement, side by side:

| Relay claimed | Measured live | Verdict |
|---|---|---|
| `program` accepted, values `course\|smart_start` | `program:"bogus"` → `phone_invalid` | **ignored**, not validated |
| smart_start branch: `mode` omitted | `program:"smart_start"` + no `mode` → `mode_invalid` | **branch absent** |
| `deposit_iqd` returns `null` | not reachable — needs a real insert | unverified |
| a new function receives it | `smart-start-request` → `404` | **nothing landed** |

Field-name and encoding alternatives were ruled out too: `program_type`,
`interest`, `track`, `mode:null`, `mode:""` all still answer `mode_invalid`.
One claim DID check out: **age 4 is accepted** (age 2 → `age_invalid`, so
`AGE_MIN` 3 is intact).

### The gate: build ONLY on a re-relay marked VERIFIED, and probe FIRST

Three shapes must ALL answer correctly before a line is written. Anything else
is the S45 regression a second time.

```sh
SUPA=https://qzwrflxhcumnwcramrdy.supabase.co
ANON=$(grep VITE_SUPABASE_ANON_KEY .env | cut -d= -f2-)
P () { curl -s -X POST "$SUPA/functions/v1/placement-request" \
  -H "apikey: $ANON" -H "Authorization: Bearer $ANON" \
  -H 'Content-Type: application/json' -d "$1"; echo; }

# 1. BOGUS MUST BE REFUSED  → expect a program_* error, NOT phone_invalid
P '{"full_name":"probe","age":9,"mode":"onsite","phone":"x","program":"bogus"}'

# 2. SMART_START + NO MODE MUST SUCCEED → expect ok:true and deposit_iqd null
#    ⚠ THE ONLY PROBE HERE THAT WRITES A REAL RECORD. Run it once, with the
#    owner's knowledge, and tell them to clear the test row.
P '{"full_name":"probe","age":4,"phone":"+9647700000000","program":"smart_start"}'

# 3. COURSE UNCHANGED → expect mode still REQUIRED on the course path
P '{"full_name":"probe","age":9,"phone":"x","program":"course"}'
```

Shape 2 is the one that cannot be measured without a write. Until the owner
authorises that single insert, "verified" is a claim, not a measurement — say
so rather than assuming.

### What to build, once and only once the gate passes

- **First field on the registration form**, above everything else:
  «كورسات إنجليزي» | **Smart Start**. No emoji (rule 5). AR + EN.
- **Selecting Smart Start** hides/omits the mode control and swaps the helper
  copy to: أعمار ٤–٥ · حضوري فقط · يومي ٨:٠٠–٢:٠٠ · مستمر من ١ أيلول ·
  تسجيل مباشر بدون اختبار.
- **Posts `program=smart_start`**; age must accept 4 (already true, measured).
- **The course path stays byte-for-byte identical.** Not "equivalent" —
  identical. It is the working door and carries every existing booking.

### ⚠ NEW RULING 2026-08-14 — THE DEPOSIT RENDER-SITE

The earlier spec said «`deposit_iqd` null → render «بدون رسوم اختبار» NEVER ٠»
but named no render site, and there wasn't one: `formatDeposit()` in
`lib/placement-api.js` is DEAD CODE. S54's ONE VOICE ruling removed the amount
from the receipt — the bot owns the deposit from that point on. The only
deposit a family actually sees is the **static pre-submit sidebar card**.

**RULED:** that sidebar card becomes **program-aware**.

| Selection | Sidebar card |
|---|---|
| course (or nothing chosen) | **byte-identical to today** — the ١٠٠k/١٥٠k `depositLine` |
| smart_start | swapped to «تسجيل مباشر — بدون رسوم اختبار» · the ١٥٠k line **hidden entirely** |

- `formatDeposit()` **stays dead.** Do not revive it, do not render an amount
  in the receipt. The ONE VOICE law is intact.
- The swapped copy is a POLICY line, the same class as the `#smart-start`
  enrolment row already live on `/programs` — it must never render `٠`, and it
  must never render a number at all.

### Why this is still held

`/placement` is the site's only intake door and it works. Wiring a selector
into it against a contract the live function does not implement would either
dead-end every Smart Start submission on `mode_invalid`, or — worse, if `mode`
were forced — file a four-year-old's family as an ordinary placement-test
request: into the queue, at the bot, against a ١٥٠k non-refundable deposit,
contradicting the «تسجيل مباشر — بدون اختبار تحديد مستوى» line now LIVE on
`/programs`.

**Idle between relays is correct. Invent nothing.**
