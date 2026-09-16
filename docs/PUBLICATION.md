# Public source release — 16 September 2026

The owner explicitly authorized publication of [YieldShield/yieldshield-monad](https://github.com/YieldShield/yieldshield-monad) on 16 September 2026, superseding the earlier instruction to keep it private. GitHub reports the repository as public. Anonymous repository and raw-source requests both returned HTTP 200.

The published code was `0be4f96adff296fa4dc27aa0a39957d4775fe166`, which exactly matches the source tree that passed PR #18’s release and security checks. This publication change updates documentation and repository settings; it does not deploy contracts or change protocol behavior.

## Credential review

- A fresh Gitleaks scan covered all 151 locally fetched Git commits with no findings under the reviewed repository configuration.
- Reviewed all 142 retained Actions log archives, all 53 retained build artifacts, 23 issue/PR records and three issue comments available at the review snapshot. No review comments existed. All requested archives downloaded successfully.
- The additional surface scan examined approximately 550.57 MB and produced 101 generic-key matches. All were classified: 56 were Actions cache identifiers (`verify-` followed by a commit SHA); 45 were the same public browser analytics identifier shipped in `@base-org/account` 1.1.1 through Dynamic. The artifact value was compared with the installed published package. No YieldShield operational credentials were identified.
- Raw downloaded logs, artifacts and scanner reports were kept outside the repository. No historical runs or artifacts were deleted, and no Git history was rewritten.

These checks do not prove that every possible secret or confidential detail is absent. Original company contact information, internal reviews, attribution and historical source remain intentionally available. Known public identifiers and the standard unfunded Anvil development key retain narrow scanner exceptions.

## Enabled protections

- GitHub secret scanning and push protection.
- Private vulnerability reporting, plus the existing private email contact.
- Dependabot alerts/security updates and scheduled dependency updates.
- `main` requires a pull request and passing `verify`, `Git history secret scan` and `Production dependency review` checks from the GitHub Actions app. The branch must be up to date and review conversations resolved.
- Administrators follow the same requirements. Force pushes and branch deletion are blocked. No extra approving reviewer is required for the two-person team.
- Workflow tokens retain read-only default permissions and cannot approve pull requests.

Settings were read back from GitHub after configuration. The [machine-readable record](evidence/publication.json) captures their values. The existing Dynamic dependency exceptions remain documented in [DEPENDENCY_SECURITY.md](DEPENDENCY_SECURITY.md); publication does not resolve those upstream advisories.

## GitHub Actions and billing

The first checks on merged `main` failed before starting any steps because GitHub reported failed payments or a spending limit on the private repository. After publication, both runs were retried and their jobs started successfully on public runners. The release checks passed. The security run passed its history scan and dependency review but exposed a flaky synthetic-key control: random samples could fall outside the default detector’s entropy or character criteria. A separate fix uses stable generated samples without weakening any scanning rules; all 29 controls pass locally, and the final pull request runs the complete checks again. No payment method, spending limit or paid plan was changed.

- [Release checks](https://github.com/YieldShield/yieldshield-monad/actions/runs/35094719325)
- [Security checks](https://github.com/YieldShield/yieldshield-monad/actions/runs/35094719342)

Public-source publication is separate from Metropolis submission. Browser-wallet signing evidence, final form checks and submission confirmation remain outstanding in [the submission packet](METROPOLIS_SUBMISSION.md).
