# Local deepmerge security patch

This private package vendors **deepmerge 4.3.1 `dist/cjs.js`**, from the npm
`deepmerge@4.3.1` distribution (https://github.com/TehShrike/deepmerge/tree/v4.3.1).
The bundled mergeable-object helper is retained. The original MIT license is in
`LICENSE`. This is a local fork, **not an upstream fixed release**.

## Why

[GHSA-gcqx-w48m-w2h4 / CVE-2026-93753](https://github.com/advisories/GHSA-gcqx-w48m-w2h4)
affects the returned object's prototype. Upstream has no patched npm release.
The build-only dependency arrives through Workbox → Rollup node-resolve.

Upstream's source-key guard does not cover cloning a target with an enumerable
own `__proto__` property, or merging a source into a null-prototype target.
Assignment to `destination[key]` can then invoke Object.prototype's inherited
`__proto__` setter, making attacker-supplied properties inherited by the result.

## Patch

All three destination assignments in `mergeObject` use `Object.defineProperty`
via `defineOwn`, creating ordinary enumerable/configurable/writable own data
properties without invoking inherited setters. The returned object's prototype
remains `Object.prototype`. The upstream source-key guard, recursive merging,
arrays, symbols, special values, options, and `merge.all` are unchanged. Other
than formatting, the only code changes are the helper and those three writes.

This is not a general-purpose untrusted-data sanitizer: own property names are
preserved when upstream allowed them, and custom merge callbacks/`clone: false`
retain their original semantics. Callers must not subsequently copy untrusted
keys with unsafe assignment.

## Wiring and verification

`frontend/package.json` declares a build-only `deepmerge` dependency at
`file:./vendor/deepmerge`, then overrides every transitive copy with `$deepmerge`.
The direct dependency ensures reproducible root-relative resolution with
`npm ci`. The private `4.3.1-patch.0` version and `x-security-patch` metadata
explicitly identify the local fork; they do not claim an upstream fix.
It has no install scripts or runtime dependencies.
Both `npm install` and `npm ci` use the checked-in source; there is no postinstall
patch and no audit suppression. **A clean npm audit does not audit this fork**;
its security evidence is the checked-in patch and regression tests.

`src/build-dependencies.test.ts` loads deepmerge through the actual installed
Rollup resolver and verifies the override identity, both prototype-poisoning
paths, recursive/array variants, and API compatibility. These tests run in the
normal unit suite. Release verification also builds Workbox's service worker and
runs offline/scoped-update browser tests.

## Maintenance

Remove the override and this directory when an upstream release fixes all three
writes (including target cloning). Retest the security regressions against that
release, then run unit tests, build-size checks, offline/scoped multi-tab browser
tests, and full npm audit. Do not merely change the package version or downgrade
to an old release to hide the advisory.
