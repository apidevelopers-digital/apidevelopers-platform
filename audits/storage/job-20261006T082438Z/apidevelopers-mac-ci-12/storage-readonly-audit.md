# Storage readonly audit

- job_id: job-20261006T082438Z
- tenant: apidevelopers-digital
- worker_node: uni-import-export-mac-runners-01
- runner_name: apidevelopers-mac-ci-12
- runner_os: macOS
- runner_arch: X64
- collected_at_utc: 2026-10-06T08:25:04Z

## Safety

Readonly audit only. No rm, mv, cp, chmod, chown, mkdir outside the ephemeral workflow workspace, indexing, upload of private content, or file content reads.


## Host identity

```text
Homosapi-iMac.local
Homosapi iMac
Homosapi-iMac
uniimporteexport
/Users/uniimporteexport/actions-runners/apidevelopers-mac-ci-12/actions-runner/_work/apidevelopers-platform/apidevelopers-platform
```

## macOS

```text
ProductName:		macOS
ProductVersion:		15.7.9
BuildVersion:		24G830
Darwin Homosapi-iMac.local 24.6.0 Darwin Kernel Version 24.6.0: Tue Jul 21 20:50:07 PDT 2026; root:xnu-11417.140.69.711.44~1/RELEASE_X86_64 x86_64
```

## Disk usage df -h

```text
Filesystem        Size    Used   Avail Capacity iused ifree %iused  Mounted on
/dev/disk2s4s1   957Gi    10Gi   349Gi     3%    427k  3,7G    0%   /
devfs            196Ki   196Ki     0Bi   100%     678     0  100%   /dev
/dev/disk2s2     957Gi   2,5Gi   349Gi     1%    1,5k  3,7G    0%   /System/Volumes/Preboot
/dev/disk2s6     957Gi   951Mi   349Gi     1%       2  3,7G    0%   /System/Volumes/VM
/dev/disk2s5     957Gi   3,5Mi   349Gi     1%      24  3,7G    0%   /System/Volumes/Update
/dev/disk2s1     957Gi   589Gi   349Gi    63%    7,3M  3,7G    0%   /System/Volumes/Data
map auto_home      0Bi     0Bi     0Bi   100%       0     0     -   /System/Volumes/Data/home
/dev/disk4s1     4,0Mi   676Ki   3,0Mi    19%      18   31k    0%   /System/Library/AssetsV2/com_apple_MobileAsset_PKITrustStore/purpose_auto/6dd55b0d06633a00de6f57ccb910a66a5ba2409a.asset/.AssetData
```

## APFS and disks diskutil list

```text
/dev/disk0 (internal, physical):
   #:                       TYPE NAME                    SIZE       IDENTIFIER
   0:      GUID_partition_scheme                        *28.0 GB    disk0
   1:                        EFI EFI                     314.6 MB   disk0s1
   2:                 Apple_APFS Container disk2         27.7 GB    disk0s2

/dev/disk1 (internal, physical):
   #:                       TYPE NAME                    SIZE       IDENTIFIER
   0:      GUID_partition_scheme                        *1.0 TB     disk1
   1:                        EFI EFI                     209.7 MB   disk1s1
   2:                 Apple_APFS Container disk2         1000.0 GB  disk1s2

/dev/disk2 (synthesized):
   #:                       TYPE NAME                    SIZE       IDENTIFIER
   0:      APFS Container Scheme -                      +1.0 TB     disk2
                                 Physical Stores disk1s2, disk0s2
   1:                APFS Volume 10.14 - Data            632.2 GB   disk2s1
   2:                APFS Volume Preboot                 2.7 GB     disk2s2
   3:                APFS Volume Recovery                1.3 GB     disk2s3
   4:                APFS Volume Homo Sapiens SSD        11.3 GB    disk2s4
   5:              APFS Snapshot com.apple.os.update-... 11.3 GB    disk2s4s1
   6:                APFS Volume VM                      997.1 MB   disk2s6

/dev/disk3 (disk image):
   #:                       TYPE NAME                    SIZE       IDENTIFIER
   0:                                                   +4.2 MB     disk3

/dev/disk4 (synthesized):
   #:                       TYPE NAME                    SIZE       IDENTIFIER
   0:      APFS Container Scheme -                      +4.2 MB     disk4
                                 Physical Store disk3
   1:                APFS Volume Creedence11M6270.SEC... 692.2 KB   disk4s1

```

## Mounted volumes

```text
/dev/disk2s4s1 on / (apfs, sealed, local, read-only, journaled)
devfs on /dev (devfs, local, nobrowse)
/dev/disk2s2 on /System/Volumes/Preboot (apfs, local, journaled, nobrowse)
/dev/disk2s6 on /System/Volumes/VM (apfs, local, noexec, journaled, noatime, nobrowse)
/dev/disk2s5 on /System/Volumes/Update (apfs, local, journaled, nobrowse)
/dev/disk2s1 on /System/Volumes/Data (apfs, local, journaled, nobrowse, root data)
map auto_home on /System/Volumes/Data/home (autofs, automounted, nobrowse)
/dev/disk4s1 on /System/Library/AssetsV2/com_apple_MobileAsset_PKITrustStore/purpose_auto/6dd55b0d06633a00de6f57ccb910a66a5ba2409a.asset/.AssetData (apfs, sealed, local, read-only, journaled, nobrowse)
```

## Users directory permissions

```text
drwxr-xr-x   5 root              admin   160 15 Ago 11:53 /Users
drwxrwxrwt  10 root              wheel   320 15 Ago 11:56 /Users/Shared
drwxr-xr-x+ 89 uniimporteexport  staff  2848  5 Out 23:31 /Users/uniimporteexport
```

## Top-level user directory sizes

```text
320K	/Users/Shared
115G	/Users/uniimporteexport
```

## Candidate API_STORAGE paths

```text
```

## iCloud candidate indicators

```text
dr-x------@ 66 uniimporteexport  staff  2112 15 Ago 12:02 /Users/uniimporteexport/Library/Mobile Documents
drwxr-xr-x  4 uniimporteexport  staff  128 13 Nov  2025 /Users/uniimporteexport/Library/CloudStorage
```

## External volumes summary

```text
drwxr-xr-x  3 root  wheel  96  4 Out 08:40 /Volumes
lrwxr-xr-x  1 root  wheel   1  4 Out 08:39 /Volumes/Homo Sapiens SSD -> /
```

## Next step

Review this artifact before any R4 creation of API_STORAGE directories.
