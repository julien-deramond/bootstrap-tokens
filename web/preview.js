/**
 * The preview document. It renders real Bootstrap markup and listens for token overrides
 * from the chooser — no recompilation, because v6 drives everything through custom
 * properties, so re-declaring them re-themes the whole page.
 */

const THEMES = ['primary', 'accent', 'success', 'danger', 'warning', 'info', 'secondary', 'inverse']
const HUES = ['blue', 'indigo', 'violet', 'purple', 'pink', 'red', 'orange', 'amber', 'yellow', 'lime', 'green', 'teal', 'cyan', 'brown', 'gray', 'pewter']
const STOPS = ['025', '050', '100', '200', '300', '400', '500', '600', '700', '800', '900', '950', '975']

const section = (title, body) => `
  <section class="preview-section">
    <h2>${title}</h2>
    ${body}
  </section>`

const buttons = () => section(
  'Buttons',
  `<div class="cluster">
    ${THEMES.map((t) => `<button type="button" class="btn btn-solid theme-${t}">${t}</button>`).join('')}
  </div>
  <div class="cluster" style="margin-block-start:.5rem">
    ${['outline', 'subtle', 'text'].map((v) => `<button type="button" class="btn btn-${v} theme-primary">${v}</button>`).join('')}
    <button type="button" class="btn btn-solid btn-styled theme-primary">styled</button>
    <button type="button" class="btn btn-link">link</button>
    <button type="button" class="btn btn-solid theme-primary" disabled>disabled</button>
  </div>
  <div class="cluster" style="margin-block-start:.5rem">
    ${['xs', 'sm', '', 'lg'].map((s) => `<button type="button" class="btn btn-solid theme-secondary ${s ? `btn-${s}` : ''}">${s || 'base'}</button>`).join('')}
  </div>`
)

const alerts = () => section(
  'Alerts',
  ['primary', 'success', 'warning', 'danger'].map((t) => `
    <div class="alert theme-${t}" role="alert" style="margin-block-end:.5rem">
      <p class="m-0"><strong>${t}</strong> — a short message with a <a href="#" class="alert-link">link</a>.</p>
    </div>`).join('')
)

const cards = () => section(
  'Card, list group, progress',
  `<div class="d-flex flex-wrap gap-3 align-items-start">
    <section class="card" style="max-width:19rem">
      <div class="card-header">Featured</div>
      <div class="card-body">
        <h4 class="card-title">Card title</h4>
        <p class="card-text">Some quick example text to build on the card title.</p>
        <a href="#" class="btn btn-solid theme-primary">Go somewhere</a>
      </div>
    </section>
    <ul class="list-group" style="min-width:14rem">
      <li class="list-group-item active" aria-current="true">An active item</li>
      <li class="list-group-item">A second item</li>
      <li class="list-group-item">A third item</li>
      <li class="list-group-item disabled">A disabled item</li>
    </ul>
    <div style="min-width:14rem">
      <div class="progress" role="progressbar" aria-label="Example" aria-valuenow="65" aria-valuemin="0" aria-valuemax="100">
        <div class="progress-bar" style="width:65%"></div>
      </div>
      <div class="cluster" style="margin-block-start:.75rem">
        ${THEMES.slice(0, 5).map((t) => `<span class="badge theme-${t}">${t}</span>`).join('')}
      </div>
      <div class="cluster" style="margin-block-start:.5rem">
        <span class="badge badge-subtle theme-primary">subtle</span>
        <span class="badge badge-outline theme-primary">outline</span>
        <div class="spinner-border theme-primary" role="status"><span class="visually-hidden">Loading…</span></div>
      </div>
    </div>
  </div>`
)

const forms = () => section(
  'Forms',
  `<div class="d-flex flex-wrap gap-3">
    <div style="min-width:16rem">
      <label class="form-label" for="p-email">Email</label>
      <input type="email" class="form-control" id="p-email" placeholder="name@example.com" />
      <div class="form-text">We never share it.</div>
    </div>
    <div style="min-width:12rem">
      <label class="form-label" for="p-select">Select</label>
      <select class="form-select" id="p-select">
        <option>Choose…</option>
        <option>Another option</option>
      </select>
    </div>
    <div style="min-width:10rem">
      <div class="form-check">
        <input class="form-check-input" type="checkbox" id="p-check" checked />
        <label class="form-check-label" for="p-check">Checkbox</label>
      </div>
      <div class="form-check">
        <input class="form-check-input" type="radio" name="p-radio" id="p-radio" checked />
        <label class="form-check-label" for="p-radio">Radio</label>
      </div>
      <div class="form-check form-switch">
        <input class="form-check-input" type="checkbox" role="switch" id="p-switch" checked />
        <label class="form-check-label" for="p-switch">Switch</label>
      </div>
    </div>
  </div>`
)

const navigation = () => section(
  'Navigation',
  `<ul class="nav nav-tabs" style="margin-block-end:.75rem">
    <li class="nav-item"><a class="nav-link active" aria-current="page" href="#">Active</a></li>
    <li class="nav-item"><a class="nav-link" href="#">Link</a></li>
    <li class="nav-item"><a class="nav-link disabled" aria-disabled="true">Disabled</a></li>
  </ul>
  <ul class="nav nav-pills" style="margin-block-end:.75rem">
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
  'Typography and surfaces',
  `<h1>Heading one</h1>
  <h3>Heading three</h3>
  <p>Body copy with a <a href="#">link</a>, some <code>inline code</code>, <mark>a mark</mark> and <kbd>Ctrl</kbd> + <kbd>K</kbd>.</p>
  <blockquote class="blockquote"><p>A well-known quote, contained in a blockquote element.</p></blockquote>
  <div class="d-flex gap-2" style="margin-block-start:.75rem">
    ${['body', '1', '2', '3', '4'].map((n) => `
      <div style="flex:1;padding:.75rem;border-radius:var(--radius-5);background:var(--bg-${n});border:var(--border-width) solid var(--border-subtle)">
        <code>--bg-${n}</code>
      </div>`).join('')}
  </div>`
)

const table = () => section(
  'Table',
  `<table class="table">
    <thead><tr><th scope="col">#</th><th scope="col">Token</th><th scope="col">Value</th></tr></thead>
    <tbody>
      <tr><th scope="row">1</th><td><code>--primary-bg</code></td><td>var(--blue-500)</td></tr>
      <tr><th scope="row">2</th><td><code>--spacer-4</code></td><td>1rem</td></tr>
      <tr><th scope="row">3</th><td><code>--radius-8</code></td><td>1rem</td></tr>
    </tbody>
  </table>`
)

const palette = () => section(
  'Colour scale',
  HUES.map((hue) => `
    <div class="swatch-row">
      <span>${hue}</span>
      <div class="swatch-grid">
        ${STOPS.map((stop) => `<div style="background:var(--${hue}-${stop})" title="--${hue}-${stop}"></div>`).join('')}
      </div>
    </div>`).join('')
)

document.getElementById('preview-root').innerHTML = [
  buttons(),
  alerts(),
  cards(),
  forms(),
  navigation(),
  typography(),
  table(),
  palette()
].join('')

const overrides = document.getElementById('token-overrides')

window.addEventListener('message', (event) => {
  const message = event.data
  if (!message || typeof message !== 'object') return

  if (typeof message.css === 'string') overrides.textContent = message.css
  if (message.scheme) document.documentElement.setAttribute('data-bs-theme', message.scheme)
})

parent.postMessage({ ready: true }, '*')
