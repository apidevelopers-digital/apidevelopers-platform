# UniJuri Keychain helper — root bootstrap contract

Status: proposed, not provisioned.

## Purpose

The UniJuri Keychain helper must remain installed at:

`/usr/local/libexec/apidevelopers/operator-keychain-helper`

with metadata:

`root:wheel:0755`

The GitHub Actions runner account must not receive general passwordless sudo.

## Governed bootstrap

The installer workflow may use only this fixed root-owned bootstrap:

`/usr/local/libexec/apidevelopers/unijuri-keychain-helper-installer`

Expected bootstrap metadata:

`root:wheel:0755`

Canonical source in this repository:

`scripts/macos/unijuri-keychain-helper-installer`

The bootstrap accepts only:

- `--preflight`
- `--source <executable> --expected-sha256 <sha256>`

Its destination is fixed internally. It does not accept a destination path, shell command, environment payload, Keychain material, RSA material, or arbitrary root operation.

## Sudo boundary

The runner may be authorized non-interactively only for the fixed bootstrap executable. General `sudo`, `/usr/bin/install`, shell execution as root, and `SETENV` are outside this contract.

The workflow must fail closed unless all of the following are true:

- dedicated runner identity is `apidevelopers-mac-ci-05`;
- bootstrap exists and is executable;
- bootstrap metadata is exactly `root:wheel:0755`;
- `sudo -n <bootstrap> --preflight` succeeds;
- the built helper SHA-256 is verified before and after installation;
- the final helper metadata is exactly `root:wheel:0755`.

## Bootstrap paradox / current block

This repository can define and verify the bootstrap contract, but an unprivileged self-hosted runner cannot create its own root authority safely.

Therefore the root bootstrap itself must be installed by an already-authorized institutional privileged management plane. It must not be improvised through remote desktop, click automation, an interactive Terminal session, or a password passed through GitHub Actions.

Until that independent privileged bootstrap exists, the helper installer remains intentionally blocked before any write.

## Exclusions

This bootstrap does not:

- create or read UniJuri RSA keys;
- access or modify Keychain items;
- activate delegated binding;
- install a setuid binary;
- grant general root shell access.
