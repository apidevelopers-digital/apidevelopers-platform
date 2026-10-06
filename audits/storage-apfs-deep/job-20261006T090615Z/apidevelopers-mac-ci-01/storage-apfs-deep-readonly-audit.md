# Storage APFS deep readonly audit

- job_id: job-20261006T090615Z
- tenant: apidevelopers-digital
- expected_hostname: HomoSapiens.local
- expected_user: milenapeterlesavioabreu
- runner_name: apidevelopers-mac-ci-01
- runner_os: macOS
- runner_arch: X64
- collected_at_utc: 2026-10-06T09:06:59Z

## Safety

Readonly audit only. No rm, mv, chmod, chown, mkdir outside the ephemeral workflow workspace, indexing, upload of private content, or file content reads.


## Host identity

```text
HomoSapiens.local
HomoSapiens
HomoSapiens
milenapeterlesavioabreu
/Users/milenapeterlesavioabreu/actions-runners/apidevelopers-organization-macos/actions-runner/_work/apidevelopers-platform/apidevelopers-platform
```

## macOS

```text
ProductName:		macOS
ProductVersion:		13.7.8
BuildVersion:		22H730
Darwin HomoSapiens.local 22.6.0 Darwin Kernel Version 22.6.0: Tue Jul 15 08:22:28 PDT 2025; root:xnu-8796.141.3.713.2~2/RELEASE_X86_64 x86_64
```

## Storage overview df -h

```text
Filesystem       Size   Used  Avail Capacity  iused     ifree %iused  Mounted on
/dev/disk2s4s1  1.9Ti  8.7Gi   86Gi    10%   356882 902839480    0%   /
devfs           190Ki  190Ki    0Bi   100%      658         0  100%   /dev
/dev/disk2s2    1.9Ti  2.0Gi   86Gi     3%     1971 902839480    0%   /System/Volumes/Preboot
/dev/disk2s6    1.9Ti  3.0Gi   86Gi     4%        4 902839480    0%   /System/Volumes/VM
/dev/disk2s5    1.9Ti  5.5Mi   86Gi     1%       19 902839480    0%   /System/Volumes/Update
/dev/disk2s1    1.9Ti  1.8Ti   86Gi    96% 11457272 902839480    1%   /System/Volumes/Data
map auto_home     0Bi    0Bi    0Bi   100%        0         0  100%   /System/Volumes/Data/home
```

## APFS list

```text
APFS Container (1 found)
|
+-- Container disk2 B412D8B8-F572-46B5-BFC6-E6626B548536
    ====================================================
    APFS Container Reference:     disk2 (Fusion)
    Size (Capacity Ceiling):      2121207386112 B (2.1 TB)
    Capacity In Use By Volumes:   2028756631552 B (2.0 TB) (95.6% used)
    Capacity Not Allocated:       92450754560 B (92.5 GB) (4.4% free)
    |
    +-< Physical Store disk0s2 D899A3A0-4F7E-481A-A7FD-4846737D5AE8
    |   -----------------------------------------------------------
    |   APFS Physical Store Disk:   disk0s2 (Main, "Faster" Disk Use)
    |   Size:                       121018208256 B (121.0 GB)
    |
    +-< Physical Store disk1s2 4FBD3A28-6F27-4014-99E3-CA8EE11DF6D8
    |   -----------------------------------------------------------
    |   APFS Physical Store Disk:   disk1s2 (Secondary, Designated Aux Use)
    |   Size:                       2000189177856 B (2.0 TB)
    |
    +-> Volume disk2s1 06D6D215-0FAC-4323-9B11-8FEDF060B454
    |   ---------------------------------------------------
    |   APFS Volume Disk (Role):   disk2s1 (Data)
    |   Name:                      10.14 - Dados (Case-insensitive)
    |   Mount Point:               /System/Volumes/Data
    |   Capacity Consumed:         2003837030400 B (2.0 TB)
    |   Sealed:                    No
    |   FileVault:                 No
    |
    +-> Volume disk2s2 92997D2B-17C2-4B17-8F64-20703B06BF8A
    |   ---------------------------------------------------
    |   APFS Volume Disk (Role):   disk2s2 (Preboot)
    |   Name:                      Preboot (Case-insensitive)
    |   Mount Point:               /System/Volumes/Preboot
    |   Capacity Consumed:         2133078016 B (2.1 GB)
    |   Sealed:                    No
    |   FileVault:                 No
    |
    +-> Volume disk2s3 4B9E2065-E321-4C23-A36D-9BCCBE87911A
    |   ---------------------------------------------------
    |   APFS Volume Disk (Role):   disk2s3 (Recovery)
    |   Name:                      Recovery (Case-insensitive)
    |   Mount Point:               Not Mounted
    |   Capacity Consumed:         1152413696 B (1.2 GB)
    |   Sealed:                    No
    |   FileVault:                 No
    |
    +-> Volume disk2s4 2BE10B14-8B80-4DA6-A2E8-7D19B482EE3A
    |   ---------------------------------------------------
    |   APFS Volume Disk (Role):   disk2s4 (System)
    |   Name:                      10.14 (Case-insensitive)
    |   Mount Point:               Not Mounted
    |   Capacity Consumed:         9345683456 B (9.3 GB)
    |   Sealed:                    Broken
    |   FileVault:                 No
    |   |
    |   Snapshot:                  9DF43E36-F2BF-47E6-B0CE-43F99820D3C6
    |   Snapshot Disk:             disk2s4s1
    |   Snapshot Mount Point:      /
    |   Snapshot Sealed:           Yes
    |
    +-> Volume disk2s6 BDF3A2DA-E488-4A74-BC9D-D42ABA39C313
        ---------------------------------------------------
        APFS Volume Disk (Role):   disk2s6 (VM)
        Name:                      VM (Case-insensitive)
        Mount Point:               /System/Volumes/VM
        Capacity Consumed:         3246383104 B (3.2 GB)
        Sealed:                    No
        FileVault:                 No
```

