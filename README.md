# Detronics Electronics Bench

**Live: https://detronics-apps.github.io/Bench-Calculator/**

Four calculators for the electronics bench, in one static page. No backend, no build step,
no dependencies, no network requests once the page has loaded.

| Tool | What it does |
|---|---|
| **Colour Code** | 3, 4, 5 and 6-band resistors. Click a band on the picture or type a resistance — both edit the same resistor. |
| **SMD Code** | 3-digit, 4-digit and EIA-96 markings, decoded and encoded, with auto-detection. |
| **LED Resistor** | Sizes the series resistor for one LED, a series string, or a parallel group wired per-branch or behind one shared resistor. Every LED is editable on its own, and the supply can be a plain voltage, a pack built from loose cells, or a named pack product with an expected runtime. |
| **Combinations** | Resistors, capacitors and inductors in series or parallel, plus a solver that searches E-series pairs for a target value. |

Every tool carries a **"How this works"** panel explaining the concepts in plain
language, giving the formula, and working that formula through with whatever
values are currently on screen.

Everything is snapped against a selectable E-series (E6 → E192, E24 by default),
and contextual banners appear live whenever a value crosses something worth
knowing about — a non-standard value, too little headroom across an LED
resistor, a resistor running past a quarter watt, current-hogging in a shared
parallel branch.

## Running it

It is plain files. Any static server will do:

```bash
python -m http.server 8080
```

Then open <http://localhost:8080>.

## Tests

The calculation core (`js/units.js`, `js/eseries.js`, `js/bands.js`,
`js/smd.js`, `js/led.js`, `js/combine.js`) is pure — no DOM, no globals — so it
runs directly under Node's built-in test runner with nothing to install:

```bash
npm test
```

That covers 80 cases, including a round-trip sweep asserting that every legal
band combination survives `valueToBands(bandsToValue(x))` unchanged.

## Deploying to GitHub Pages

Push to `main`, then **Settings → Pages → Deploy from a branch → `main` / `(root)`**.
`.nojekyll` is already present so that Jekyll leaves the files alone. There is
nothing to build, so every push republishes within about a minute.

Live at https://detronics-apps.github.io/Bench-Calculator/

## Layout of the code

```
index.html            the shell; everything else is built by JS
css/tokens.css        the Detronics palette as light/dark custom properties
css/layout.css        header, viewport, sidebar, footer
css/components.css    buttons, sections, banners, modals
css/print.css         the label sheet
js/units.js           engineering notation: 4k7, 100n, 0R47
js/eseries.js         IEC 60063 preferred values and nearest-value lookup
js/bands.js           IEC 60062 colour bands, both directions
js/smd.js             3-digit, 4-digit and EIA-96 markings
js/led.js             LED resistor solvers and their warnings
js/battery.js         cells, packs, named pack products, and runtime estimates
js/combine.js         series/parallel laws and the target pair search
js/state.js           one state object, localStorage, URL-hash sharing
js/main.js            chrome, tool routing, rendering
js/ui/explain.js      the teaching panel under each tool
js/ui/                DOM helpers, SVG renderers, sidebar, export, modals
js/ui/tools/          one controller per tool
tests/                node --test over the pure modules
```

The rule that keeps this workable: **everything under `js/` except `js/ui/` is
pure.** That is what makes the arithmetic testable without a browser.

## Privacy

Nothing you enter leaves your browser. No analytics, no cookies, no fonts or
scripts from other hosts. Settings and the bench list are kept in
`localStorage` on your own device; saving a project downloads a JSON file to
your own computer. Share links encode the current calculation into the URL
fragment, which browsers never transmit to a server.

## Accuracy

Colour bands follow IEC 60062, preferred values follow IEC 60063, and EIA-96
markings follow the EIA standard of that name. The LED forward voltages are
indicative figures for ordinary indicator LEDs and vary widely between parts —
they are an editable starting point, not an answer. Check the datasheet for the
part in your hand before you build anything that matters.

## Licence

MIT. See [LICENSE](LICENSE).
