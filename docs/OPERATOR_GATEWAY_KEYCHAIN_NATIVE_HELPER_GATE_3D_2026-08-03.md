# Operator Gateway — Gate 3D: native macOS Keychain helper scaffold

**Status:** implementation scaffold; real storage disabled by default  
**Date:** 2026-08-03  
**Base:** `apidevelopers-platform/main@2ea216346973599272a14a871f016236eacc9861`

## Objective

Prepare the native macOS helper that will eventually back the Gate 3C bridge. The helper is compiled and tested on the institutional macOS runner, but the default build cannot write to the real Keychain.

## Implementation

The Swift package lives at:

`apps/api-gateway/native/operator-keychain-helper`

It contains:

- a strict parser for protocol `operator-keychain-helper.v1`;
- exact institutional service and account allowlists;
- create-only semantics;
- secret input exclusively through stdin;
- no secret output;
- sanitized JSON success and failure responses;
- a Security framework store implementation guarded by the custom compilation condition `OPERATOR_KEYCHAIN_REAL_STORAGE_ENABLED`;
- a default build that always returns `storage_disabled`;
- unit tests with synthetic material only.

## Default security state

```json
{
  "swiftPackageCompiled": true,
  "unitTestsExecuted": true,
  "realStorageCompilationFlag": false,
  "helperInstalled": false,
  "helperExecutedAgainstKeychain": false,
  "realPrivateKeyReceived": false,
  "realKeychainItemCreated": false,
  "githubAppCreated": false,
  "productionChanged": false
}
```

The repository and CI must never pass `-DOPERATOR_KEYCHAIN_REAL_STORAGE_ENABLED`. Enabling that compilation condition requires a separate reviewed change, a signed/notarized artifact plan, a fixed installation path, a removal and rotation runbook, and explicit approval.

## Remaining gates

1. verify an API endpoint capable of creating and administering the institutional GitHub App;
2. create the App and read-only installation;
3. generate the private key outside chat, logs and repository artifacts;
4. review code signing, notarization and fixed helper installation;
5. review the concrete process runner used by `igor-mac-runner`;
6. approve a separate build with the real-storage compilation condition;
7. execute one auditable create-only storage operation;
8. verify fingerprint, removal and rotation;
9. execute one read-only GitHub pilot with rollback.

`IGOR_APROVA_ARMAZENAR_CHAVE_NO_KEYCHAIN` remains unconsumed. Merge of this scaffold does not store a key, install the helper, access the Keychain, create a GitHub App, emit a token, call the network or change production.
