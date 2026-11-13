import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { rmSync, existsSync } from 'node:fs'
import path from 'node:path'

// S37 — assets that live under public/ for TOOLING reasons but must never be
// published. Vite copies public/ verbatim into dist/, and every deploy we run
// (`netlify deploy --dir=dist`, `wrangler pages deploy dist`) ships whatever
// it finds there — so without this these are publicly fetchable on the CDN.
// The sources on disk are never touched; only the build output is pruned.
const NEVER_PUBLISH = [
  // 35.5 MB of raw camera masters. Gitignored (.gitignore:51) and this is the
  // ONLY copy that exists — never delete the source. Nothing references them;
  // the encoded videos the site actually plays are public/videos/*.mp4.
  'videos/_originals',
  // 111 KB source lockup, replaced on-site by the inline wordmark (see
  // Footer.jsx). No page references it, but it is the INPUT to
  // scripts/gen-og-image.mjs and scripts/upscale-logo.mjs, so it stays in the
  // repo — it just has no business on the CDN.
  'logo-full.png',
  // S38: photo INTAKE staging (77 MB — full-res headshots the director drops
  // in, plus raw classroom shots). Nothing on the site links here; the shipped
  // assets are the cut-down public/staff/<slug>-{600,1200}.webp. Kept on disk
  // because it is the source for re-cuts, pruned so it never reaches the CDN.
  'staff/incoming',
  // S38l: video intake staging — same rule as staff/incoming. The finals that
  // actually ship are public/videos/<slug>.mp4, committed and served from
  // /videos/*; nothing under _incoming has any business on the CDN.
  'videos/_incoming',
]

// Deletes NEVER_PUBLISH from the build output, after publicDir has been copied.
function prunePublishedAssets() {
  let outDir
  return {
    name: 'eg-prune-unpublished-assets',
    apply: 'build',
    configResolved(config) {
      outDir = path.resolve(config.root, config.build.outDir)
    },
    closeBundle() {
      for (const rel of NEVER_PUBLISH) {
        const target = path.resolve(outDir, rel)
        // Never let an entry escape the build dir — this call is destructive.
        if (target !== outDir && !target.startsWith(outDir + path.sep)) {
          this.error(`NEVER_PUBLISH entry escapes outDir: ${rel}`)
        }
        if (existsSync(target)) {
          rmSync(target, { recursive: true, force: true })
          this.info(`pruned from publish: ${rel}`)
        }
      }
    },
  }
}

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    prunePublishedAssets(),
  ],
  // This project owns the 5200–5209 port block on this machine (one unique
  // 10-port block per project so dev/preview servers never collide).
  // strictPort makes a taken port fail loudly instead of silently drifting.
  server: {
    host: 'localhost',
    port: 5200,
    strictPort: true,
  },
  preview: {
    port: 5201,
    strictPort: true,
  },
  build: {
    // Explicitly off (also the default): source maps must never ship to
    // production. qa/security asserts dist/ contains no *.map files.
    sourcemap: false,
  },
})
