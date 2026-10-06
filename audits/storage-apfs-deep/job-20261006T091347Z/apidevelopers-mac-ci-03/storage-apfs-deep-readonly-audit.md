# Storage APFS deep readonly audit

- job_id: job-20261006T091347Z
- tenant: apidevelopers-digital
- expected_hostname: Homosapi-iMac.local
- expected_user: uniimporteexport
- runner_name: apidevelopers-mac-ci-03
- runner_os: macOS
- runner_arch: X64
- collected_at_utc: 2026-10-06T09:14:08Z

## Safety

Readonly audit only. No rm, mv, chmod, chown, mkdir outside the ephemeral workflow workspace, indexing, upload of private content, or file content reads.


## Host identity

```text
Homosapi-iMac.local
Homosapi iMac
Homosapi-iMac
uniimporteexport
/Users/uniimporteexport/actions-runners/apidevelopers-mac-ci-03/actions-runner/actions-runner/_work/apidevelopers-platform/apidevelopers-platform
```

## macOS

```text
ProductName:		macOS
ProductVersion:		15.7.9
BuildVersion:		24G830
Darwin Homosapi-iMac.local 24.6.0 Darwin Kernel Version 24.6.0: Tue Jul 21 20:50:07 PDT 2026; root:xnu-11417.140.69.711.44~1/RELEASE_X86_64 x86_64
```

## Storage overview df -h

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

## APFS list

```text
APFS Containers (2 found)
|
+-- Container disk2 E38314C0-6668-4D62-8C31-7A83D6578314
|   ====================================================
|   APFS Container Reference:     disk2 (Fusion)
|   Size (Capacity Ceiling):      1027680514048 B (1.0 TB)
|   Capacity In Use By Volumes:   653048156160 B (653.0 GB) (63.5% used)
|   Capacity Not Allocated:       374632357888 B (374.6 GB) (36.5% free)
|   |
|   +-< Physical Store disk0s2 29CAB99C-A1C2-410B-A069-D9744471CF0F
|   |   -----------------------------------------------------------
|   |   APFS Physical Store Disk:   disk0s2 (Main, "Faster" Disk Use)
|   |   Size:                       27685384192 B (27.7 GB)
|   |
|   +-< Physical Store disk1s2 4B70F321-3681-4D0C-8CE8-CC3B400FBCFA
|   |   -----------------------------------------------------------
|   |   APFS Physical Store Disk:   disk1s2 (Secondary, Designated Aux Use)
|   |   Size:                       999995129856 B (1000.0 GB)
|   |
|   +-> Volume disk2s1 A8CFCF6A-E4D8-4876-AB54-A9C888CD1B79
|   |   ---------------------------------------------------
|   |   APFS Volume Disk (Role):   disk2s1 (Data)
|   |   Name:                      10.14 - Data (Case-insensitive)
|   |   Mount Point:               /System/Volumes/Data
|   |   Capacity Consumed:         632193523712 B (632.2 GB)
|   |   Sealed:                    No
|   |   FileVault:                 No
|   |
|   +-> Volume disk2s2 BD458D49-CDFD-47AB-983F-A5F4E09AC05D
|   |   ---------------------------------------------------
|   |   APFS Volume Disk (Role):   disk2s2 (Preboot)
|   |   Name:                      Preboot (Case-insensitive)
|   |   Mount Point:               /System/Volumes/Preboot
|   |   Capacity Consumed:         2738024448 B (2.7 GB)
|   |   Sealed:                    No
|   |   FileVault:                 No
|   |
|   +-> Volume disk2s3 995028D2-BA57-4CE1-BCD7-121889550960
|   |   ---------------------------------------------------
|   |   APFS Volume Disk (Role):   disk2s3 (Recovery)
|   |   Name:                      Recovery (Case-insensitive)
|   |   Mount Point:               Not Mounted
|   |   Capacity Consumed:         1331703808 B (1.3 GB)
|   |   Sealed:                    No
|   |   FileVault:                 No
|   |
|   +-> Volume disk2s4 80A10BA1-9CFA-4B9E-8DDF-DAC7B668084F
|   |   ---------------------------------------------------
|   |   APFS Volume Disk (Role):   disk2s4 (System)
|   |   Name:                      Homo Sapiens SSD (Case-insensitive)
|   |   Mount Point:               Not Mounted
|   |   Capacity Consumed:         11262812160 B (11.3 GB)
|   |   Sealed:                    Yes
|   |   FileVault:                 No
|   |   |
|   |   Snapshot:                  F21F8D54-D7D7-468E-8A8D-F51939780075
|   |   Snapshot Disk:             disk2s4s1
|   |   Snapshot Mount Point:      /
|   |   Snapshot Sealed:           Yes
|   |
|   +-> Volume disk2s6 30F5C9DC-DB89-4146-B0CA-521F5792011B
|       ---------------------------------------------------
|       APFS Volume Disk (Role):   disk2s6 (VM)
|       Name:                      VM (Case-insensitive)
|       Mount Point:               /System/Volumes/VM
|       Capacity Consumed:         997056512 B (997.1 MB)
|       Sealed:                    No
|       FileVault:                 No
|
+-- Container disk4 1A6CB6F0-7399-4DDF-8286-2CD9E323D74A
    ====================================================
    APFS Container Reference:     disk4
    Size (Capacity Ceiling):      4194304 B (4.2 MB)
    Capacity In Use By Volumes:   1044480 B (1.0 MB) (24.9% used)
    Capacity Not Allocated:       3149824 B (3.1 MB) (75.1% free)
    |
    +-< Physical Store disk3 (No UUID)
    |   ------------------------------
    |   APFS Physical Store Disk:   disk3
    |   Size:                       4194304 B (4.2 MB)
    |
    +-> Volume disk4s1 A4B97E21-47AA-4E5E-A5D5-1F7563C37536
        ---------------------------------------------------
        APFS Volume Disk (Role):   disk4s1 (No specific role)
        Name:                      Creedence11M6270.SECUREPKITRUSTSTOREASSETS_SECUREPKITRUSTSTORE_Cryptex (Case-sensitive)
        Mount Point:               /System/Library/AssetsV2/com_apple_MobileAsset_PKITrustStore/purpose_auto/6dd55b0d06633a00de6f57ccb910a66a5ba2409a.asset/.AssetData
        Capacity Consumed:         692224 B (692.2 KB)
        Sealed:                    Yes
        FileVault:                 No
```

