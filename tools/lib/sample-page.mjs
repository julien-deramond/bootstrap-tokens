/**
 * The realistic page both the preview and the scaffold draw.
 *
 * A row of buttons beside a row of alerts answers "do these components look right?" but not
 * "does my theme survive a page?" — which is the question anyone actually has. Spacing
 * against real prose, a navbar over content, cards in a grid: these are where a density or
 * radius choice succeeds or falls apart. So the Theme Builder's "A page" scenario is the
 * artboard people judge a theme against, and the project `bstokens init` writes should be
 * that same page, so what you download looks like what you designed against. A starter page
 * showing something else would read as a different product.
 *
 * So it lives here rather than in `web/preview.js`, and the markup uses nothing but
 * Bootstrap's own classes. That is the constraint that makes sharing work: the preview can
 * afford layout helpers of its own because `preview.html` defines them, and a generated
 * project cannot — it would have to carry a stylesheet of preview chrome for the page to
 * hold its shape. Rows, columns and spacing utilities cost nothing and are what a reader
 * would have written anyway.
 *
 * No Node built-ins here: the browser imports this file directly.
 */

/**
 * @param {string} uid Suffix for the `id`s, so several copies can share a document — the
 *   preview draws light and dark side by side, and duplicate `for`/`id` pairs would point
 *   every label at the first artboard's field.
 */
export const page = (uid) => `
  <nav class="navbar bg-1 fg-2 mb-3">
    <div class="container-fluid">
      <a class="navbar-brand" href="#">Northwind</a>
      <ul class="navbar-nav">
        <li class="nav-item"><a class="nav-link active" aria-current="page" href="#">Overview</a></li>
        <li class="nav-item"><a class="nav-link" href="#">Reports</a></li>
        <li class="nav-item"><a class="nav-link" href="#">Settings</a></li>
      </ul>
    </div>
  </nav>

  <section class="pt-2 pb-4">
    <h1 class="mb-2">Everything in one place</h1>
    <p class="fs-lg fw-light">A short paragraph of the kind of copy that actually ships, long enough that
      the line height and measure have somewhere to show themselves.</p>
    <div class="d-flex flex-wrap gap-2 align-items-center">
      <a href="#" class="btn btn-solid theme-primary btn-lg">Get started</a>
      <a href="#" class="btn btn-outline theme-primary btn-lg">Read the docs</a>
    </div>
  </section>

  <div class="row g-3">${[
    ['Revenue', '$48,200', 'success', '+12% on last month'],
    ['Open tickets', '37', 'warning', '6 breaching SLA'],
    ['Churn', '1.8%', 'danger', 'Up from 1.2%']
  ]
    .map(
      ([title, figure, theme, note]) => `
    <div class="col-12 sm:col-6 md:col-4">
      <section class="card h-100">
        <div class="card-body">
          <p class="card-text"><small style="color: var(--fg-3)">${title}</small></p>
          <h3 class="card-title">${figure}</h3>
          <span class="badge badge-subtle theme-${theme}">${note}</span>
        </div>
      </section>
    </div>`
    )
    .join('')}
  </div>

  <section class="card mt-3">
    <div class="card-header">Add a customer</div>
    <div class="card-body">
      <div class="row g-3">
        <div class="col-12 md:col-6">
          <label class="form-label" for="page-name-${uid}">Name</label>
          <input type="text" class="form-control" id="page-name-${uid}" value="Northwind Traders" />
        </div>
        <div class="col-12 md:col-6">
          <label class="form-label" for="page-plan-${uid}">Plan</label>
          <select class="form-select" id="page-plan-${uid}"><option>Growth</option></select>
        </div>
      </div>
      <div class="d-flex flex-wrap gap-2 align-items-center mt-3">
        <button type="button" class="btn btn-solid theme-primary">Save</button>
        <button type="button" class="btn btn-text">Cancel</button>
      </div>
    </div>
  </section>

  <table class="table mt-3">
    <thead><tr><th scope="col">Customer</th><th scope="col">Plan</th><th scope="col">Status</th></tr></thead>
    <tbody>
      <tr><td>Northwind Traders</td><td>Growth</td><td><span class="badge theme-success">Active</span></td></tr>
      <tr><td>Contoso</td><td>Starter</td><td><span class="badge theme-warning">Trial</span></td></tr>
      <tr><td>Fabrikam</td><td>Growth</td><td><span class="badge theme-secondary">Paused</span></td></tr>
    </tbody>
  </table>`
