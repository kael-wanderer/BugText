---
name: vendored-assets
description: Rebuild mdFlow's vendored offline assets — the tesseract.js OCR runtime under public/vendor/tesseract (including adding an OCR language) and the pinned Excalidraw board module under public/vendor/excalidraw. Use when adding an OCR language, bumping Excalidraw, or regenerating anything under public/vendor.
---

# Vendored assets

Both bundles are committed so the app works fully offline. Rebuild them deliberately,
never as a side effect of another change.

## Tesseract OCR (`public/vendor/tesseract`)

PDF OCR runs fully offline: the tesseract.js worker, simd-lstm core, and eng/vie
traineddata are vendored there. Data comes from the `@tesseract.js-data/*` dev deps.

Rebuild: `npm run vendor:tesseract`

To add an OCR language:

1. `npm i -D @tesseract.js-data/<lang>`
2. Add `<lang>` to `LANGUAGES` in `scripts/build-tesseract-vendor.mjs`
3. `npm run vendor:tesseract`
4. Commit the new `.traineddata.gz`

## Excalidraw (`public/vendor/excalidraw`)

Excalidraw 0.18.0 is pinned in a self-contained board-only module. React remains
isolated from the plain-TypeScript shell — keep it that way.

Rebuild: set `EXCALIDRAW_BUILD_ROOT` to an exact-tag Excalidraw tree whose package
dist has already been built, then `npm run vendor:excalidraw`.