## Diskutil list

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

## Disk info root

```text
   Device Identifier:         disk2s4s1
   Device Node:               /dev/disk2s4s1
   Whole:                     No
   Part of Whole:             disk2

   Volume Name:               Homo Sapiens SSD
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
   Volume UUID:               F21F8D54-D7D7-468E-8A8D-F51939780075
   Disk / Partition UUID:     F21F8D54-D7D7-468E-8A8D-F51939780075

   Disk Size:                 1.0 TB (1027680514048 Bytes) (exactly 2007188504 512-Byte-Units)
   Device Block Size:         4096 Bytes

   Volume Used Space:         11.3 GB (11262812160 Bytes) (exactly 21997680 512-Byte-Units)
   Container Total Space:     1.0 TB (1027680514048 Bytes) (exactly 2007188504 512-Byte-Units)
   Container Free Space:      374.6 GB (374632345600 Bytes) (exactly 731703800 512-Byte-Units)
   Allocation Block Size:     4096 Bytes

   Media OS Use Only:         No
   Media Read-Only:           Yes
   Volume Read-Only:          Yes (read-only mount flag set)

   Device Location:           Internal
   Removable Media:           Fixed

   Solid State:               Yes
   Hardware AES Support:      No

   This disk is an APFS Volume Snapshot.  APFS Information:
   APFS Snapshot Name:        com.apple.os.update-2C083E7D042E96779F886D9092C61E88A0E7AB9EE4C8ACE14FD9C26E43B17C55
   APFS Snapshot UUID:        F21F8D54-D7D7-468E-8A8D-F51939780075
   APFS Container:            disk2
   APFS Physical Store:       disk0s2
   APFS Physical Store:       disk1s2
   Fusion Drive:              Yes
   APFS Volume Group:         A8CFCF6A-E4D8-4876-AB54-A9C888CD1B79
   EFI Driver In macOS:       2332140013702002
   Encrypted:                 No
   FileVault:                 No
   Sealed:                    Yes
   Locked:                    No

   APFS Snapshots are defined upon this APFS Volume.  Snapshot list:
   Snapshot UUID:             F21F8D54-D7D7-468E-8A8D-F51939780075
   Name:                      com.apple.os.update-2C083E7D042E96779F886D9092C61E88A0E7AB9EE4C8ACE14FD9C26E43B17C55
   XID:                       4346818

```

