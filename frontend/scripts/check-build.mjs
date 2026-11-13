import { readdir, readFile } from "node:fs/promises";
import { gzipSync } from "node:zlib";

// Aggregate compressed transfer budgets, not machine-dependent timing gates.
const assets = new URL("../dist/assets/", import.meta.url);
const totals = { js: 0, css: 0 };
for (const file of await readdir(assets)) {
  const kind = file.split(".").at(-1);
  if (kind in totals)
    totals[kind] += gzipSync(await readFile(new URL(file, assets))).length;
}
for (const [kind, budget] of Object.entries({
  js: 150 * 1024,
  css: 16 * 1024,
})) {
  if (!totals[kind] || totals[kind] > budget) {
    throw new Error(
      `${kind}: ${totals[kind]} gzip bytes; expected 1–${budget}`,
    );
  }
  console.log(`${kind}: ${totals[kind]} / ${budget} gzip bytes`);
}
