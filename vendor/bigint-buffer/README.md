# JavaScript bigint-buffer compatibility package

This private, local compatibility package replaces the native Node binding in
`bigint-buffer` 1.1.5. It uses the upstream package's pure JavaScript browser
implementation for both Node and browser imports. No native bindings, install
scripts, or binary downloads are included.

The source API and types derive from
[no2chem/bigint-buffer v1.1.5](https://github.com/no2chem/bigint-buffer/tree/v1.1.5),
under the bundled Apache-2.0 license. The local version 1.1.6 identifies this
repository's private compatibility package, not a published upstream release.
The root manifest's file dependency and override keep Dynamic's transitive
consumers on this reviewed implementation.

Run `node vendor/bigint-buffer/test.js` and the dependency-gate regressions to
check conversion compatibility and buffers beyond the vulnerable native limit.
