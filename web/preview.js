/**
 * The preview document.
 *
 * Three jobs beyond rendering markup: it can show light and dark side by side (v6's
 * defining feature is `light-dark()`, so a theme is always two themes and comparing them
 * should not require flipping a switch); it can be told to bring a section into view when
 * the chooser touches a related control; and it re-themes purely by re-declaring custom
 * properties, so nothing here recompiles.
 */

const THEMES = ['primary', 'accent', 'success', 'danger', 'warning', 'info', 'secondary', 'inverse']
/* Replaced by the chooser whenever the set of scales changes, so a colour someone added
   shows up in the palette rather than being invisible in the one place it should be. */
let HUES = ['blue', 'indigo', 'violet', 'purple', 'pink', 'red', 'orange', 'amber', 'yellow', 'lime', 'green', 'teal', 'cyan', 'brown', 'gray', 'pewter']
const STOPS = ['025', '050', '100', '200', '300', '400', '500', '600', '700', '800', '900', '950', '975']

const section = (id, title, body) => `
  <section class="preview-section" data-section="${id}">
    <h2>${title}</h2>
    ${body}
  </section>`

const buttons = () => section(
  'buttons',
  'Buttons',
  `<div class="cluster">
    ${THEMES.map((t) => `<button type="button" class="btn btn-solid theme-${t}">${t}</button>`).join('')}
  </div>
  <div class="cluster mt">
    ${['outline', 'subtle', 'text'].map((v) => `<button type="button" class="btn btn-${v} theme-primary">${v}</button>`).join('')}
    <button type="button" class="btn btn-solid btn-styled theme-primary">styled</button>
    <button type="button" class="btn btn-link">link</button>
    <button type="button" class="btn btn-solid theme-primary" disabled>disabled</button>
  </div>
  <div class="cluster mt">
    ${['xs', 'sm', '', 'lg'].map((s) => `<button type="button" class="btn btn-solid theme-secondary ${s ? `btn-${s}` : ''}">${s || 'base'}</button>`).join('')}
  </div>`
)

const alerts = () => section(
  'alerts',
  'Alerts and badges',
  `${['primary', 'success', 'warning', 'danger'].map((t) => `
    <div class="alert theme-${t}" role="alert">
      <p class="m-0"><strong>${t}</strong> — a short message with a <a href="#" class="alert-link">link</a>.</p>
    </div>`).join('')}
  <div class="cluster mt">
    ${THEMES.slice(0, 5).map((t) => `<span class="badge theme-${t}">${t}</span>`).join('')}
    <span class="badge badge-subtle theme-primary">subtle</span>
    <span class="badge badge-outline theme-primary">outline</span>
    <div class="spinner-border theme-primary" role="status"><span class="visually-hidden">Loading…</span></div>
  </div>`
)

const surfaces = (uid) => section(
  'surfaces',
  'Cards, lists, progress',
  `<div class="preview-row">
    <section class="card">
      <div class="card-header">Featured</div>
      <div class="card-body">
        <h4 class="card-title">Card title</h4>
        <p class="card-text">Some quick example text to build on the card title.</p>
        <a href="#" class="btn btn-solid theme-primary">Go somewhere</a>
      </div>
    </section>
    <ul class="list-group">
      <li class="list-group-item active" aria-current="true">An active item</li>
      <li class="list-group-item">A second item</li>
      <li class="list-group-item">A third item</li>
      <li class="list-group-item disabled">A disabled item</li>
    </ul>
    <div>
      <div class="progress" role="progressbar" aria-label="Example" aria-valuenow="65" aria-valuemin="0" aria-valuemax="100">
        <div class="progress-bar" style="width:65%"></div>
      </div>
      <table class="table mt">
        <thead><tr><th scope="col">#</th><th scope="col">Token</th></tr></thead>
        <tbody>
          <tr><th scope="row">1</th><td><code>--primary-bg</code></td></tr>
          <tr><th scope="row">2</th><td><code>--spacer-4</code></td></tr>
        </tbody>
      </table>
    </div>
  </div>`
)

/**
 * Shadows had no home in the sample, so the shadow control changed nothing visible.
 * These boxes exist purely so that dial has something to point at.
 */
