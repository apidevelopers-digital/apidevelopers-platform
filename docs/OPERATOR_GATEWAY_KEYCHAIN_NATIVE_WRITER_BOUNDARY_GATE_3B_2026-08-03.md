# Operator Gateway - Gate 3B: native macOS Keychain writer boundary

**Status:** synthetic preparation; no real write authorized
**Date:** 2026-08-03
**Base:** `apidevelopers-platform/main@07f393d3131e9864c988b35aade0de1427e96cb6`

## Objective

Prepare the technical boundary that will connect the Gate 3 controller to a native macOS bridge without binding a subprocess, shell, the `security` command, or any real Keychain item.

## Controls

- disabled by default;
- `darwin` only;
- exact institutional `service` and `account`;
- secret accepted only as `Uint8Array`, between 1 and 8192 bytes;
- overwrite denied;
- secret return denied;
- native bridge provided only by dependency injection;
- fixed operation `store-generic-password`;
- fixed scope `current-user`;
- required result: `created=true`, `replaced=false`, `secretReturned=false`;
- bridge errors sanitized;
- temporary copy zeroed on success and failure;
- no subprocess, shell, network, environment, or real Keychain command binding.

## Current boundary

The concrete native bridge does not exist yet:

```json
{
  "nativeBridgeBound": false,
  "realKeychainWriteExecuted": false,
  "realPrivateKeyReceived": false,
  "credentialCreated": false,
  "productionChanged": false
}
```

The authorization `IGOR_APROVA_ARMAZENAR_CHAVE_NO_KEYCHAIN` remains unconsumed until all of these are confirmed:

1. institutional GitHub App created through a verifiable endpoint;
2. private key generated outside chat and artifacts;
3. native bridge reviewed and merged;
4. removal and rotation runbook approved;
5. separate explicit auditable execution.

## Result

This gate implements only the boundary and synthetic tests. Merge does not write a key, access the real Keychain, create a GitHub App, emit a token, call the network, or change production.
