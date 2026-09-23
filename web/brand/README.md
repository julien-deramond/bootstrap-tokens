# Brand files

The Theme Builder's own look: the chrome around the preview, never the preview itself.

| File | Source |
| --- | --- |
| `tokens.css` | `dist/tokens.css` from [`@deramond.dev/tokens`](https://www.npmjs.com/package/@deramond.dev/tokens) 0.1.1 |
| `fonts/` | the font files from [`@deramond.dev/storybook`](https://www.npmjs.com/package/@deramond.dev/storybook) 0.1.0: Chakra Petch, Instrument Sans, Roboto Mono (SIL Open Font License 1.1) |
| `favicon.svg`, `favicon.ico`, `apple-touch-icon.png` | Julien Déramond's mark, all rights reserved; the same mark is inlined in `web/index.html` |

Copied rather than installed, so the app keeps no dependencies. Only `web/index.html` loads
`tokens.css`. The preview frame must not load it: it shares names such as `--font-size-*` and
`--breakpoint-*` with Bootstrap 6 and would overwrite them. The frame loads `fonts/fonts.css`
only, which declares fonts and nothing else.
