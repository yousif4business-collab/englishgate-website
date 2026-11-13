// Produces /brand-exports: native copies of the two logo PNGs plus 2x/4x
// interpolated upscales for larger raster use. The upscales are CLEARLY
// LABELED as upscaled-not-native — no vector master exists in this repo
// (verified 2026-07-07: no .ai/.eps/.pdf/.svg logo anywhere in tree or git
// history; 539x412 is the native ceiling). If the academy supplies the real
// vector master, replace all of this with true exports from it.
// Run: node scripts/upscale-logo.mjs
import { createCanvas, loadImage } from '@napi-rs/canvas'
import { mkdirSync, writeFileSync, copyFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = join(root, 'brand-exports')
mkdirSync(OUT, { recursive: true })

// Progressive 2-step doubling with high-quality smoothing — noticeably
// cleaner edges than a single 4x resample.
async function upscale(srcPath, factor) {
  let img = await loadImage(srcPath)
  let w = img.width, h = img.height
  let canvas
  for (let f = factor; f > 1; f /= 2) {
    w *= 2; h *= 2
    canvas = createCanvas(w, h)
    const ctx = canvas.getContext('2d')
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(img, 0, 0, w, h)
    img = await loadImage(canvas.toBuffer('image/png'))
  }
  return { buf: canvas.toBuffer('image/png'), w, h }
}

// Resample to an exact target width: progressively double past the target,
// then one high-quality downsample to the exact size.
async function toWidth(srcPath, targetW) {
  let img = await loadImage(srcPath)
  while (img.width < targetW) {
    const c = createCanvas(img.width * 2, img.height * 2)
    const ctx = c.getContext('2d')
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(img, 0, 0, c.width, c.height)
    img = await loadImage(c.toBuffer('image/png'))
  }
  const h = Math.round(img.height * (targetW / img.width))
  const c = createCanvas(targetW, h)
  const ctx = c.getContext('2d')
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(img, 0, 0, targetW, h)
  return { buf: c.toBuffer('image/png'), w: targetW, h }
}

const JOBS = [
  ['public/logo.png', 'logo-shield'],
  ['public/logo-full.png', 'logo-full-lockup'],
]
const PACK_WIDTHS = [512, 1024, 2048, 4096]

for (const [src, name] of JOBS) {
  const img = await loadImage(join(root, src))
  copyFileSync(join(root, src), join(OUT, `${name}-NATIVE-${img.width}x${img.height}.png`))
  for (const factor of [2, 4]) {
    const { buf, w, h } = await upscale(join(root, src), factor)
    writeFileSync(join(OUT, `${name}-UPSCALED-NOT-NATIVE-${factor}x-${w}x${h}.png`), buf)
    console.log(`${name} ${factor}x → ${w}x${h}`)
  }
  // Standard pack sizes. Only a target width BELOW the native width is true
  // quality (a downsample); everything else is interpolation and says so.
  for (const wTarget of PACK_WIDTHS) {
    const { buf, w, h } = await toWidth(join(root, src), wTarget)
    const label = wTarget <= img.width ? 'FROM-NATIVE' : 'UPSCALED-NOT-NATIVE'
    writeFileSync(join(OUT, `${name}-${wTarget}w-${label}-${w}x${h}.png`), buf)
    console.log(`${name} ${wTarget}w (${label}) → ${w}x${h}`)
  }
}
console.log('brand-exports/ written')
