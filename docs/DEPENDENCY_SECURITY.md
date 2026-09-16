# Dependency security review

Reviewed **16 September 2026**. Scope: the root npm workspaces, the deployed Monad browser app, and the independently installed Railway API in `services/monad`. This is a dependency review, not an independent security audit.

## Changes

- Updated both Dynamic SDK entry packages from **5.8.0 to 5.8.1**, keeping their internal packages aligned.
- Patched the SDK's pinned Axios **1.16.0 → 1.20.0**, Sharp **0.35.0 → 0.35.4**, and affected UUID **8/9/11 → 11.1.1** installations through version-scoped root overrides. Existing UUID 14 installations are unchanged.
- Retained unrelated package versions. The overrides can be removed when upstream dependency constraints resolve to patched releases without them.

The two Dynamic entry packages are pinned both at the root and in the app workspace. This ensures npm propagates the root overrides through a direct dependency path; during this review, workspace-only paths silently ignored them, matching [npm issue #9659](https://github.com/npm/cli/issues/9659). `npm ls axios sharp uuid --all` must show the patched entries as overridden, without invalid dependency errors. Keep those root pins aligned with the app until npm fixes this behavior.

Axios 1.20.0 includes request-option hardening ([release notes](https://github.com/axios/axios/releases/tag/v1.20.0)). Sharp 0.35.4 fixes the affected libheif binaries ([advisory](https://github.com/advisories/GHSA-rgj7-g3m4-5g8c)). UUID 11.1.1 contains the buffer-bounds fix and retains CommonJS support needed by current consumers ([advisory](https://github.com/advisories/GHSA-w5hq-g745-h8pq)). The inspected MetaMask, Dynamic and Jayson consumers use UUID's named `v4()` API; the upgraded MetaMask/Jayson UUID calls and Jayson browser JSON-RPC round trip were exercised successfully.

## Remaining findings and runtime exposure

`npm audit --omit=dev` decreased from **29 affected package entries (16 high, 13 moderate)** to **9 (7 high, 2 moderate)**. These are inherited package findings from **two underlying advisories**, not nine separate vulnerabilities. The API's separate production dependency audit reports **zero findings**.

| Advisory | Installed package | Why it remains; verified exposure |
| --- | --- | --- |
| [GHSA-3gc7-fjrx-p6mg](https://github.com/advisories/GHSA-3gc7-fjrx-p6mg), high | `bigint-buffer` 1.1.5 | The upstream native Node binding has no patched published version. Dynamic's transitive Solana packages retain it. The Monad application is a static browser build; Vite resolves this package to its pure JavaScript `dist/browser.js` implementation. The native implementation is absent from the emitted browser modules. The API does not install it. |
| [GHSA-528h-pc64-c93x](https://github.com/advisories/GHSA-528h-pc64-c93x), moderate | `stream-json` 1.9.1 | Jayson 4.3.0 pins the 1.x parser API. The patched 3.x line is a major upgrade and is not forced into that dependency. The browser build includes Jayson's browser client, without `stream-json` or Jayson's server/parser utility modules. The API does not install them. |

These are **conditional, temporary exceptions**, not a claim that the installed packages are fixed. They apply only to this browser build and expire **16 October 2026**. Do not reuse them for Node, server rendering, the historical applications, or a new service. Adding server-side wallet processing requires a fresh review before deployment. No Solidity, oracle or transaction behavior is exempted by this review.

## Automated gate

After `npm ci`, run:

```sh
node --test scripts/check-dependency-audit.test.mjs
node scripts/check-dependency-audit.mjs
```

The gate queries npm for the root and API production dependencies, then builds the Monad frontend without writing deployment output. It verifies the emitted module graph, including the lazy-loaded Dynamic wallet. It fails on:

- Any unreviewed advisory, critical finding, changed exception version or dependency path, changed inherited dependency version/path, or expired exception.
- Incomplete or failed npm audit responses.
- Native `bigint-buffer`, `stream-json`, or Jayson's server/parser utility modules entering the browser output.
- A browser build that omits the Dynamic wallet entry, or any dependency finding in the API.

The check does not suppress npm's original report or downgrade its severities. Review new Dependabot alerts alongside this gate. To clear an exception, upgrade upstream dependencies, rerun the gate and browser wallet walkthrough, and remove the obsolete exception and this document's corresponding entry.

## Validation

- Clean Node 24 dependency installation from the committed lockfile.
- 78 frontend tests and the TypeScript/Vite production build passed.
- 72 API/deployment tests and five dependency-gate regression tests passed.
- Browser-module verification passed over 5,544 emitted modules, with no native `bigint-buffer` or `stream-json` implementation.
- API production dependency audit: zero findings.
- A completed signed-in Dynamic browser transaction is a separate release check; a dependency build/test pass does not establish it.
