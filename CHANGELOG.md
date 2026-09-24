# Changelog

All notable changes to the Detronics Electronics Bench.
This project follows [Semantic Versioning](https://semver.org/).

## [1.5.1] - 2026-09-25

### Changed
- The coffee and theme buttons now match the rest of the family: both are 32px
  discs, and the coffee cup is a line drawing in `currentColor` rather than an
  emoji. An emoji cup carries its own browns and reds, which belong to no theme
  this app has; a drawing inherits whatever the button is already using.
- The theme cycle reads **auto / light / dark** and its title says to set it
  explicitly before screen-recording - a capture made on "auto" looks different
  on someone else's machine.
- `system` now removes `data-theme` instead of setting a third value, which is
  what lets the `prefers-color-scheme` block take over.
- The mode bar matches the shared spec: 12px chips, and below 640px the chips
  grow to fill the row with the hint on its own line.

### Fixed
- The sun and moon glyphs carry a trailing `U+FE0E`, asking for text
  presentation. Without it some platforms render them as colour emoji, which
  ignores the button's colour and looks wrong in one theme or the other.

## [1.5.0] - 2026-09-22

### Added
- A **"How to use" tab**, the last tab. One search box over step-by-step how-tos
  and FAQs, with an alias map so everyday wording finds the right page -
  "how long will a battery last" reaches the runtime how-to. Filler words are
  dropped from the query so AND-matching narrows without choking on grammar.
- **Simple / Advanced / Expert** above the tabs. A display filter only: nothing
  it hides changes a calculation. Simple shows 3 and 4-band codes and hides
  Preferences and the bench list; Advanced shows everything; Expert adds the
  "How this works" panel.
- The logo links to **detronics.co.za**, and a **Buy me a coffee** button sits
  beside the theme toggle.
- An **"I am new here"** button in the footer, so the quick start is reachable
  on every screen rather than only on a first visit.

### Changed
- The quick start no longer repeats the changelog - release notes belong behind
  **What's new** - and it now offers to open the full guide.
- Battery and pack specifications render as a single quiet panel instead of
  rows that carried a border and read as clickable. The panel is Advanced and
  above; Simple states the output voltage in a sentence; the full product
  write-up and architecture diagram are Expert only.

### Fixed
- Wrapping the logo in a link broke the mobile header: the anchor became the
  flex item and did not carry the shrink rules, so the action buttons sat back
  on top of the wordmark.

## [1.4.1] - 2026-08-27

### Fixed
- Diagrams were stretched to fill the panel, so a canvas sized to a small
  circuit got magnified several times over on a wide screen - a single resistor
  was drawn at 3.5x. Every drawing is now capped at its natural size, one
  drawing unit to one pixel, so a six-branch circuit and a lone resistor are
  drawn at the same scale. Narrow screens still shrink to fit, so phones are
  unaffected.
- The tool tabs and the diagram were squashed flat in a short browser window,
  because flex items shrink by default and the column was compressing rather
  than scrolling. Nothing in the viewport may shrink now; the panel scrolls.

## [1.4.0] - 2026-08-27

### Added
- A **"How this works"** panel under every tool. It explains what the component
  is and why the tool exists in plain language, gives the formula, then works
  that formula through using the values currently on screen - so the arithmetic
  can be checked by hand. Aimed at someone meeting this for the first time.

### Changed
- Renamed from "Bench Calculator" to **Electronics Bench**, since it is becoming
  a suite rather than one calculator.
- Circuit diagrams size their canvas to the circuit and centre it, rather than
  drawing into a fixed 760-wide box. A single LED now renders in 380 units
  instead of 760, so it appears at twice the size.

### Fixed
- Info tooltips were clipped by the sidebar's scroll container, so long ones were
  cut off mid-sentence. The bubble now lives on `<body>` and is positioned in
  viewport coordinates, which nothing can clip.
- On phones the Save and Load buttons overlapped the logo. Header labels now
  shorten below 700px and the logo yields space first.
- The supply label ran past the left edge of the canvas and was cut off in
  exported PNGs. The pack name has moved to the caption, where there is room.

## [1.3.0] - 2026-08-26

### Changed
- Renamed from "Resistor Calculator" to **Bench Calculator**. It covers resistor
  codes, SMD markings, LED circuits, batteries and passive networks, and the old
  name had stopped describing it.
- The battery supply mode split into two: **Cells** (build a pack from loose
  cells) and **Pack product** (a complete pack with its own outputs). Sessions
  saved as `battery` migrate to `cells`.

### Added
- The **LG INR18650-HG2** as a cell in its own right, at its specified 3.60 V
  nominal, 2.5 V cut-off, 4.2 V full charge and 3000 mAh - 10.8 Wh per cell.
  The previous generic 18650 entry stays, now labelled as generic.
- **MagBot 2S PowerPack**: 2S1P HG2, 7.2 V nominal, 8.4 V charged, 3000 mAh,
  21.6 Wh stored and 20.52 Wh usable at the estimated 95% path efficiency,
  with the HX-2S-JH20's 10 A limit capping the pack current below what the
  cells alone could pass.
- **MagBot 1S PowerHub**: 1S HG2 with three selectable outputs - raw cell at
  99%, regulated 5 V at 88%, and regulated 3.3 V at 82% because it sits
  downstream of the boost.
- Runtime on a **regulated** rail is a single figure worked out in watt-hours,
  because a regulator holds its load current instead of tapering as the cell
  sags. Unregulated rails keep the tapering range. The results panel shows the
  power actually drawn from the cell, which is more than the load takes.

## [1.2.0] - 2026-08-26

### Added
- Every LED in a series string or parallel group is individually editable -
  its own colour and forward voltage. An "all the same" toggle keeps the panel
  compact for the common case where they match.
- Parallel groups with mismatched LEDs now size a resistor per branch rather
  than reporting one value times N, and the result shows a per-LED table.
- A shared resistor behind mismatched LEDs is now an error rather than a
  warning: the lowest-Vf LED clamps the node and takes essentially all the
  current, so the per-LED figures would be fiction.
- Battery packs as a supply: AA/AAA alkaline, AA/AAA NiMH, 9 V PP3, 18650,
  1S LiPo and CR2032/CR2025 coin cells, built up in series and parallel, with
  an editable per-cell capacity.
- Expected runtime, given as a range - the short figure assumes the draw never
  drops, the long one assumes it falls steadily as the pack sags.
- Warnings when the circuit draws more current than the cells can deliver, and
  when the LEDs go dark before the pack reaches its flat point.

### Changed
- Forward current per LED moved from the Supply section to the LED section.
- Sessions and share links saved before this release are migrated on load.

## [1.1.0] - 2026-08-26

### Added
- Inductors as a third component kind in the Combinations tool, with a coil
  symbol, henry parsing (`10uH`, `4m7`, `2.2 mH`) and a note that the series
  and parallel laws assume the coils share no flux.

### Fixed
- Parallel LED circuits are drawn as vertical branches between two rails
  rather than a diagonal staircase, with the resistor and LED in each branch
  drawn the way the current runs through them.
- LED emission arrowheads were malformed - the apex sat short of the shaft tip
  with both barbs on the wrong side, so the arrows appeared to point into the
  device instead of away from it.
- The Combinations network had a gap in the wire before the first component,
  and stranded a short chain behind long dead leads in a fixed-width canvas.
  The canvas now sizes itself to the network.

## [1.0.0] - 2026-08-26

First release.

### Added
- **Colour Code tool** for 3, 4, 5 and 6-band resistors. One resistor, two edit
  affordances: click a band on the picture, or type a resistance in the
  sidebar. Both write the same state, so the picture and the number cannot
  disagree.
- **SMD Code tool** covering 3-digit, 4-digit and EIA-96 markings in both
  directions, with marking-system auto-detection and a recovery action when the
  forced system rejects a code another one accepts.
- **LED Resistor tool** for a single LED, a series string, or a parallel group
  wired either per-branch or behind one shared resistor. Forward voltage is
  filled in from the LED colour and stays editable.
- **Combinations tool** for resistors and capacitors in series or parallel, with
  worst-case tolerance bounds and a solver that searches E-series pairs for the
  closest match to a target value.
- Selectable preferred-value series (E6 through E192, E24 by default) shared
  across every tool.
- Contextual warning banners that appear live rather than at export time:
  non-standard values, insufficient headroom, resistors past a quarter watt,
  current-hogging in shared parallel branches, and current pulled off target by
  E-series snapping.
- Export as PNG or SVG, a compact shareable link, and a printable label sheet
  built from the bench list.
- Save and load the whole session as a JSON project file.
- Light, dark and system themes built from the Detronics palette.
- First-visit welcome modal with a quick start, plus licence and
  imprint/privacy modals.

[1.4.1]: https://github.com/detronics-apps/Bench-Calculator/releases/tag/v1.4.1
[1.4.0]: https://github.com/detronics-apps/Bench-Calculator/releases/tag/v1.4.0
[1.3.0]: https://github.com/detronics-apps/Bench-Calculator/releases/tag/v1.3.0
[1.2.0]: https://github.com/detronics-apps/Bench-Calculator/releases/tag/v1.2.0
[1.1.0]: https://github.com/detronics-apps/Bench-Calculator/releases/tag/v1.1.0
[1.0.0]: https://github.com/detronics-apps/Bench-Calculator/releases/tag/v1.0.0
