# Hidden Arquives / Greys — pre-publication safety plan

Status: required before real Hostinger publication  
Scope: ADA Asset Engine v1 / Hidden Arquives Greys  
Production publish: not authorized by this document

## Required evidence before publication

The following evidence must exist before asking for real SFTP approval:

| Evidence | Required condition |
|---|---|
| Source assets | 10 approved files under `media/sources/hiddenarquives/greys/` |
| Ingest report | `strict_ready: true` |
| Manifest | `has_real_hashes: true` and `sources_found: 10` |
| Hostinger plan | 10 asset uploads plus 1 HTML page |
| Publish gate report | no SFTP executed during gate |
| Rollback plan | remote backup/restore path documented |
| HTTP validation plan | public URLs listed for post-publish verification |

## Remote root

All planned paths must remain under:

```text
/home/u242521810/domains/hiddenarquives.tech/public_html
```

Any path outside this root must block publication.

## Rollback plan

Before overwriting any remote file, the real publisher must prepare a timestamped backup namespace.

Recommended format:

```text
/home/u242521810/domains/hiddenarquives.tech/public_html/_backups/asset-engine/greys/YYYYMMDD-HHMMSS/
```

For every planned upload:

1. check whether the remote file already exists;
2. if it exists, copy it into the backup namespace preserving relative path;
3. record original size and SHA1 if available;
4. upload the new file only after backup succeeds;
5. write a rollback manifest listing source backup path and restore target path.

Rollback must restore from the backup namespace to the original remote path without deleting unrelated files.

## HTTP post-publication validation plan

After a real approved publication, validate:

| URL type | Expected result |
|---|---|
| `https://greys.hiddenarquives.tech` | HTTP 200 |
| generated page path | HTTP 200 |
| each asset `public_url` from manifest | HTTP 200 |
| HTML references | no `ha-https://` broken prefix |
| cache-busted filenames | SHA1 short hash present in filename |

Post-publication validation must produce a report with:

```json
{
  "http_200": 0,
  "assets_verified": 0,
  "html_verified": false,
  "errors": []
}
```

The values above are placeholders until real HTTP validation is implemented and executed.

## Safety blockers

Publication must remain blocked if any of these are true:

- any expected asset is missing;
- any source file has zero bytes;
- any planned remote path leaves the allowed Hostinger root;
- approval phrase is missing;
- rollback backup cannot be prepared;
- generated HTML is missing;
- manifest uses placeholder hashes only;
- publish plan has no real asset files.

## Approval phrase

The expected approval phrase for a future real publication is:

```text
Igor aprova publicação real SFTP do ADA Asset Engine para Hidden Arquives Greys.
```