const elevation = () => section(
  'elevation',
  'Elevation',
  `<div class="elevation-row">
    ${['xs', 'sm', '', 'lg', 'xl'].map((size) => `
      <div class="elevation-box" style="box-shadow: var(--box-shadow${size ? `-${size}` : ''})">
        <span>${size || 'base'}</span>
      </div>`).join('')}
  </div>`
)

const forms = (uid) => section(
  'forms',
  'Forms',
  `<div class="preview-row">
    <div>
      <label class="form-label" for="email-${uid}">Email</label>
      <input type="email" class="form-control" id="email-${uid}" placeholder="name@example.com" />
      <div class="form-text">We never share it.</div>
    </div>
    <div>
      <label class="form-label" for="select-${uid}">Select</label>
      <select class="form-select" id="select-${uid}">
        <option>Choose…</option>
        <option>Another option</option>
      </select>
    </div>
    <div>
      <label class="form-label" for="range-${uid}">Range</label>
      <input type="range" class="form-range" id="range-${uid}" />
      <div class="input-group mt">
        <span class="input-group-text">@</span>
        <input type="text" class="form-control" aria-label="Username" />
      </div>
      <div class="form-floating mt">
        <input type="text" class="form-control" id="floating-${uid}" placeholder="Name" />
        <label for="floating-${uid}">Floating label</label>
      </div>
    </div>
    <div>
      <div class="form-check">
        <input class="form-check-input" type="checkbox" id="check-${uid}" checked />
        <label class="form-check-label" for="check-${uid}">Checkbox</label>
      </div>
      <div class="form-check">
        <input class="radio" type="radio" name="radio-${uid}" id="radio-${uid}" checked />
        <label class="form-check-label" for="radio-${uid}">Radio</label>
      </div>
      <div class="form-adorn mt">
        <span class="form-adorn-text">$</span>
        <input type="text" class="form-control" aria-label="Amount" value="12.00" />
      </div>
      <div class="form-check form-switch">
        <input class="form-check-input" type="checkbox" role="switch" id="switch-${uid}" checked />
        <label class="form-check-label" for="switch-${uid}">Switch</label>
      </div>
    </div>
  </div>`
)

/* A neutral placeholder image, so the sample needs no network. */
const IMG =
  "data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3e%3crect width='64' height='64' fill='%23888'/%3e%3c/svg%3e"

const content = () => section(
  'content',
  'Content',
  `<div class="accordion mb">
    <details class="accordion-item" open>
      <summary class="accordion-header">An open item</summary>
      <div class="accordion-body">Body text, shown because the item is open.</div>
    </details>
    <details class="accordion-item">
      <summary class="accordion-header">A closed item</summary>
      <div class="accordion-body">Body text.</div>
    </details>
  </div>

  <div class="cluster mb">
    <span class="avatar"><img class="avatar-img" src="${IMG}" alt="" /></span>
    <span class="chip theme-primary">A chip</span>
    <span class="chip theme-danger">Another</span>
    <img class="img-thumbnail" src="${IMG}" alt="" width="52" height="52" />
    <a href="#" class="icon-link">An icon link</a>
    <button type="button" class="btn-close" aria-label="Close"></button>
  </div>

  <ol class="stepper mb">
    <li class="stepper-item active">Create account</li>
    <li class="stepper-item active">Confirm email</li>
    <li class="stepper-item">Finish</li>
  </ol>

  <p class="placeholder-glow mb">
    <span class="placeholder" style="inline-size:7rem"></span>
    <span class="placeholder" style="inline-size:4rem"></span>
    <span class="placeholder" style="inline-size:9rem"></span>
  </p>

  <figure class="figure mb">
    <img class="figure-img" src="${IMG}" alt="" width="72" height="72" />
    <figcaption class="figure-caption">A caption below the figure.</figcaption>
  </figure>

  <div class="prose">
    <h4>Prose</h4>
    <p>A block of long-form text, styled by the prose component rather than by utilities.</p>
  </div>

  <div class="collapse show mb"><p class="m-0">A collapse, shown.</p></div>
  <div class="fade show"><p class="m-0">A fade, shown.</p></div>`
)

