# Security policy

YieldShield on Monad is an experimental **Monad testnet** application. It has
internal regression tests and transaction evidence, not an independent security
audit or approval for real-money use.

## Report a vulnerability privately

Email **david@yieldshield.ai** with the subject `YieldShield security report`.
GitHub private vulnerability reporting is enabled in this repository’s Security tab.
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

The imported standalone workflow is retained only as [historical test data](contracts/scripts-js/__tests__/fixtures/README.md). It is not an active GitHub workflow. Slither, Aderyn and storage-layout checks
are not currently release gates here. See [contract security notes](contracts/SECURITY.md)
for the original protocol's assumptions and optional local analysis commands.

Dependencies are assessed in [the dependency review](docs/DEPENDENCY_SECURITY.md).
Passing checks does not establish the absence of vulnerabilities. Scripted
transactions also do not replace a signed browser-wallet walkthrough.

## Repository protection

Dependabot alerts and security-update pull requests are enabled. Scheduled
dependency updates are configured at `.github/dependabot.yml`. GitHub secret
scanning, push protection and private vulnerability reporting are enabled.

`main` requires a pull request and passing release, Git-history secret-scan and
production-dependency checks from GitHub Actions. Branches must be up to date,
review conversations must be resolved, and force pushes and deletion are blocked.
Administrators can bypass these requirements when necessary, as explicitly
requested by the owner on 16 September 2026. Normal merges still require the
checks; a second person's approval is not mandatory.

See the [publication record](docs/PUBLICATION.md) for the settings verification,
Actions log/artifact review and the limits of automated credential scanning.
