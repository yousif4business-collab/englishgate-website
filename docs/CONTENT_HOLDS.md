# CONTENT HOLDS

Content that exists, is production-ready, and is deliberately **not published**.

Everything listed here is one small edit away from going live. It is held for a
stated reason, and the reason — not the effort — is what unblocks it. If you
are about to publish something on this list, read the ruling first.

---

## 1. The four course clips — HELD

**Ruling date:** 2026-08-01
**Files:** `public/videos/_incoming/course-moment-0{1..4}.mp4` (+ posters)
**Status:** encoded, poster'd, gitignored, never deployed. Confirmed
unreachable on both production and the mirror.

### What they actually are

Not classroom footage. Each clip is a **phone recording of an iPad running a
live Google Meet class**. Visible in frame:

- the **video-call participant strip** — children's faces in tiles
- **name bars under the tiles**, and a named presenter tile
- the shared screen (a phonics lesson)

### Why they are held

The consent basis on record reads *"same classrooms/children as the consented
gallery, shot by the academy for promotion."* That describes the S38d gallery:
**photographs the academy took inside its own two classrooms**, cleared by the
director on 2026-07-27.

These clips are **outside that basis**. They are screen recordings of an online
session that children joined from home, and they put **names and faces together
on screen**. Stripping the audio (already done, `-an`) removes voices; it does
nothing about either.

Publishing a minor's name alongside their face is not reversible once it is on
a public domain and indexed. So they stay held.

### What clears them — any ONE of these

1. **رسل explicitly clears *these specific clips*** — not the gallery, not
   classroom photography in general, but this footage, understood as online-class
   recordings showing names and faces.
2. **Classroom-camera alternatives** are supplied instead — footage shot in the
   academy's own rooms, which the existing basis already covers.
3. **A name-bar crop or blur is approved**, and applied, so no name is legible
   and the consent question narrows to faces alone.


### S40 — approval candidates now exist (still held)

Two treatments of each of the four clips were produced offline with ffmpeg and
sent for رسل's decision. They are NOT in `public/`, NOT committed, and NOT
deployed — they live in the session scratchpad under
`exports/clips-for-approval/` with a `MANIFEST.txt`.

* `*-CROP.mp4` — the bottom 194px band (participant tiles with name bars, plus
  the presenter name bar) is cropped out of the frame entirely. No child's face
  and no name survives.
* `*-BLUR.mp4` — full frame kept, that band blurred in place. Composition
  preserved, faces and names illegible.

Both have their audio stream removed entirely.

This does **not** clear condition 3 above by itself: condition 3 requires that a
crop or blur be **approved**, and that approval is exactly what these candidates
are asking for. Until رسل says yes to a specific treatment, the hold stands and
nothing here ships.

### How to ship them once cleared

Everything needed already exists. The carousel supports video slides
(`src/sections/Sessions.jsx`) and the slide shape is documented in
`src/data/sessions.js`. Shipping is: move the files from `_incoming/` into
`public/videos/`, then add one entry per clip —

```js
{ type: 'video', slug: 'course-moment-01', src: '/videos/course-moment-01.mp4',
  poster: '/videos/course-moment-01-poster.webp', seconds: 16 }
```

No component change. Re-run the verify bar and deploy.

---

## 2. Two parent quotes — HELD (related, already documented)

`parent-04` and `parent-05` in `src/data/feedback.js` carry `consent: false`.
Each names the **child** in the parent's own words (شموسه / حرير). The
instruction to publish them was conditional on an anonymisation ruling that was
never answered. The full reasoning lives in that file's CONSENT note.

Same principle as §1: a child's name on a public page is the thing being
withheld.

---

## 3. Not a hold — for contrast

The **session photographs** and the **«ليش English Gate؟» promo** are live on
production and are correctly so: the photographs are the exact set the director
cleared on 2026-07-27, and the promo shows an adult presenter with no children
in frame.
