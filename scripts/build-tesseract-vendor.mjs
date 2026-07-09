import path from "node:path";
import { copyFile, mkdir, rm } from "node:fs/promises";

// Copies the tesseract.js runtime and traineddata into public/vendor/tesseract
// so OCR works offline. Language data comes from @tesseract.js-data/* dev
// dependencies (4.0.0_best_int matches tesseract.js's lstm-only default).
//
// To add an OCR language:
//   1. npm i -D @tesseract.js-data/<lang>   (ISO 639-3 code, e.g. fra, deu, jpn)
//   2. add "<lang>" to LANGUAGES below
//   3. npm run vendor:tesseract, then commit public/vendor/tesseract/lang/
const LANGUAGES = ["eng", "vie"];

const output = path.resolve("public/vendor/tesseract");
const modules = path.resolve("node_modules");

await rm(output, { recursive: true, force: true });
await mkdir(path.join(output, "lang"), { recursive: true });

await copyFile(
  path.join(modules, "tesseract.js/dist/worker.min.js"),
  path.join(output, "worker.min.js"),
);
await copyFile(
  path.join(modules, "tesseract.js-core/tesseract-core-simd-lstm.wasm.js"),
  path.join(output, "tesseract-core-simd-lstm.wasm.js"),
);
for (const lang of LANGUAGES) {
  await copyFile(
    path.join(
      modules,
      `@tesseract.js-data/${lang}/4.0.0_best_int/${lang}.traineddata.gz`,
    ),
    path.join(output, "lang", `${lang}.traineddata.gz`),
  );
}
console.log(`Vendored tesseract runtime + [${LANGUAGES.join(", ")}] to ${output}`);