const overlays = () => section(
  'overlays',
  'Toasts and overlays',
  `<div class="toast show mb" role="alert">
    <div class="toast-header"><strong class="me-auto">Bootstrap</strong><small>11 mins ago</small></div>
    <div class="toast-body">Hello, world! This is a toast message.</div>
  </div>

  <div class="cluster">
    <div class="spinner-grow theme-primary" role="status"><span class="visually-hidden">Loading…</span></div>
    <div class="spinner-border theme-accent" role="status"><span class="visually-hidden">Loading…</span></div>
  </div>

  <div class="card hover-lift mt" style="max-width:16rem">
    <div class="card-body">
      <h5 class="card-title">Hover lift</h5>
      <p class="card-text">The whole card is a <a href="#" class="stretched-link">stretched link</a>.</p>
    </div>
  </div>`
)

const navigation = () => section(
  'navigation',
  'Navigation',
  `<nav class="navbar bg-1 fg-2 mb">
    <div class="container-fluid">
      <a class="navbar-brand" href="#">Navbar</a>
      <ul class="navbar-nav">
        <li class="nav-item"><a class="nav-link active" aria-current="page" href="#">Home</a></li>
        <li class="nav-item"><a class="nav-link" href="#">Features</a></li>
      </ul>
    </div>
  </nav>

  <ul class="nav nav-tabs">
    <li class="nav-item"><a class="nav-link active" aria-current="page" href="#">Active</a></li>
    <li class="nav-item"><a class="nav-link" href="#">Link</a></li>
    <li class="nav-item"><a class="nav-link disabled" aria-disabled="true">Disabled</a></li>
  </ul>
  <div class="tab-content mb">
    <div class="tab-pane active"><p class="m-0">The active tab pane.</p></div>
  </div>

  <ul class="nav nav-underline mb">
    <li class="nav-item"><a class="nav-link active" aria-current="page" href="#">Active</a></li>
    <li class="nav-item"><a class="nav-link" href="#">Link</a></li>
  </ul>

  <nav aria-label="Breadcrumb" class="mb">
    <ol class="breadcrumb">
      <li class="breadcrumb-item"><a class="breadcrumb-link" href="#">Home</a></li>
      <li class="breadcrumb-divider"></li>
      <li class="breadcrumb-item"><a class="breadcrumb-link" href="#">Library</a></li>
    </ol>
  </nav>
  <ul class="nav nav-pills mb">
    <li class="nav-item"><a class="nav-link active" aria-current="page" href="#">Active</a></li>
    <li class="nav-item"><a class="nav-link" href="#">Link</a></li>
  </ul>
  <nav aria-label="Pagination">
    <ul class="pagination">
      <li class="page-item"><a class="page-link" href="#">Previous</a></li>
      <li class="page-item active" aria-current="page"><a class="page-link" href="#">1</a></li>
      <li class="page-item"><a class="page-link" href="#">2</a></li>
      <li class="page-item"><a class="page-link" href="#">Next</a></li>
    </ul>
  </nav>`
)

const typography = () => section(
  'typography',
  'Typography and surfaces',
  `<h1>Heading one</h1>
  <h3>Heading three</h3>
  <p>Body copy with a <a href="#">link</a>, some <code>inline code</code>, <mark>a mark</mark> and <kbd>Ctrl</kbd> + <kbd>K</kbd>.</p>
  <blockquote class="blockquote"><p>A well-known quote, contained in a blockquote element.</p></blockquote>
  <div class="surface-row">
    ${['body', '1', '2', '3', '4'].map((n) => `
      <div class="surface" style="background: var(--bg-${n})"><code>--bg-${n}</code></div>`).join('')}
  </div>`
)

const palette = () => section(
  'palette',
  'Colour scale',
  HUES.map((hue) => `
    <div class="swatch-row">
      <span>${hue}</span>
      <div class="swatch-grid">
        ${STOPS.map((stop) => `<div style="background:var(--${hue}-${stop})" title="--${hue}-${stop}"></div>`).join('')}
      </div>
    </div>`).join('')
)

/* -------------------------------------------------------------- scenarios -- */

/**
 * A realistic page, not a gallery.
 *
 * A row of buttons beside a row of alerts answers "do these components look right?" but not
 * "does my theme survive a page?" — which is the question anyone actually has. Spacing
 * against real prose, a navbar over content, cards in a grid: these are where a density or
 * radius choice succeeds or falls apart.
 */
