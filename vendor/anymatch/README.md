# anymatch compatibility package

This private, local compatibility package replaces `anymatch` 3.1.3. Its
`picomatch` 2 dependency is affected by
[GHSA-fc5q-39xc-vjpf](https://github.com/advisories/GHSA-fc5q-39xc-vjpf), a
ReDoS through single-branch repeated extglobs, and no patched `picomatch`
release exists yet. The matching logic is unchanged. String globs are compiled
with `minimatch` 11, which the root overrides already keep on a patched
release, and the `normalize-path` helper is inlined.

The source and types derive from
[micromatch/anymatch 3.1.3](https://github.com/micromatch/anymatch/tree/3.1.3),
under the bundled ISC license. The local version 3.1.4 identifies this
repository's private compatibility package, not a published upstream release.
The root manifest's file dependency and override keep unstorage on this
reviewed implementation. Unstorage only uses anymatch in its Node `fs` driver.

Run `node vendor/anymatch/test.js` and the dependency-gate regressions to check
compatibility and the extglob timing regression. Remove this package once a
patched `picomatch` is published and `anymatch` or `unstorage` adopts it.
