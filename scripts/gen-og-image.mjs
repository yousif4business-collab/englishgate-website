// Generates public/og-image.png — a 1200x630 branded social share card.
// Run: node scripts/gen-og-image.mjs
// Uses @napi-rs/canvas (devDependency) + fontsource Nunito/Cairo woff2 files.
import { createCanvas, loadImage, GlobalFonts } from '@napi-rs/canvas'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { writeFileSync } from 'node:fs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')
const F = (p) => join(root, p)

// Brand fonts
GlobalFonts.registerFromPath(F('node_modules/@fontsource/nunito/files/nunito-latin-800-normal.woff2'), 'Nunito')
GlobalFonts.registerFromPath(F('node_modules/@fontsource/nunito/files/nunito-latin-700-normal.woff2'), 'NunitoSemi')
GlobalFonts.registerFromPath(F('node_modules/@fontsource/cairo/files/cairo-arabic-700-normal.woff2'), 'Cairo')

const TEAL = '#0295B0'
const TEAL_DEEP = '#0B1F24'
const GOLD = '#F4D36C'
const GOLD_DEEP = '#C89A2E'
const CREAM = '#FAF7F1'
const INK = '#13343B'

const W = 1200
const H = 630
const canvas = createCanvas(W, H)
const ctx = canvas.getContext('2d')

// Background
ctx.fillStyle = CREAM
ctx.fillRect(0, 0, W, H)

// Soft blob shapes (radial gradients fading to transparent)
function blob(x, y, r, color, alpha) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r)
  g.addColorStop(0, hexA(color, alpha))
  g.addColorStop(1, hexA(color, 0))
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.arc(x, y, r, 0, Math.PI * 2)
  ctx.fill()
}
function hexA(hex, a) {
  const n = parseInt(hex.slice(1), 16)
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`
}
blob(1080, 90, 460, GOLD, 0.55)
blob(150, 600, 420, TEAL, 0.16)
blob(980, 620, 300, GOLD_DEEP, 0.1)

// Subtle dot texture
ctx.fillStyle = hexA(TEAL, 0.05)
for (let y = 40; y < H; y += 34) {
  for (let x = 40; x < W; x += 34) {
    ctx.beginPath()
    ctx.arc(x, y, 2.1, 0, Math.PI * 2)
    ctx.fill()
  }
}

// Top teal accent bar + bottom gold accent bar
ctx.fillStyle = TEAL
ctx.fillRect(0, 0, W, 10)
ctx.fillStyle = GOLD
ctx.fillRect(0, H - 10, W, 10)

// Logo lockup, centered-upper
const logo = await loadImage(F('public/logo-full.png'))
const logoW = 380
const logoH = (logo.height / logo.width) * logoW
const logoX = (W - logoW) / 2
const logoY = 78
ctx.drawImage(logo, logoX, logoY, logoW, logoH)

// Gold divider dots under the logo
const dividerY = logoY + logoH + 34
ctx.fillStyle = GOLD_DEEP
for (let i = -1; i <= 1; i++) {
  ctx.beginPath()
  ctx.arc(W / 2 + i * 26, dividerY, 4.5, 0, Math.PI * 2)
  ctx.fill()
}

// Tagline — English (Nunito) then Arabic (Cairo)
ctx.textAlign = 'center'
ctx.textBaseline = 'alphabetic'

ctx.fillStyle = TEAL_DEEP
ctx.font = '800 46px Nunito'
ctx.fillText('Where English Begins', W / 2, dividerY + 66)

ctx.fillStyle = TEAL
ctx.font = '700 44px Cairo'
ctx.fillText('هنا يبدأ الإنجليزي', W / 2, dividerY + 128)

// Export
const png = canvas.toBuffer('image/png')
writeFileSync(F('public/og-image.png'), png)
console.log(`Wrote public/og-image.png (${png.length} bytes)`)