const page = (uid) => `
  <nav class="navbar bg-1 fg-2 mb">
    <div class="container-fluid">
      <a class="navbar-brand" href="#">Northwind</a>
      <ul class="navbar-nav">
        <li class="nav-item"><a class="nav-link active" aria-current="page" href="#">Overview</a></li>
        <li class="nav-item"><a class="nav-link" href="#">Reports</a></li>
        <li class="nav-item"><a class="nav-link" href="#">Settings</a></li>
      </ul>
    </div>
  </nav>

  <section class="preview-hero">
    <h1>Everything in one place</h1>
    <p class="lead">A short paragraph of the kind of copy that actually ships, long enough that
      the line height and measure have somewhere to show themselves.</p>
    <div class="cluster">
      <a href="#" class="btn btn-solid theme-primary btn-lg">Get started</a>
      <a href="#" class="btn btn-outline theme-primary btn-lg">Read the docs</a>
    </div>
  </section>

  <div class="preview-grid">
    ${[
      ['Revenue', '$48,200', 'success', '+12% on last month'],
      ['Open tickets', '37', 'warning', '6 breaching SLA'],
      ['Churn', '1.8%', 'danger', 'Up from 1.2%']
    ]
      .map(
        ([title, figure, theme, note]) => `
        <section class="card">
          <div class="card-body">
            <p class="card-text"><small class="text-body-secondary">${title}</small></p>
            <h3 class="card-title">${figure}</h3>
            <span class="badge badge-subtle theme-${theme}">${note}</span>
          </div>
        </section>`
      )
      .join('')}
  </div>

  <section class="card mt">
    <div class="card-header">Add a customer</div>
    <div class="card-body">
      <div class="preview-row">
        <div>
          <label class="form-label" for="page-name-${uid}">Name</label>
          <input type="text" class="form-control" id="page-name-${uid}" value="Northwind Traders" />
        </div>
        <div>
          <label class="form-label" for="page-plan-${uid}">Plan</label>
          <select class="form-select" id="page-plan-${uid}"><option>Growth</option></select>
        </div>
      </div>
      <div class="cluster mt">
        <button type="button" class="btn btn-solid theme-primary">Save</button>
        <button type="button" class="btn btn-text">Cancel</button>
      </div>
    </div>
  </section>

  <table class="table mt">
    <thead><tr><th scope="col">Customer</th><th scope="col">Plan</th><th scope="col">Status</th></tr></thead>
    <tbody>
      <tr><td>Northwind Traders</td><td>Growth</td><td><span class="badge theme-success">Active</span></td></tr>
      <tr><td>Contoso</td><td>Starter</td><td><span class="badge theme-warning">Trial</span></td></tr>
      <tr><td>Fabrikam</td><td>Growth</td><td><span class="badge theme-secondary">Paused</span></td></tr>
    </tbody>
  </table>`

/**
 * Every state a component can be in, side by side.
 *
 * States are where a theme breaks: a disabled control that still looks clickable, a focus
 * ring that vanishes on a dark fill, an invalid field indistinguishable from a valid one.
 * They only ever appeared here by accident before.
 */
