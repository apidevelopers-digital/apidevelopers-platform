# Trust Face — Controlled Pilot v0 Operator Runbook

**Scope:** supervised, consented, non-authoritative pilot only.  
**Production:** not authorized.

## Default state

The pilot control is fail-closed. With no state file, `status` reports `disabled`.

```bash
bash packages/trust-face-engine/scripts/trust-face-pilot-control-v1.sh status
```

## Kill switch

Immediately disable the local pilot:

```bash
bash packages/trust-face-engine/scripts/trust-face-pilot-control-v1.sh kill
```

The command is idempotent and does not authorize production.

## Enable local pilot

Enabling the pilot requires the explicit local confirmation token:

```bash
TRUST_FACE_PILOT_ENABLE_CONFIRMATION=IGOR_APROVA_PILOTO_LOCAL \
  bash packages/trust-face-engine/scripts/trust-face-pilot-control-v1.sh enable
```

This token authorizes only the local controlled pilot state. It does **not** authorize a human-image execution, thresholding, identity claims, merge, deploy, release, financial action, or production.

## Incident stop

On any unexpected behavior:

1. run the kill switch;
2. stop the local launcher;
3. preserve only sanitized operational status;
4. do not retain raw image, aligned crop, embedding, or biometric template;
5. record the incident in GitHub without biometric material.

## Privacy boundary

Default operational evidence must keep all of the following false:

- raw/network biometric transport;
- GitHub Actions biometric transport;
- raw image persistence;
- aligned crop persistence;
- embedding persistence/logging;
- vector exposure;
- threshold application;
- identity claim;
- production authorization.

Human image/camera execution remains a separate sensitive gate requiring explicit approval.
