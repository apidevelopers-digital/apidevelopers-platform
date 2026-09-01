# Template Vault Envelope Lab v1

Status: laboratory contract only.

This increment defines a governed, immutable envelope-record contract for Trust Face enrollment templates without persisting biometric payloads.

The record is bound to the exact enrollment manifest and stores only:
- enrollment/template references and digests;
- an opaque lab vault reference;
- sealed-object, wrapped-data-key and nonce digests;
- a key alias and cipher-suite policy;
- canonical creation time and a deterministic record digest.

The contract explicitly does **not** persist plaintext templates, embeddings, images, video, ciphertext payloads, data keys, wrapped key material, secrets or raw biometric bytes.

Security boundary:
- `syntheticOnly=true`
- `metadataOnly=true`
- `ciphertextPayloadPersisted=false`
- `keyMaterialPersisted=false`
- `keyProviderReady=false`
- `encryptionPerformed=false`
- `cryptographicOriginAttested=false`
- `hardDeleteAllowed=false`
- `rotationSupported=false`
- `realTemplateStorageReady=false`
- `productionReady=false`
- `biometricClaimReady=false`

The `aes-256-gcm+wrapped-data-key/contract-v1` value is a policy target for a future real envelope-encryption adapter. It is not evidence that encryption or KMS operations occurred.

Future work must separately authorize and validate:
1. a real vault/KMS adapter;
2. envelope encryption and decrypt authorization;
3. key rotation;
4. revocation-to-erasure evidence;
5. production access control and observability;
6. real biometric template storage.

No real biometric material is authorized by this lab contract.
