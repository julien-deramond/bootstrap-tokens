/**
 * Strip markup a visitor pastes into the Theme Builder down to something safe to preview.
 *
 * The preview document is same-origin with the chooser — it has to be, or the chooser could
 * not read computed styles out of it — so a script in pasted markup would run with access to
 * the visitor's saved themes. Nothing here needs to execute to be previewed, so anything that
 * could execute is removed rather than escaped: `<script>` and friends outright, event-handler
 * attributes, and `javascript:` URLs in the attributes a click or a load would follow.
 *
 * Extracted from `preview.js` so it can be exercised on its own — by `tools/commands/probe.mjs`
 * in a real browser, and by anything else that wants to check it without the rest of the
 * preview around it.
 */
export const FORBIDDEN = 'script, iframe, object, embed, link, meta, base, noscript'

export function sanitise(markup) {
  const parsed = new DOMParser().parseFromString(`<body>${markup}</body>`, 'text/html')
  const body = parsed.body

  for (const element of body.querySelectorAll(FORBIDDEN)) element.remove()

  for (const element of body.querySelectorAll('*')) {
    for (const attribute of [...element.attributes]) {
      const name = attribute.name.toLowerCase()
      // Event handlers execute, and so does a `javascript:` URL when someone clicks it.
      if (name.startsWith('on')) element.removeAttribute(attribute.name)
      else if (
        (name === 'href' || name === 'src' || name === 'xlink:href' || name === 'action') &&
        /^\s*javascript:/i.test(attribute.value)
      ) {
        element.setAttribute(attribute.name, '#')
      }
    }
  }

  return body.innerHTML
}