const states = (uid) => `
  <div class="state-grid">
    ${[
      ['Default', ''],
      ['Active', ' active'],
      ['Disabled', ' disabled']
    ]
      .map(
        ([label, extra]) => `
        <div>
          <p class="state-label">${label}</p>
          <div class="cluster">
            <button type="button" class="btn btn-solid theme-primary${extra}"${extra === ' disabled' ? ' disabled' : ''}>Solid</button>
            <button type="button" class="btn btn-outline theme-primary${extra}"${extra === ' disabled' ? ' disabled' : ''}>Outline</button>
            <button type="button" class="btn btn-text theme-primary${extra}"${extra === ' disabled' ? ' disabled' : ''}>Text</button>
          </div>
        </div>`
      )
      .join('')}
    <div>
      <p class="state-label">Focus ring</p>
      <div class="cluster">
        <span class="btn btn-solid theme-primary focus-ring">Solid</span>
        <span class="btn btn-outline theme-primary focus-ring">Outline</span>
      </div>
    </div>
  </div>

  <div class="state-grid mt">
    <div>
      <p class="state-label">Field — default</p>
      <input type="text" class="form-control" value="Northwind" aria-label="Default" />
    </div>
    <div>
      <p class="state-label">Field — invalid</p>
      <input type="text" class="form-control is-invalid" value="not an email" aria-label="Invalid" />
      <div class="invalid-feedback d-block">Use an address like name@example.com.</div>
    </div>
    <div>
      <p class="state-label">Field — disabled</p>
      <input type="text" class="form-control" value="Locked" disabled aria-label="Disabled" />
    </div>
    <div>
      <p class="state-label">Field — focus ring</p>
      <input type="text" class="form-control focus-ring" value="Focused" aria-label="Focused" />
    </div>
  </div>

  <div class="state-grid mt">
    <div>
      <p class="state-label">Loading</p>
      <div class="cluster">
        <div class="spinner-border theme-primary" role="status"><span class="visually-hidden">Loading</span></div>
        <p class="placeholder-glow m-0"><span class="placeholder" style="inline-size:6rem"></span></p>
      </div>
    </div>
    <div>
      <p class="state-label">Empty</p>
      <div class="state-empty">
        <p class="m-0"><strong>No customers yet</strong></p>
        <p class="m-0"><small class="text-body-secondary">They will appear here once you add one.</small></p>
      </div>
    </div>
    <div>
      <p class="state-label">Selected</p>
      <ul class="list-group">
        <li class="list-group-item active" aria-current="true">Selected row</li>
        <li class="list-group-item">Ordinary row</li>
        <li class="list-group-item disabled">Disabled row</li>
      </ul>
    </div>
  </div>`

/* ----------------------------------------------------------- your markup -- */

/**
 * Render a chunk of the visitor's own HTML.
 *
 * The gallery answers "do Bootstrap's components look right?". This answers the question
 * anyone actually has, which is whether the theme survives *their* page — their nesting,
 * their utility classes, their content lengths, the bit of custom CSS they forgot about.
 *
 * It is parsed and stripped rather than assigned straight to innerHTML. This document is
 * same-origin with the chooser — it has to be, or the chooser could not read computed
 * styles out of it — so a script in pasted markup would run with access to the visitor's
 * saved themes. Nothing here needs to execute to be previewed.
 */
const FORBIDDEN = 'script, iframe, object, embed, link, meta, base, noscript'

function sanitise(markup) {
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

const EMPTY_MARKUP = `
  <div class="preview-empty">
    <p><strong>Nothing pasted yet.</strong></p>
    <p>Choose <em>Your markup</em> again to paste a chunk of your own HTML. It renders here
    with the theme applied, in both colour schemes.</p>
  </div>`

/** Set by the chooser. Sanitised once per change rather than once per artboard. */
let markup = ''

const SCENARIOS = {
  components: (uid) => componentGallery(uid),
  page: (uid) => section('page', 'A page', page(uid)),
  states: (uid) => section('states', 'Every state', states(uid)),
  yours: () => section('yours', 'Your markup', markup || EMPTY_MARKUP)
}

const componentGallery = (uid) =>
  [
    buttons(),
    forms(uid),
    alerts(),
    surfaces(uid),
    content(),
    overlays(),
    elevation(),
    navigation(),
    typography(),
    palette()
  ].join('')

/** What the artboards render. Set by the chooser; components unless told otherwise. */
let scenario = 'components'

const sample = (uid) => (SCENARIOS[scenario] ?? SCENARIOS.components)(uid)

/* -------------------------------------------------------------------------- */

const root = document.getElementById('preview-root')
const overrides = document.getElementById('token-overrides')

let mode = 'light'

/** One framed, labelled artboard. `variant` marks the themed side of a comparison. */
/** Which simulated vision the artboards are drawn through. `normal` means no filter. */
let vision = 'normal'

const VISIONS = new Set(['protanopia', 'deuteranopia', 'tritanopia', 'achromatopsia'])

const visionAttributes = () =>
  VISIONS.has(vision)
    ? ` data-vision="${vision}" style="--vision-filter: url(#vision-${vision})"`
    : ''

const board = (scheme, { label = scheme, variant = null } = {}) => `
  <figure class="board board-${scheme}">
    <figcaption class="board-label"><span class="board-swatch"></span>${label}</figcaption>
    <div class="artboard">
      <div class="pane${variant ? ` ${variant}` : ''}" data-bs-theme="${scheme}"${visionAttributes()}>${sample(`${label}-${scheme}`)}</div>
    </div>
  </figure>`

function render() {
  if (mode === 'compare') {
    // The same scheme twice: Bootstrap's defaults on the left, this theme on the right.
    // Only the right pane carries the override styles, which are scoped to it.
    root.className = 'preview-split'
    root.innerHTML =
      board(compareScheme, { label: 'default', variant: 'pane-before' }) +
      board(compareScheme, { label: 'this theme', variant: 'pane-after' })
    syncScrolling()
    return
  }

  const schemes = mode === 'split' ? ['light', 'dark'] : [mode]
  root.className = mode === 'split' ? 'preview-split' : 'preview-single'
  root.innerHTML = schemes.map((scheme) => board(scheme)).join('')
  syncScrolling()
}

/** Which scheme a comparison is shown in. */
let compareScheme = 'light'

const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)')

