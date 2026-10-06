# Storage readonly audit

- job_id: job-20261006T081309Z
- tenant: apidevelopers-digital
- worker_node: uni-import-export-mac-runners-01
- runner_name: apidevelopers-mac-ci-04
- runner_os: macOS
- runner_arch: X64
- collected_at_utc: 2026-10-06T08:13:54Z

## Safety

Readonly audit only. No rm, mv, cp, chmod, chown, mkdir outside the ephemeral workflow workspace, indexing, upload of private content, or file content reads.


## Host identity

```text
HomoSapiens.local
HomoSapiens
HomoSapiens
milenapeterlesavioabreu
/Users/milenapeterlesavioabreu/actions-runner-04/actions-runner/_work/apidevelopers-platform/apidevelopers-platform
```

## macOS

```text
ProductName:		macOS
ProductVersion:		13.7.8
BuildVersion:		22H730
Darwin HomoSapiens.local 22.6.0 Darwin Kernel Version 22.6.0: Tue Jul 15 08:22:28 PDT 2025; root:xnu-8796.141.3.713.2~2/RELEASE_X86_64 x86_64
```

## Disk usage df -h

```text
Filesystem       Size   Used  Avail Capacity  iused     ifree %iused  Mounted on
/dev/disk2s4s1  1.9Ti  8.7Gi   86Gi    10%   356882 903519640    0%   /
devfs           190Ki  190Ki    0Bi   100%      658         0  100%   /dev
/dev/disk2s2    1.9Ti  2.0Gi   86Gi     3%     1971 903519640    0%   /System/Volumes/Preboot
/dev/disk2s6    1.9Ti  3.0Gi   86Gi     4%        4 903519640    0%   /System/Volumes/VM
/dev/disk2s5    1.9Ti  5.5Mi   86Gi     1%       19 903519640    0%   /System/Volumes/Update
/dev/disk2s1    1.9Ti  1.8Ti   86Gi    96% 11457930 903519640    1%   /System/Volumes/Data
map auto_home     0Bi    0Bi    0Bi   100%        0         0  100%   /System/Volumes/Data/home
```

## APFS and disks diskutil list

```text
/dev/disk0 (internal, physical):
   #:                       TYPE NAME                    SIZE       IDENTIFIER
   0:      GUID_partition_scheme                        *121.3 GB   disk0
   1:                        EFI EFI                     314.6 MB   disk0s1
   2:                 Apple_APFS Container disk2         121.0 GB   disk0s2

/dev/disk1 (internal, physical):
   #:                       TYPE NAME                    SIZE       IDENTIFIER
   0:      GUID_partition_scheme                        *2.0 TB     disk1
   1:                        EFI EFI                     209.7 MB   disk1s1
   2:                 Apple_APFS Container disk2         2.0 TB     disk1s2

/dev/disk2 (synthesized):
   #:                       TYPE NAME                    SIZE       IDENTIFIER
   0:      APFS Container Scheme -                      +2.1 TB     disk2
                                 Physical Stores disk1s2, disk0s2
   1:                APFS Volume 10.14 - Dados           2.0 TB     disk2s1
   2:                APFS Volume Preboot                 2.1 GB     disk2s2
   3:                APFS Volume Recovery                1.2 GB     disk2s3
   4:                APFS Volume 10.14                   9.3 GB     disk2s4
   5:              APFS Snapshot com.apple.os.update-... 9.3 GB     disk2s4s1
   6:                APFS Volume VM                      3.2 GB     disk2s6

```

## Mounted volumes

```text
/dev/disk2s4s1 on / (apfs, sealed, local, read-only, journaled)
devfs on /dev (devfs, local, nobrowse)
/dev/disk2s2 on /System/Volumes/Preboot (apfs, local, journaled, nobrowse)
/dev/disk2s6 on /System/Volumes/VM (apfs, local, noexec, journaled, noatime, nobrowse)
/dev/disk2s5 on /System/Volumes/Update (apfs, local, journaled, nobrowse)
/dev/disk2s1 on /System/Volumes/Data (apfs, local, journaled, nobrowse)
map auto_home on /System/Volumes/Data/home (autofs, automounted, nobrowse)
```

## Users directory permissions

```text
drwxr-xr-x   6 root                     admin   192 17 Ago 15:51 /Users
drwxrwx---   4 root                     admin   128 17 Ago 14:35 /Users/Deleted Users
drwxrwxrwt  10 root                     wheel   320 16 Ago  2025 /Users/Shared
drwxr-xr-x+ 91 milenapeterlesavioabreu  staff  2912  5 Out 23:31 /Users/milenapeterlesavioabreu
```

## Top-level user directory sizes

```text
175M	/Users/Shared
 52G	/Users/Deleted Users
1,2T	/Users/milenapeterlesavioabreu
```

## Candidate API_STORAGE paths

```text
```

## iCloud candidate indicators

```text
drwxr-xr-x@ 182 milenapeterlesavioabreu  staff  5824 15 Ago 21:32 /Users/milenapeterlesavioabreu/Library/Mobile Documents
```

## External volumes summary

```text
drwxr-xr-x  3 root  wheel  96  4 Out 18:59 /Volumes
lrwxr-xr-x  1 root  wheel   1  4 Out 18:59 /Volumes/10.14 -> /
```

## Next step

Review this artifact before any R4 creation of API_STORAGE directories.