## Disk info Data volume

```text
   Device Identifier:         disk2s1
   Device Node:               /dev/disk2s1
   Whole:                     No
   Part of Whole:             disk2

   Volume Name:               10.14 - Data
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
   Volume UUID:               A8CFCF6A-E4D8-4876-AB54-A9C888CD1B79
   Disk / Partition UUID:     A8CFCF6A-E4D8-4876-AB54-A9C888CD1B79

   Disk Size:                 1.0 TB (1027680514048 Bytes) (exactly 2007188504 512-Byte-Units)
   Device Block Size:         4096 Bytes

   Volume Used Space:         632.2 GB (632193527808 Bytes) (exactly 1234752984 512-Byte-Units)
   Container Total Space:     1.0 TB (1027680514048 Bytes) (exactly 2007188504 512-Byte-Units)
   Container Free Space:      374.6 GB (374632353792 Bytes) (exactly 731703816 512-Byte-Units)
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
   APFS Volume Group:         A8CFCF6A-E4D8-4876-AB54-A9C888CD1B79
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
/dev/disk2s1 on /System/Volumes/Data (apfs, local, journaled, nobrowse, root data)
map auto_home on /System/Volumes/Data/home (autofs, automounted, nobrowse)
/dev/disk4s1 on /System/Library/AssetsV2/com_apple_MobileAsset_PKITrustStore/purpose_auto/6dd55b0d06633a00de6f57ccb910a66a5ba2409a.asset/.AssetData (apfs, sealed, local, read-only, journaled, nobrowse)
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

    10.14 - Data:

      Free: 374,63 GB (374.632.349.696 bytes)
      Capacity: 1,03 TB (1.027.680.514.048 bytes)
      Mount Point: /System/Volumes/Data
      File System: APFS
      Writable: Yes
      Ignore Ownership: No
      BSD Name: disk2s1
      Volume UUID: A8CFCF6A-E4D8-4876-AB54-A9C888CD1B79
      Physical Drive:
          Device Name: APPLE SSD SM0032L
          Media Name: AppleAPFSMedia
          Medium Type: SSD
          Protocol: PCI-Express
          Internal: Yes
          Partition Map Type: Unknown
          S.M.A.R.T. Status: Verified

    Creedence11M6270.SECUREPKITRUSTSTOREASSETS_SECUREPKITRUSTSTORE_Cryptex:

      Free: 3,1 MB (3.149.824 bytes)
      Capacity: 4,2 MB (4.194.304 bytes)
      Mount Point: /System/Library/AssetsV2/com_apple_MobileAsset_PKITrustStore/purpose_auto/6dd55b0d06633a00de6f57ccb910a66a5ba2409a.asset/.AssetData
      File System: Case-sensitive APFS
      Writable: No
      Ignore Ownership: No
      BSD Name: disk4s1
      Volume UUID: A4B97E21-47AA-4E5E-A5D5-1F7563C37536
      Physical Drive:
          Device Name: Disk Image
          Media Name: AppleAPFSMedia
          Protocol: Disk Image
          Internal: No
          Partition Map Type: Unknown

    Homo Sapiens SSD:

      Free: 374,63 GB (374.632.349.696 bytes)
      Capacity: 1,03 TB (1.027.680.514.048 bytes)
      Mount Point: /
      File System: APFS
      Writable: No
      Ignore Ownership: No
      BSD Name: disk2s4s1
      Volume UUID: F21F8D54-D7D7-468E-8A8D-F51939780075
      Physical Drive:
          Device Name: APPLE SSD SM0032L
          Media Name: AppleAPFSMedia
          Medium Type: SSD
          Protocol: PCI-Express
          Internal: Yes
          Partition Map Type: Unknown
          S.M.A.R.T. Status: Verified

```

## Users permissions

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

## iCloud and CloudStorage indicators

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

Compare this APFS report with the macOS Storage UI before any R4 creation of API_STORAGE directories.
