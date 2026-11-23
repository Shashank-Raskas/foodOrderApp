import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'node:fs'
import path from 'node:path'

/**
 * Writes a copy of index.html for every page path (dist/menu/index.html, dist/meal/m22/index.html, …).
 *
 * Why: Render's rewrite rule (/* → /index.html) started answering every path except "/" with an
 * empty 200 response, so opening or refreshing /menu showed a blank page even though the rule is
 * set correctly. With a real file at each path, Render serves the file and never needs the rewrite;
 * the rewrite remains only as the fallback for paths not known at build time.
 *
 * Page paths come from the <Route path="…"> entries in src/App.jsx, so a new page is covered
 * automatically; meal pages come from the seed menu (meals added later through the admin dashboard
 * still rely on the rewrite until the next build).
 */
function spaRouteShells() {
  let outDir
  return {
    name: 'spa-route-shells',
    apply: 'build',
    configResolved(config) {
      outDir = path.resolve(config.root, config.build.outDir)
    },
    closeBundle() {
      const html = fs.readFileSync(path.join(outDir, 'index.html'), 'utf8')
      const app = fs.readFileSync(path.resolve('src/App.jsx'), 'utf8')
      const pages = [...app.matchAll(/<Route\s+path="([^"]+)"/g)]
        .map((m) => m[1])
        .filter((p) => p !== '/' && p !== '*' && !p.includes(':') && !p.endsWith('.html'))
      const meals = JSON.parse(fs.readFileSync(path.resolve('backend/data/available-meals.json'), 'utf8'))
      const paths = [...pages, ...meals.map((m) => `/meal/${m.id}`)]

      for (const p of paths) {
        const dir = path.join(outDir, p)
        fs.mkdirSync(dir, { recursive: true })
        fs.writeFileSync(path.join(dir, 'index.html'), html)
      }
      // Also served by static hosts for unknown paths when no rewrite applies
      fs.writeFileSync(path.join(outDir, '404.html'), html)
      console.log(`[spa-route-shells] wrote index.html for ${pages.length} pages and ${meals.length} meals, plus 404.html`)
    },
  }
}

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), spaRouteShells()],
})
