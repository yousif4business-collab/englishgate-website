// S14 photo intake: incoming-staff-photos/*.jpg → optimized webp pairs.
//   public/staff/incoming/photo-NN-600.webp   (card art, ≤120KB budget)
//   public/staff/incoming/photo-NN-1200.webp  (bio modal)
// Composition is kept AS-IS (the teal branded shoot IS the card art) — resize
// only, no cropping. Numbering follows the sorted source list and drives the
// /staff-mapping page; after the number→name mapping arrives the pairs are
// renamed to name slugs and this incoming/ folder goes away.
import { readdirSync, mkdirSync, writeFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { createCanvas, loadImage } from '@napi-rs/canvas'

const SRC = 'incoming-staff-photos'
const OUT = 'public/staff/incoming'
mkdirSync(OUT, { recursive: true })

const files = readdirSync(SRC)
  .filter(f => /\.(jpe?g|png)$/i.test(f))
  .sort((a, b) => a.localeCompare(b, 'en', { numeric: true }))

let i = 0
const manifest = []
for (const f of files) {
  i++
  const nn = String(i).padStart(2, '0')
  const img = await loadImage(join(SRC, f))
  for (const size of [600, 1200]) {
    const w = Math.min(size, img.width)
    const h = Math.round(img.height * (w / img.width))
    const c = createCanvas(w, h)
    c.getContext('2d').drawImage(img, 0, 0, w, h)
    const buf = await c.encode('webp', 80)
    const out = join(OUT, `photo-${nn}-${size}.webp`)
    writeFileSync(out, buf)
  }
  const kb600 = Math.round(statSync(join(OUT, `photo-${nn}-600.webp`)).size / 1024)
  const kb1200 = Math.round(statSync(join(OUT, `photo-${nn}-1200.webp`)).size / 1024)
  manifest.push({ n: i, source: f, kb600, kb1200 })
  console.log(`${nn}  ${f}  →  600px ${kb600}KB · 1200px ${kb1200}KB`)
}
writeFileSync(join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2))
console.log(`\n${i} photos → ${OUT}/`)
const over = manifest.filter(m => m.kb600 > 120)
if (over.length) {
  console.error('OVER 120KB budget:', over.map(m => m.n).join(', '))
  process.exit(1)
}
console.log('All card assets within the 120KB budget.')