/**
 * Scroll a container ourselves rather than leaning on `scroll-behavior: smooth` or
 * `scrollIntoView({ behavior: 'smooth' })`: both are silently ignored in some embedded
 * frames, and a control that appears to do nothing is worse than one that jumps.
 */
function scrollToOffset(container, top) {
  const max = container.scrollHeight - container.clientHeight
  const target = Math.max(0, Math.min(top, max))

  if (reducedMotion.matches) {
    container.scrollTop = target
    return
  }

  const from = container.scrollTop
  const distance = target - from
  if (Math.abs(distance) < 2) return

  const duration = Math.min(420, 120 + Math.abs(distance) * 0.35)
  const start = performance.now()

  const step = (now) => {
    const progress = Math.min(1, (now - start) / duration)
    // easeOutCubic: quick to move, gentle to land.
    const eased = 1 - (1 - progress) ** 3
    container.scrollTop = from + distance * eased
    if (progress < 1) requestAnimationFrame(step)
  }

  requestAnimationFrame(step)
}

/** Bring a section into view and flash it, so a control and its result are connected. */
function focusSection(id) {
  const targets = root.querySelectorAll(`[data-section="${id}"]`)
  if (targets.length === 0) return

  for (const target of targets) {
    const frame = target.closest('.artboard')
    if (frame) {
      scrollToOffset(frame, target.offsetTop - 12)
    }

    target.classList.remove('is-focused')
    // Force a reflow so the animation restarts when the same section is focused twice.
    void target.offsetWidth
    target.classList.add('is-focused')
  }
}

/**
 * Keep the two artboards on the same row of the sample. Comparing light against dark only
 * works if you are comparing the same thing, and scrolling them independently is fiddly.
 */
function syncScrolling() {
  const frames = [...root.querySelectorAll('.artboard')]
  if (frames.length < 2) return

  let syncing = false
  for (const frame of frames) {
    frame.addEventListener('scroll', () => {
      if (syncing) return
      syncing = true
      for (const other of frames) if (other !== frame) other.scrollTop = frame.scrollTop
      requestAnimationFrame(() => { syncing = false })
    })
  }
}

window.addEventListener('message', (event) => {
  const message = event.data
  if (!message || typeof message !== 'object') return

  if (Array.isArray(message.hues) && message.hues.join() !== HUES.join()) {
    HUES = message.hues
    render()
  }

  // Before the scenario, so switching to "Your markup" and supplying it in the same message
  // draws once rather than flashing the empty state first.
  if (typeof message.markup === 'string') {
    const next = message.markup ? sanitise(message.markup) : ''
    if (next !== markup) {
      markup = next
      if (scenario === 'yours') render()
    }
  }

  if (message.scenario && message.scenario !== scenario && SCENARIOS[message.scenario]) {
    scenario = message.scenario
    render()
  }

  if (typeof message.vision === 'string' && message.vision !== vision) {
    vision = message.vision
    render()
  }

  if (typeof message.css === 'string') overrides.textContent = message.css

  if (message.compareScheme && message.compareScheme !== compareScheme) {
    compareScheme = message.compareScheme
    if (mode === 'compare') render()
  }

  if (message.scheme && message.scheme !== mode) {
    mode = message.scheme
    render()
  }

  if (message.focus) focusSection(message.focus)
})

render()
parent.postMessage({ ready: true }, '*')