## Diskutil list

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

## Disk info root

```text
   Device Identifier:         disk2s4s1
   Device Node:               /dev/disk2s4s1
   Whole:                     No
   Part of Whole:             disk2

   Volume Name:               10.14
   Mounted:                   Yes
   Mount Point:               /

   Partition Type:            41504653-0000-11AA-AA11-00306543ECAC
   File System Personality:   APFS
   Type (Bundle):             apfs
   Name (User Visible):       APFS
   Owners:                    Enabled

   OS Can Be Installed:       No
   Booter Disk:               disk2s2
   Recovery Disk:             disk2s3
   Media Type:                Genérico
   Protocol:                  PCI-Express
   SMART Status:              Verified
   Volume UUID:               9DF43E36-F2BF-47E6-B0CE-43F99820D3C6
   Disk / Partition UUID:     9DF43E36-F2BF-47E6-B0CE-43F99820D3C6

   Disk Size:                 2.1 TB (2121207386112 Bytes) (exactly 4142983176 512-Byte-Units)
   Device Block Size:         4096 Bytes

   Volume Used Space:         9.3 GB (9345683456 Bytes) (exactly 18253288 512-Byte-Units)
   Container Total Space:     2.1 TB (2121207386112 Bytes) (exactly 4142983176 512-Byte-Units)
   Container Free Space:      92.5 GB (92450656256 Bytes) (exactly 180567688 512-Byte-Units)
   Allocation Block Size:     4096 Bytes

   Media OS Use Only:         No
   Media Read-Only:           Yes
   Volume Read-Only:          Yes (read-only mount flag set)

   Device Location:           Internal
   Removable Media:           Fixed

   Solid State:               Yes
   Hardware AES Support:      No

   This disk is an APFS Volume Snapshot.  APFS Information:
   APFS Snapshot Name:        com.apple.os.update-74E05D9EE66173C522D76DF0C98A5B74A648965D5E82C6C7FF1AFB3E584375C2
   APFS Snapshot UUID:        9DF43E36-F2BF-47E6-B0CE-43F99820D3C6
   APFS Container:            disk2
   APFS Physical Store:       disk0s2
   APFS Physical Store:       disk1s2
   Fusion Drive:              Yes
   APFS Volume Group:         06D6D215-0FAC-4323-9B11-8FEDF060B454
   EFI Driver In macOS:       2142140009703001
   Encrypted:                 No
   FileVault:                 No
   Sealed:                    Broken
   Locked:                    No

   APFS Snapshots are defined upon this APFS Volume.  Snapshot list:
   Snapshot UUID:             9DF43E36-F2BF-47E6-B0CE-43F99820D3C6
   Name:                      com.apple.os.update-74E05D9EE66173C522D76DF0C98A5B74A648965D5E82C6C7FF1AFB3E584375C2
   XID:                       2287866

```

