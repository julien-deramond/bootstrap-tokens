/**
 * Check that each token map is recorded against the selector Bootstrap actually emits it on.
 *
 * `sass-targets.mjs` carries a selector per component, and it matters more than it looks: an
 * exported theme scopes component overrides to it, so a wrong one writes
 * `.form-check-input { --check-size: … }` for a property Bootstrap reads on `.check`, and the
 * override silently does nothing. Eight of the sixty-two were wrong.
 *
 * Nothing caught it because the Sass export does not use these selectors at all — it hands
 * values to Sass and lets Bootstrap place them — so the byte-identical result stayed
 * byte-identical while the CSS route, the theme stylesheet and the preview all missed.
 *
 * Reading the selector out of the *source* looks tempting and is the wrong tool: Sass
 * nesting, placeholder selectors and interpolation all have to be resolved first, which is
 * Sass's job. The compiled stylesheet has already done it. So the list stays curated — it is
 * a decision about what we model — and its correctness becomes a checked property.
 */

/**
 * Components whose recorded selector does not declare their tokens.
 *
 * `declarations` is the parsed compiled CSS: `Map<selector, Map<property, value>>`.
 */
export function selectorDrift(declarations, doc, components, ext) {
  const declaredAnywhere = new Set()
  for (const [, properties] of declarations) for (const property of properties.keys()) {
    declaredAnywhere.add(property)
  }

  const drift = []

  for (const component of components) {
    const wanted = (doc.byMap.get(component.sassMap) ?? [])
      .map((path) => ext(doc.tokens.get(path)).cssVar)
      .filter(Boolean)
      // Properties Bootstrap never declares are opt-in hooks — `var(--label-font-size,
      // inherit)` is unset on purpose — so their absence says nothing about the selector.
      .filter((property) => declaredAnywhere.has(property))

    if (wanted.length === 0) continue

    const fits = [...declarations]
      .filter(([, properties]) => wanted.every((property) => properties.has(property)))
      .map(([selector, properties]) => ({ selector, size: properties.size }))
      .sort((a, b) => a.size - b.size)

    const recorded = component.selector.split(',').map((part) => part.trim())
    if (fits.some((fit) => recorded.includes(fit.selector))) continue

    drift.push({
      name: component.name,
      sassMap: component.sassMap,
      recorded: component.selector,
      // The tightest fit: the selector declaring these and the fewest other things.
      actual: fits[0]?.selector ?? null
    })
  }

  return drift
}
