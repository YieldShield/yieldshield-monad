# Security policy

YieldShield on Monad is an experimental **Monad testnet** application. It has
internal regression tests and transaction evidence, not an independent security
audit or approval for real-money use.

## Report a vulnerability privately

Email **david@yieldshield.ai** with the subject `YieldShield security report`.
GitHub private vulnerability reporting may also be used when it is available.
Do not post exploit details, credentials or wallet keys in public issues.

Include the affected revision or deployed address, expected impact, and a minimal
reproduction. Use local tests or valueless testnet assets; do not test against
other users' wallets or funds. There is no promised bounty or response deadline.

## Supported scope

Reports should identify the current `main` revision and, for deployed behavior,
the chain and address from `config/deployment.json`. Scope includes:

- The active app in `apps/monad-web/` and API in `services/monad/`.
- Contracts, oracles and receipt NFTs used by the Monad deployment.
- Deployment, verification and signing scripts in `scripts/`.
- Dependencies or build configuration that affect these components.

Imported Base/Robinhood code and historical reviews are identified in
[the repository guide](docs/REPOSITORY_GUIDE.md). Reports about shared code remain
useful, but historical deployment claims do not describe the current Monad app.

## Checks and their limits

The root `.github/workflows/` directory defines the active checks. They run app
and API tests, build the frontend, run the Monad and imported immutable-module
contract regressions, scan Git history for secrets, and check production
dependency advisories. The scanner's narrow exceptions cover public contract
identifiers and a standard Anvil development key; they do not permit operational
credentials. The local signer files are ignored and must never be committed.

The imported `contracts/.github/` workflows are historical and are not active
GitHub workflows in this repository. Slither, Aderyn and storage-layout checks
are not currently release gates here. See [contract security notes](contracts/SECURITY.md)
for the original protocol's assumptions and optional local analysis commands.

Dependencies are assessed in [the dependency review](docs/DEPENDENCY_SECURITY.md).
Passing checks does not establish the absence of vulnerabilities. Scripted
transactions also do not replace a signed browser-wallet walkthrough.

## Repository protection

Dependabot alerts and security-update pull requests are enabled. Scheduled
dependency updates are configured at `.github/dependabot.yml`. Native GitHub
secret protection, private reporting and branch rules were unavailable through
the API for this private repository on its current plan during preparation.
The CI secret scanner and private email contact work independently of those
features. After the owner publishes the repository, enable available native
secret scanning/push protection, private reporting, and required passing checks
on `main`; verify the settings rather than assuming publication enables them.
