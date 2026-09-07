# Vendored assets

Files here come from `twbs/bootstrap` and are not authored in this repository.

| File | Source | Regenerate with |
| --- | --- | --- |
| `bootstrap.css` | Compiled from a v6-dev checkout | `bstokens vendor --src <checkout>` |
| `bootstrap-logo.svg` | `site/static/docs/[version]/assets/brand/bootstrap-logo.svg` | copied by hand; it does not change with the token document |
| `bootstrap-logo-shadow.png` | `getbootstrap.com/docs/5.3/assets/brand/bootstrap-logo-shadow.png` — the asset `twbs/bootstrap` uses in its own README | copied by hand; used in this repository's README header |

Both logo files are Bootstrap's own mark, used unmodified to indicate that this tool is
built for Bootstrap — not to claim it is an official Bootstrap project. Bootstrap's code is
MIT-licensed; its name and logo are trademarks of its authors, used here under nominative
fair use. They are copied rather than hot-linked so the pages that use them do not depend on
`getbootstrap.com` staying put.
