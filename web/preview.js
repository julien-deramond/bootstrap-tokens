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
const HUES = ['blue', 'indigo', 'violet', 'purple', 'pink', 'red', 'orange', 'amber', 'yellow', 'lime', 'green', 'teal', 'cyan', 'brown', 'gray', 'pewter']
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
      <div class="form-check">
        <input class="form-check-input" type="checkbox" id="check-${uid}" checked />
        <label class="form-check-label" for="check-${uid}">Checkbox</label>
      </div>
      <div class="form-check">
        <input class="form-check-input" type="radio" name="radio-${uid}" id="radio-${uid}" checked />
        <label class="form-check-label" for="radio-${uid}">Radio</label>
      </div>
      <div class="form-check form-switch">
        <input class="form-check-input" type="checkbox" role="switch" id="switch-${uid}" checked />
        <label class="form-check-label" for="switch-${uid}">Switch</label>
      </div>
    </div>
  </div>`
)

const navigation = () => section(
  'navigation',
  'Navigation',
  `<ul class="nav nav-tabs mb">
    <li class="nav-item"><a class="nav-link active" aria-current="page" href="#">Active</a></li>
    <li class="nav-item"><a class="nav-link" href="#">Link</a></li>
    <li class="nav-item"><a class="nav-link disabled" aria-disabled="true">Disabled</a></li>
  </ul>
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

const sample = (uid) => [
  buttons(),
  forms(uid),
  alerts(),
  surfaces(uid),
  elevation(),
  navigation(),
  typography(),
  palette()
].join('')

/* -------------------------------------------------------------------------- */

const root = document.getElementById('preview-root')
const overrides = document.getElementById('token-overrides')

let mode = 'light'

/** One framed, labelled artboard for a colour scheme. */
const board = (scheme) => `
  <figure class="board board-${scheme}">
    <figcaption class="board-label"><span class="board-swatch"></span>${scheme}</figcaption>
    <div class="artboard">
      <div class="pane" data-bs-theme="${scheme}">${sample(scheme)}</div>
    </div>
  </figure>`

function render() {
  const schemes = mode === 'split' ? ['light', 'dark'] : [mode]
  root.className = mode === 'split' ? 'preview-split' : 'preview-single'
  root.innerHTML = schemes.map(board).join('')
}

const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)')

/**
 * Scroll the document ourselves rather than leaning on `scroll-behavior: smooth` or
 * `scrollIntoView({ behavior: 'smooth' })`: both are silently ignored in some embedded
 * frames, and a control that appears to do nothing is worse than one that jumps.
 */
function scrollToOffset(top) {
  const max = document.documentElement.scrollHeight - document.documentElement.clientHeight
  const target = Math.max(0, Math.min(top, max))

  if (reducedMotion.matches) {
    window.scrollTo({ top: target, behavior: 'instant' })
    return
  }

  const from = window.scrollY
  const distance = target - from
  if (Math.abs(distance) < 2) return

  const duration = Math.min(420, 120 + Math.abs(distance) * 0.35)
  const start = performance.now()

  const step = (now) => {
    const progress = Math.min(1, (now - start) / duration)
    // easeOutCubic: quick to move, gentle to land.
    const eased = 1 - (1 - progress) ** 3
    window.scrollTo({ top: from + distance * eased, behavior: 'instant' })
    if (progress < 1) requestAnimationFrame(step)
  }

  requestAnimationFrame(step)
}

/** Bring a section into view and flash it, so a control and its result are connected. */
function focusSection(id) {
  const targets = root.querySelectorAll(`[data-section="${id}"]`)
  if (targets.length === 0) return

  // Leave room for the sticky pane label in split view.
  const offset = mode === 'split' ? 44 : 12
  scrollToOffset(targets[0].getBoundingClientRect().top + window.scrollY - offset)

  for (const target of targets) {
    target.classList.remove('is-focused')
    // Force a reflow so the animation restarts when the same section is focused twice.
    void target.offsetWidth
    target.classList.add('is-focused')
  }
}

window.addEventListener('message', (event) => {
  const message = event.data
  if (!message || typeof message !== 'object') return

  if (typeof message.css === 'string') overrides.textContent = message.css

  if (message.scheme && message.scheme !== mode) {
    mode = message.scheme
    render()
  }

  if (message.focus) focusSection(message.focus)
})

render()
parent.postMessage({ ready: true }, '*')
