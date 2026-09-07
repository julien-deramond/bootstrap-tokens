# Bootstrap Theme Builder

A local web app for designing a Bootstrap 6 theme by editing its tokens, with real Bootstrap
components re-theming beside you.

```bash
npm run vendor   # compile upstream Bootstrap into web/vendor/bootstrap.css (once)
npm run web      # http://localhost:4000
```

There is no Sass in the browser and no compile step in the loop: v6 drives everything through
CSS custom properties, so re-declaring them is the whole mechanism.

The page imports the same modules the CLI does, so the export is produced by the pipeline
`bstokens verify` checks — not by a second implementation that could drift.

## Two modes over one model

**Design** (the default) is eight controls that each move a lot of the system — brand and
accent colour, corner radius, density, border weight, typeface, text size, shadow depth —
plus four presets to start from. Most themes are a few of these and nothing else.

**All tokens** is the browser: all 1206 tokens, grouped, searchable, with a light and a dark
field each.

They are two *views*, not two models. Every control writes ordinary token overrides into the
same state the browser edits, so switching is lossless and the export comes from one source
of truth. A control reads its position back out of those overrides and says **Custom** when
the tokens hold something it cannot represent, rather than snapping your work back to a
preset.

## How it behaves

* **Options look like what they do.** Corner radius is five rounded shapes, density is
  spacing diagrams, typefaces are set in themselves, shadow depths cast their own shadow. A
  row of words would make you click, look elsewhere, and infer.
* **Light and dark, side by side.** `light-dark()` means a v6 theme is always two themes, so
  comparing them should not require flipping a switch. Side by side is the default on a wide
  screen. Each scheme renders as a framed, labelled artboard on a neutral canvas that belongs
  to neither theme — otherwise, in a dark chooser, the dark preview reads as one more panel of
  the tool.
* **Every component that has tokens is in the gallery.** Including the ones you cannot
  normally see standing still: menus, tooltips, popovers, dialogs and drawers sit in specimen
  boxes that contain their positioning and change nothing a theme sets, so their colours,
  radii and shadows are all the theme's.
* **Four things to preview.** *Components* is the gallery, *Page* is a realistic layout —
  navbar, hero, cards, form, table — *States* is every state a theme can break in (disabled,
  invalid, focused, loading, empty, selected), and *Your markup* is a chunk of your own HTML
  pasted in, so you can answer "does this survive *my* page?" rather than "do Bootstrap's
  components look right?".
* **Touching a control shows you what it changed.** The preview scrolls to the affected
  section and flashes it, so you never have to hunt for the difference.
* **Undo, always.** ⌘Z / ⇧⌘Z, and Reset is just another undoable step — no confirmation
  dialog guarding a reversible action.
* **Surprise me generates a coherent theme, not a random one** — a brand hue, an accent that
  relates to it, one shape idea applied throughout, then any contrast the combination broke
  is repaired automatically.
* **Every change is listed and revertible.** The change counter opens the full diff — tokens
  and build options together, previous value beside new, one Revert per row. *Before / after*
  shows the same page rendered stock beside themed.
* **When Bootstrap is the broken one, it says so.** Seven of upstream's own values do not
  work — four `color-mix()` weights in `.navbar-dark`, three tokens reading properties nothing
  declares — and editing any of them changes nothing, in the preview or in your project. Each
  carries a note saying exactly that. Two token maps Bootstrap defines and never uses say
  something stronger, because "it still exports" would be true and useless there. See
  [`BACKLOG.md`](./BACKLOG.md).
* **A theme that has aged is repaired, or named.** Bootstrap 6 is an alpha and token names
  move. A saved theme follows recorded renames, and anything still unplaceable is said out
  loud rather than dropped — losing a value silently is the worst thing a theme file can do,
  because nothing tells you to look. The CLI refuses to run on such a theme unless you pass
  `--skip-unknown`.
* **Themes are things you keep.** Name them, hold several, duplicate one to try a variation.
  *Copy share link* packs the whole theme into the URL fragment — 571 characters for a
  22-token theme, compressed in the browser, uploaded nowhere.
* **A theme-level contrast readout**, which separates issues you introduced from ones
  Bootstrap's defaults already have — by comparing the *colours*, not the verdicts. A warning
  you didn't cause teaches you to ignore warnings. The *contrast report* tab hands you the
  same audit as a file to attach to a pull request, WCAG 2 and APCA side by side.
* **See it through someone else's eyes.** The *Vision* selector draws the artboards through
  simulated protanopia, deuteranopia, tritanopia or achromatopsia — the tool's own chrome
  stays as it is, since the point is to look at the artefact. The report turns it into a
  check: contrast survives colour blindness almost unchanged, so a palette can pass every
  ratio and still make success and danger the same button.

## Two decisions inside Design mode

* **Changing the brand colour repoints the role, it doesn't recolour a scale.** Bootstrap
  builds `primary` out of the blue scale, so picking green rewrites all nine sub-keys to
  `{color.green.*}` — which is exactly what a handwritten `$theme-colors` override looks like.
  The custom colour picker is the other path, and it says plainly that it redefines that
  scale and so also recolours `--blue-*` elsewhere.
* **`contrast` is chosen, not substituted.** That sub-key is the text placed *on* the fill.
  Substituting it would give white-on-yellow; Design mode measures the contrast and picks
  white or `gray-900`, then shows the resulting ratios and warns when a choice fails WCAG AA.

## Other things worth knowing

* **Editing a hue moves everything downstream.** `color.blue.base` regenerates 13 scale
  steps, which move `theme-color.primary.*`, which move every component that uses them.
* **Swatches are resolved by the browser, inside the preview.** A value like
  `color-mix(in oklch, var(--blue-500) 50%, var(--bg-body))` or a `light-dark()` pair shows
  its real colour in both schemes, because the page asks the previewed document rather than
  reimplementing CSS colour maths.
* **Colour conversion is gamut-mapped, not clamped.** Bootstrap authors hues outside sRGB
  (`oklch(60% 0.24 240)` is), and clamping each channel independently moves them sideways in
  hue — that blue came back 14° towards violet. Chroma is reduced instead, so lightness and
  hue survive, which also made the contrast readings accurate.
* **Every contrast failure carries its fix.** Not just "fails AA" but "use `yellow.800`",
  one click, preferring a darker step of the same hue so the design intent survives.
* **Contrast is checked where it matters.** Each theme role's `contrast` is scored against
  its own fill, and its `fg` against the page, per scheme — by WCAG 2 and by APCA, because
  they disagree and the disagreement is the useful part. Upstream's stock `primary` already
  sits at 3.9:1 for white on `blue-500` — worth knowing before you re-tint it.
* **An export carries only the keys you changed.** `defaults()` merges key by key, so
  editing one shadow gives you a three-line `$root-tokens`, not all 67 entries. Nested maps
  merge one level deep, so a changed sub-key carries its whole role — but only that role.
* **A field takes any CSS.** A literal (`1.25rem`), a token reference (`{radius.9}`), or a
  raw custom property (`var(--radius-9)`) all work; references keep the link, literals break
  it.

## Where a theme goes next

The tool saves a `theme.json`. Every CLI command that takes `--theme` reads that file — see
[`cli.md`](./cli.md):

```bash
npx bstokens init my-theme --theme theme.json    # scaffold a project that compiles it
npx bstokens verify --theme theme.json           # check it compiles to what you saw
npx bstokens report --theme theme.json           # contrast and colour-vision audit
npx bstokens eject --theme theme.json --src ../bootstrap --in-place   # maintainers
```
