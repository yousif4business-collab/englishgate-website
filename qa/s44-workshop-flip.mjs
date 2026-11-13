// S44 / F-14 — proves the workshop flips to PAST on its own, by faking the
// clock instead of waiting for the calendar.
//
// Why this exists: «٨–٩ آب» is true until the 9th and wrong on the 10th. The
// old shape needed a human to remember. This asserts the data layer does it.
//
// Usage: node qa/s44-workshop-flip.mjs
import { partitionEvents, UPCOMING, PAST } from '../src/data/workshops.js'

let pass = 0
let fail = 0
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log(`  ✓ ${name}`) }
  else { fail++; console.log(`  ✗ ${name}  ${extra}`) }
}

const at = iso => partitionEvents(new Date(iso))
const ID = 'parents-aug-2026'
const has = (list, id) => list.some(e => e.id === id)

console.log('S44 — workshop auto-flip (F-14)\n')

// ── before and during the event: upcoming, and the section stays in its
// featured single-event state
for (const day of ['2026-08-04T09:00:00', '2026-08-08T18:00:00', '2026-08-09T23:59:00']) {
  const { upcoming, past } = at(day)
  ok(`${day.slice(0, 10)} → still UPCOMING`, has(upcoming, ID) && !has(past, ID))
  ok(`${day.slice(0, 10)} → featured single-event state (length 1)`, upcoming.length === 1, `len=${upcoming.length}`)
}

// ── the morning it expires, and every day after
for (const day of ['2026-08-10T00:01:00', '2026-08-10T12:00:00', '2026-09-01T09:00:00', '2027-01-01T09:00:00']) {
  const { upcoming, past } = at(day)
  ok(`${day.slice(0, 10)} → moved to PAST`, has(past, ID) && !has(upcoming, ID))
  ok(`${day.slice(0, 10)} → empty state (UPCOMING 0)`, upcoming.length === 0, `len=${upcoming.length}`)
}

// ── the boundary is the LAST day, not the first
{
  const eve = at('2026-08-09T23:59:59')
  const morn = at('2026-08-10T00:00:01')
  ok('flip happens between 09 23:59 and 10 00:00',
    has(eve.upcoming, ID) && has(morn.past, ID))
}

// ── the flipped event keeps its facts, so the empty state can name it
{
  const { past } = at('2026-08-15T09:00:00')
  const e = past.find(x => x.id === ID)
  ok('past event retains both titles', !!e && !!e.title_ar && !!e.title_en)
  ok('past event retains its confirmed date', !!e && e.date_ar === '٨–٩ آب' && e.date_en === 'August 8–9')
}

// ── an event with no endsOn never expires (honest open-ended behaviour)
{
  const openEnded = [{ id: 'open', title_ar: 'x', title_en: 'x' }]
  const { upcoming, past } = partitionEvents(new Date('2099-01-01T00:00:00'), openEnded)
  ok('event without endsOn never expires', upcoming.length === 1 && past.length === 0)
}

// ── what the site is doing RIGHT NOW, on the real clock
{
  const today = new Date()
  const expectPast = today > new Date('2026-08-09T23:59:59')
  ok(`live exports agree with today's real date (${today.toISOString().slice(0, 10)})`,
    expectPast ? has(PAST, ID) : has(UPCOMING, ID),
    `UPCOMING=${UPCOMING.length} PAST=${PAST.length}`)
}

console.log(`\nS44 FLIP: ${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
