# Operator Gateway — Gate 3C: macOS Keychain helper bridge protocol

**Status:** synthetic preparation; no real helper executed  
**Date:** 2026-08-03  
**Base:** `apidevelopers-platform/main@eed11992e6e1f1f94cf5e1b4ed57b6ebec670c81`

## Objective

Define the concrete protocol bridge between the Gate 3B native writer boundary and a future institutional macOS helper, without installing or executing that helper and without touching the real Keychain.

## Fixed protocol

The bridge is fail-closed and accepts only:

- executable: `/usr/local/libexec/apidevelopers/operator-keychain-helper`;
- protocol: `operator-keychain-helper.v1`;
- operation: `store-generic-password`;
- exact institutional `service` and `account`;
- access scope: `current-user`;
- create-only behavior;
- no overwrite;
- no secret output;
- secret material only through `stdinBytes`;
- shell disabled;
- environment inheritance disabled;
- timeout and output limits.

The allowlisted response is exactly:

```json
{
  "protocol": "operator-keychain-helper.v1",
  "created": true,
  "replaced": false,
  "secretReturned": false
}
```

Any additional field, malformed output, timeout, non-zero exit, contract violation or process failure is rejected with sanitized evidence.

## Security state

```json
{
  "helperInstalled": false,
  "helperExecuted": false,
  "realKeychainAccessed": false,
  "realPrivateKeyReceived": false,
  "githubAppCreated": false,
  "credentialCreated": false,
  "productionChanged": false
}
```

Temporary secret, stdout and stderr buffers are zeroed on success and failure. The bridge contains no network, environment access, direct `security` CLI binding or subprocess implementation. Process execution remains supplied only through dependency injection.

## Remaining prerequisites

1. auditable API endpoint to create and administer the institutional GitHub App;
2. institutional App and installation created with read-only permissions;
3. private key generated outside chat, logs and repository artifacts;
4. reviewed macOS helper implementation using the native Security framework;
5. signed/notarized helper artifact and fixed installation path;
6. reviewed process runner binding on `igor-mac-runner`;
7. removal and rotation runbook;
8. separate explicit execution approval.

The authorization `IGOR_APROVA_ARMAZENAR_CHAVE_NO_KEYCHAIN` remains unconsumed. Merge of this gate does not store a key, install a helper, access the Keychain, create a GitHub App, emit a token, call the network or change production.
