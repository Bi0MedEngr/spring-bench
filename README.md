# Spring Bench

Helical spring design: compression, extension and torsion springs. Rate, curvature-corrected stresses, solid height by end type, closing-solid and fractional-overrun checks, buckling, surge frequency, Gerber/Goodman fatigue (Zimmerli data), extension-spring initial tension range and hook stresses, torsion-spring coil tightening and arbor clearance. A pass/fail checklist, a live drawing you can compress, stretch or twist (slider, or hover a chart), design helpers (coils for a target rate, free length for 15% overrun, snap to standard wire), and **Show the math**: every formula with your numbers. SI or US units.

- Live (installable on iPad: Safari → Share → Add to Home Screen): https://bi0medengr.github.io/spring-bench/ (once published)
- One self-contained HTML file, no network use.

## Import from McMaster-Carr
Type a part number, open it on mcmaster.com from the link, copy the whole page and paste it in. `mcmaster.js` reads the spec table (OD, ID, wire diameter, length, rate, loads, compressed/extended length, end type, steel grade), rejects what the round-wire model can't handle (rectangular-wire die springs, conical/barrel springs, alloys not in the strength table), and backs out the active coils from the catalog rate with the material's G, so the model's rate matches the catalog exactly. A "Catalog check" table compares McMaster's numbers with Spring Bench's (rate, length at max load, initial tension) and shows the safety factor at McMaster's rated maximum load. Torsion-spring pages don't carry wire size or leg lengths in their text, so those are entered from the 2-D drawing. Nothing is fetched automatically: the page can't reach mcmaster.com itself, and pasting works everywhere, including the offline iPad app.

## Method and limits
Shigley's *Mechanical Engineering Design* (Budynas & Nisbett), chapter 10: Sut = A/d^m (table 10-4), allowable fractions of Sut (tables 10-6, 10-7), end types (table 10-1), buckling constants (table 10-2), Bergsträsser factor, Zimmerli fatigue data for d < 10 mm. Strength constants are minimums; check against your wire supplier. Rates ignore direct shear and coil contact. Torsion-spring fatigue is not computed.

## Validation (`node tests/test_core.js`, 33 checks)
Rate against a strain-energy derivation; Bergsträsser and Wahl factors; music wire Sut against the inch-unit constants (0.2%); solid height for all four end types; buckling constant 2.63 for steel; Gerber point on the curve and the load line; surge frequency against the wave-equation form; extension Na, L0, hook factor, initial-tension band; torsion rate, active coils and coil tightening; helper inversions; every example solves.

## Files
`core.js` solver · `mcmaster.js` catalog import (`node tests/test_mcmaster.js`) · `explain.js` units and the math · `presets.js` examples · `app.js` UI · `page.html` layout · `build.sh` → `spring-bench.html` (artifact) and `docs/` (GitHub Pages web app) · `tests/` · `web/` · `fonts/` (IBM Plex, OFL).
