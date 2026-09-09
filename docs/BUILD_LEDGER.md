# Monad build ledger

Each implementation stage is committed separately. The import is prior work, not a new Metropolis contribution.

1. **Attributed foundation** — imported tracked source from YieldShield Base, preserving third-party notices and pinned submodules. Baseline commit `b44fba0`.
2. **Monad configuration** — independent chain registry, Foundry 1.8.1 / Monad execution, plan and build ledger.
3. **Contracts and tests** — strict Pyth reference feed, shMON redemption-NAV adapter, native MON wrapper, separate scenario assets and oracle, test vault, immutable module deployment.
4. **Deployment tooling** — resumable Monad-only deployment, receipt/runtime verification, manifests and smoke evidence.
5. **Read-only API** — verified snapshots, price provenance, action availability and bounded public endpoints.
6. **Monad application** — crypto-only routes, wallet preflight, complete senior/junior lifecycle, wrapping/staking/vault flows, status and scenario explanation.
7. **Release** — Vercel frontend, Railway API, custom domains, signed-out verification.
8. **Submission evidence** — new-work attribution, setup, deployment hashes, demo and remaining submission requirements.

## Publication

The repository is private during implementation. Public visibility requires explicit approval after automated review rejected public disclosure of the imported source. Public source is a Metropolis submission prerequisite.

## Tool disclosure

Implementation uses OpenAI Codex for code, tests, documentation, debugging and deployment. Original upstream code and dependency authors retain attribution. No interviews, user testing or external endorsements will be claimed unless performed.