## Disk info Data volume

```text
   Device Identifier:         disk2s1
   Device Node:               /dev/disk2s1
   Whole:                     No
   Part of Whole:             disk2

   Volume Name:               10.14 - Dados
   Mounted:                   Yes
   Mount Point:               /System/Volumes/Data

   Partition Type:            41504653-0000-11AA-AA11-00306543ECAC
   File System Personality:   APFS
   Type (Bundle):             apfs
   Name (User Visible):       APFS
   Owners:                    Enabled

   OS Can Be Installed:       Yes
   Booter Disk:               disk2s2
   Recovery Disk:             disk2s3
   Media Type:                Genérico
   Protocol:                  PCI-Express
   SMART Status:              Verified
   Volume UUID:               06D6D215-0FAC-4323-9B11-8FEDF060B454
   Disk / Partition UUID:     06D6D215-0FAC-4323-9B11-8FEDF060B454

   Disk Size:                 2.1 TB (2121207386112 Bytes) (exactly 4142983176 512-Byte-Units)
   Device Block Size:         4096 Bytes

   Volume Used Space:         2.0 TB (2003837140992 Bytes) (exactly 3913744416 512-Byte-Units)
   Container Total Space:     2.1 TB (2121207386112 Bytes) (exactly 4142983176 512-Byte-Units)
   Container Free Space:      92.5 GB (92450643968 Bytes) (exactly 180567664 512-Byte-Units)
   Allocation Block Size:     4096 Bytes

   Media OS Use Only:         No
   Media Read-Only:           No
   Volume Read-Only:          No

   Device Location:           Internal
   Removable Media:           Fixed

   Solid State:               Yes
   Hardware AES Support:      No

   This disk is an APFS Volume.  APFS Information:
   APFS Container:            disk2
   APFS Physical Store:       disk0s2
   APFS Physical Store:       disk1s2
   Fusion Drive:              Yes
   APFS Volume Group:         06D6D215-0FAC-4323-9B11-8FEDF060B454
   Encrypted:                 No
   FileVault:                 No
   Sealed:                    No
   Locked:                    No

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

## Time Machine local snapshots root

```text
Snapshots for disk /:
```

## Time Machine local snapshots Data

```text
Snapshots for disk /System/Volumes/Data:
```

## Storage data system profiler

```text
Storage:

    10.14 - Dados:

      Free: 92,45 GB (92.450.512.896 bytes)
      Capacity: 2,12 TB (2.121.207.386.112 bytes)
      Mount Point: /System/Volumes/Data
      File System: APFS
      Writable: Yes
      Ignore Ownership: No
      BSD Name: disk2s1
      Volume UUID: 06D6D215-0FAC-4323-9B11-8FEDF060B454
      Physical Drive:
          Device Name: APPLE SSD SM0128L
          Media Name: AppleAPFSMedia
          Medium Type: SSD
          Protocol: PCI-Express
          Internal: Yes
          Partition Map Type: Unknown
          S.M.A.R.T. Status: Verified

    10,14:

      Free: 92,45 GB (92.450.512.896 bytes)
      Capacity: 2,12 TB (2.121.207.386.112 bytes)
      Mount Point: /
      File System: APFS
      Writable: No
      Ignore Ownership: No
      BSD Name: disk2s4s1
      Volume UUID: 9DF43E36-F2BF-47E6-B0CE-43F99820D3C6
      Physical Drive:
          Device Name: APPLE SSD SM0128L
          Media Name: AppleAPFSMedia
          Medium Type: SSD
          Protocol: PCI-Express
          Internal: Yes
          Partition Map Type: Unknown
          S.M.A.R.T. Status: Verified

```

## Users permissions

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

## iCloud and CloudStorage indicators

```text
drwxr-xr-x@ 182 milenapeterlesavioabreu  staff  5824 15 Ago 21:32 /Users/milenapeterlesavioabreu/Library/Mobile Documents
```

## External volumes summary

```text
drwxr-xr-x  3 root  wheel  96  4 Out 18:59 /Volumes
lrwxr-xr-x  1 root  wheel   1  4 Out 18:59 /Volumes/10.14 -> /
```

## Next step

Compare this APFS report with the macOS Storage UI before any R4 creation of API_STORAGE directories.
