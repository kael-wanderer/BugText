---
name: vendored-assets
description: Rebuild BugText's vendored offline assets — the tesseract.js OCR runtime under public/vendor/tesseract (including adding an OCR language). Use when adding an OCR language or regenerating anything under public/vendor.
---

# Vendored assets

The bundle is committed so the app works fully offline. Rebuild it deliberately,
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
