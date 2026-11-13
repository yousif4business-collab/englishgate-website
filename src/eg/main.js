// The redesigned English Gate site: one page, built from scratchpad eg4 (tools/site_eg.py). Styles and code are bundled
// here so they ship as hashed assets; the 3D street is a separate module in public/js, loaded after the page.
import './eg.css'
import './page.js'
const s = document.createElement('script')
s.type = 'module'
s.src = '/js/eg-street.js'
document.body.appendChild(s)
