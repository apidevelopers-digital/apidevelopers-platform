# @apidevelopers/registry

Read-only central registry for API Developers.digital components, capabilities, contracts and policies.

## Role

The Registry is metadata infrastructure. It does not execute actions, approve decisions, mutate external state or contain product policy.

It owns:

- canonical component, capability, contract and policy records;
- semantic versions and lifecycle status;
- dependency validation;
- deterministic lookup and snapshots;
- an explicit compatibility adapter for legacy `ap.*` capability manifests.

## Record contract

```js
{
  id: "capability.publish",
  kind: "capability",
  version: "1.0.0",
  owner: "Platform Engineering",
  status: "active",
  displayName: "Publish",
  description: null,
  dependsOn: [
    "component.github.publisher",
    "contract.publish.v1",
    "policy.security.release"
  ],
  metadata: {}
}
```

Supported kinds:

- `component`
- `capability`
- `contract`
- `policy`

Supported statuses:

- `active`
- `draft`
- `deprecated`
- `retired`

All identifiers are validated by `@apidevelopers/contracts`. Legacy identifiers are never accepted as lookup aliases.

## Read-only API

```js
import { createRegistry } from "@apidevelopers/registry";

const registry = createRegistry(records);

registry.has("capability.publish");
registry.get("contract.publish.v1");
registry.list({ kind: "policy", status: "active" });
registry.dependenciesOf("capability.publish");
registry.dependentsOf("contract.publish.v1");
registry.snapshot();
```

There is no `register`, `update`, `delete`, approval or execution method.

## Legacy capability compatibility

Existing manifests in `capabilities/*.json` use identifiers such as `ap.auth`.

The explicit adapter converts:

```text
ap.auth   -> capability.auth
ap.events -> capability.events
```

The original identifier remains available only as `metadata.legacyId`. Registry lookup continues to require canonical IDs.

`scripts/build-capability-index.mjs` delegates validation to this package and preserves the legacy generated index shape for existing consumers.

## Test

```sh
npm test
npm run check
```
