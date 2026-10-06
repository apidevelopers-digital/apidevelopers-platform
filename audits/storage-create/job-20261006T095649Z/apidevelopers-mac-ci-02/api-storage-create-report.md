# API_STORAGE creation report

- job_id: job-20261006T095649Z
- tenant: apidevelopers-digital
- expected_hostname: Homosapi-iMac.local
- expected_user: uniimporteexport
- runner_name: apidevelopers-mac-ci-02
- root: /Users/uniimporteexport/API_STORAGE
- backend_initial_limit_gb: 200
- hard_stop_free_space_gb: 150
- created_at_utc: 2026-10-06T10:00:41Z

## Safety

Created only empty directory structure and initial manifest files. No document ingestion, indexing, cleanup, deletion, or public exposure was performed.

## Host identity

```text
Homosapi-iMac.local
Homosapi iMac
Homosapi-iMac
uniimporteexport
```

## Disk status

```text
Filesystem      Size    Used   Avail Capacity iused ifree %iused  Mounted on
/dev/disk2s1   957Gi   589Gi   348Gi    63%    7,3M  3,7G    0%   /System/Volumes/Data
```

## Created tree

```text
/Users/uniimporteexport/API_STORAGE
/Users/uniimporteexport/API_STORAGE/backups
/Users/uniimporteexport/API_STORAGE/books
/Users/uniimporteexport/API_STORAGE/books/metadata
/Users/uniimporteexport/API_STORAGE/books/processed
/Users/uniimporteexport/API_STORAGE/books/raw
/Users/uniimporteexport/API_STORAGE/datasets
/Users/uniimporteexport/API_STORAGE/datasets/normalized
/Users/uniimporteexport/API_STORAGE/datasets/raw
/Users/uniimporteexport/API_STORAGE/documents
/Users/uniimporteexport/API_STORAGE/documents/institutional
/Users/uniimporteexport/API_STORAGE/documents/private
/Users/uniimporteexport/API_STORAGE/documents/public
/Users/uniimporteexport/API_STORAGE/embeddings
/Users/uniimporteexport/API_STORAGE/embeddings/indexes
/Users/uniimporteexport/API_STORAGE/embeddings/manifests
/Users/uniimporteexport/API_STORAGE/exports
/Users/uniimporteexport/API_STORAGE/README.md
/Users/uniimporteexport/API_STORAGE/registry
/Users/uniimporteexport/API_STORAGE/registry/checksums.json
/Users/uniimporteexport/API_STORAGE/registry/inventory_latest.json
/Users/uniimporteexport/API_STORAGE/registry/storage_manifest.json
/Users/uniimporteexport/API_STORAGE/uploads
/Users/uniimporteexport/API_STORAGE/uploads/accepted
/Users/uniimporteexport/API_STORAGE/uploads/inbox
/Users/uniimporteexport/API_STORAGE/uploads/quarantine
```

## Manifest

```json
{
  "storage_id": "mac-storage-primary-01",
  "status": "created",
  "role": "primary_initial",
  "tenant": "apidevelopers-digital",
  "host": "Homosapi-iMac.local",
  "user": "uniimporteexport",
  "root": "/Users/uniimporteexport/API_STORAGE",
  "created_at_utc": "2026-10-06T10:00:40.962766+00:00",
  "created_by": "ADA",
  "approval": "IGOR_APROVA_R4",
  "ui_available_gb_observed": 772.49,
  "apfs_available_gb_observed": 374.6,
  "df_available_gib_observed": 349,
  "backend_initial_limit_gb": 200,
  "hard_stop_free_space_gb": 150,
  "icloud_policy": "cold_backup_or_auxiliary_copy_only",
  "backend_policy": "local_ssd_only",
  "ingestion_enabled": false,
  "indexing_enabled": false,
  "public_exposure_enabled": false,
  "classification_required_before_private_ingest": true,
  "directories": [
    "books/raw",
    "books/processed",
    "books/metadata",
    "documents/public",
    "documents/institutional",
    "documents/private",
    "datasets/raw",
    "datasets/normalized",
    "embeddings/indexes",
    "embeddings/manifests",
    "uploads/inbox",
    "uploads/quarantine",
    "uploads/accepted",
    "exports",
    "backups",
    "registry"
  ]
}
```

## Root size

```text
 16K	/Users/uniimporteexport/API_STORAGE
```
