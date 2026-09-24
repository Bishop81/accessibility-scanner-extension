NOT A LOADABLE EXTENSION.

This folder holds ONLY the three files that DIFFER from the Chrome build:
  manifest.json    - gecko id, strict_min_version 115.0, shortened name, data_collection
  browser-shim.js  - aliases chrome -> browser so popup.js's awaits work on Firefox
  popup.html       - loads browser-shim.js before popup.js

It is a diff, kept separate so the Chrome build is never touched. popup.js, popup.css,
axe.min.js and icons/ are deliberately NOT duplicated here — one copy of each lives at the
repo root and is the single source of truth.

To TEST the Firefox build, load the unpacked copy of the actual submission artifact:
  ../dist/firefox-unpacked/          <- point about:debugging at the manifest.json in here

To REBUILD: copy the repo-root files plus these three into a clean dir and zip it.
