# Historical standalone CI fixture

`standalone-ci.yml` is the unchanged imported contract-repository workflow from [Monad revision 49dfb04](https://github.com/YieldShield/yieldshield-monad/blob/49dfb045811cfa8546b36b053fde34d0d3bd6f8a/contracts/.github/workflows/ci.yml). Existing coverage, fork, invariant, size and Slither policy tests use it as historical test data. It is not an active GitHub Actions entry point, and passing those assertions does not mean those standalone jobs run for Monad.

The active checks are defined in [the root workflow](../../../../.github/workflows/ci.yml). The fixture preserves the imported policy assertions without keeping a second apparent CI configuration under `contracts/.github/`.
