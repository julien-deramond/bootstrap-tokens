/**
 * Strip markup a visitor pastes into the Theme Builder down to something safe to preview.
 *
 * The preview document is same-origin with the chooser — it has to be, or the chooser could
 * not read computed styles out of it — so a script in pasted markup would run with access to
 * the visitor's saved themes. Nothing here needs to execute to be previewed, so anything that
 * could execute is removed rather than escaped: `<script>` and friends outright, event-handler
 * attributes, and `javascript:` URLs in the attributes a click or a load would follow.
 *
 * This is one layer of two. `preview.html` also carries a Content-Security-Policy that refuses
 * inline script, so whatever slips past here still has nothing to run with.
 *
 * Extracted from `preview.js` so it can be exercised on its own — by `tools/commands/probe.mjs`
 * in a real browser, and by anything else that wants to check it without the rest of the
 * preview around it.
 */
export const FORBIDDEN = 'script, iframe, object, embed, link, meta, base, noscript'

/** Attributes a click, a load or a form submission follows as a URL. */
export const URL_ATTRIBUTES = new Set(['href', 'src', 'xlink:href', 'action', 'formaction'])

/**
 * Whether a URL attribute's value would run as script.
 *
 * Read the way the browser's URL parser reads it, not the way it looks: tabs and newlines
 * anywhere are dropped, and so are leading control characters and spaces, so
 * `java&#9;script:` is as much a `javascript:` URL as the plain spelling.
 */
export function isScriptUrl(value) {
  const url = value.replace(/[\t\n\r]/g, '').replace(/^[\u0000- ]+/, '')
  return /^javascript:/i.test(url)
}

/**
 * SVG's `<animate>` and `<set>` write attributes after parsing, so one aimed at `href` can put
 * a `javascript:` URL back on a link this file just cleaned. Nothing a theme preview needs.
 */
const animatesUrl = (element) =>
  (element.localName === 'animate' || element.localName === 'set') &&
  /href$/i.test(element.getAttribute('attributeName') ?? '')

function clean(markup) {
  const parsed = new DOMParser().parseFromString(`<body>${markup}</body>`, 'text/html')
  const body = parsed.body

  for (const element of body.querySelectorAll(FORBIDDEN)) element.remove()

  for (const element of body.querySelectorAll('*')) {
    if (animatesUrl(element)) {
      element.remove()
      continue
    }
    for (const attribute of [...element.attributes]) {
      const name = attribute.name.toLowerCase()
      // Event handlers execute, and so does a `javascript:` URL when someone clicks it.
      if (name.startsWith('on')) element.removeAttribute(attribute.name)
      else if (URL_ATTRIBUTES.has(name) && isScriptUrl(attribute.value)) {
        element.setAttribute(attribute.name, '#')
      }
    }
  }

  return body.innerHTML
}

/**
 * Clean until the markup stops changing. Serializing a tree and parsing it again does not
 * always give the same tree back (nested forms inside MathML are the known case), so what
 * was checked on the first parse is not necessarily what the preview's own parse builds.
 * Markup that has not settled after a few rounds is not drawn at all.
 */
export function sanitise(markup) {
  let current = markup
  for (let round = 0; round < 4; round++) {
    const next = clean(current)
    if (next === current) return next
    current = next
  }
  return ''
}
