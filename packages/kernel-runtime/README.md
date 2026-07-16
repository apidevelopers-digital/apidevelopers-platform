# @apidevelopers/kernel-runtime

Dry-run-first controlled execution boundary for the API Developers.digital Platform Kernel.

## Guarantees

- dry-run is the default;
- only registered actions are accepted;
- real execution requires a matching human approval artifact;
- explicit confirmation is mandatory;
- constitutional conflicts block execution;
- secret-like fields are redacted from reports;
- every run emits evidence-ready records.

The package does not approve plans, merge branches, deploy or provide infrastructure adapters.
