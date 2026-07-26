# @apidevelopers/kernel-runtime

Dry-run-first controlled execution boundary for the API Developers.digital Platform Kernel.

## Guarantees

- preview is the default;
- only registered actions are accepted;
- real execution requires an authorized policy decision;
- real execution requires a fresh, matching human approval;
- tenant, cycle, decision, proposal and action bindings must match;
- explicit confirmation is mandatory;
- secret-like fields are redacted from reports;
- every run emits evidence-ready records;
- no deployment, merge or external write is performed without an injected adapter.

## Test

```sh
npm test
```
