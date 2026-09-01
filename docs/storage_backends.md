# Storage Backend Reference

This tool models seven Cinder (block) and Manila (file) storage backends, each with real upstream OpenStack driver class names, protocols, and ports — sourced from the official OpenStack driver documentation, not vendor marketing material. This document is the detailed companion to the summary table in the [README](../README.md#%EF%B8%8F-storage-backend-support).

Every backend selected in Step 3 (Cinder) or Step 4 (Manila) of the wizard produces a real, correctly-formed stanza in the generated `cinder.conf` / `manila.conf`, is reflected in the live topology diagram's Storage Fabric Tier, and gets its own subsection in the generated Proposal & Design Document and HLD.

---

## Ceph RBD (recommended default)

The only backend that provides both Cinder block storage *and* Manila file storage *and* Glance image storage from a single cluster, and the only backend this tool can independently size (OSD count, node count, PG allocation — see [docs/sizing_engine.md](sizing_engine.md)).

- **Cinder driver:** `cinder.volume.drivers.rbd.RBDDriver`
- **Manila drivers:** `manila.share.drivers.cephfs.driver.CephFSDriver` (Native, or via NFS-Ganesha with `cephfs_protocol_helper_type = NFS`)
- **Protocol:** Native RADOS (librbd), CephFS
- **Ports:** `6789/TCP` (MON), `3300/TCP` (Ceph v2 messenger), `6800-7300/TCP` (OSDs)
- **Manila DHSS:** `False` only — CephFS's native driver does not support dynamically-provisioned share servers.

```ini
[ceph_rbd]
# CONSIDERATION: Ceph RBD Driver for Glance/Cinder Direct VM Disk Ingestion.
volume_driver = cinder.volume.drivers.rbd.RBDDriver
volume_backend_name = ceph_rbd
rbd_pool = volumes
rbd_ceph_conf = /etc/ceph/ceph.conf
rbd_user = cinder
```

---

## NetApp ONTAP

Enterprise hybrid array with iSCSI or NFS protocols and hardware-assisted deduplication/compression. The only non-Ceph backend that supports Manila's `DHSS = True` mode (dynamic per-tenant SVM provisioning) in this tool's current backend set — the backend to reach for when a Sovereign or Healthcare profile's per-tenant isolation requirement needs Manila.

- **Cinder driver:** `cinder.volume.drivers.netapp.common.NetAppDriver`
- **Manila driver:** `manila.share.drivers.netapp.common.NetAppDriver`
- **Protocol:** iSCSI or NFS (selectable)
- **Ports:** `3260/TCP` (iSCSI) or `2049/TCP` (NFS); `443/TCP` (ONTAPI control plane)
- **Manila DHSS:** `True` or `False`, both supported.

```ini
[netapp_backend]
# CONSIDERATION: NetApp ONTAP Unified Driver integration.
volume_driver = cinder.volume.drivers.netapp.common.NetAppDriver
volume_backend_name = netapp_backend
netapp_storage_family = ontap_cluster
netapp_storage_protocol = iscsi
netapp_server_hostname = 10.10.30.50
netapp_server_port = 443
netapp_vserver = svm_cinder_prod
```

---

## Dell EMC PowerFlex

Software-defined elastic block platform. Distinct from the Dell PowerStore/PowerMax backend below — PowerFlex is a scale-out SDS architecture with a lightweight Storage Data Client (SDC) on every compute host, not a traditional dual-controller SAN.

- **Cinder driver:** `cinder.volume.drivers.dell_emc.powerflex.driver.PowerFlexDriver`
- **Manila driver:** none (Cinder block only)
- **Protocol:** proprietary SDC transport
- **Ports:** `7011/TCP` (PowerFlex Storage Data Client API), `443/TCP` (Gateway)

```ini
[powerflex_backend]
# CONSIDERATION: Dell EMC PowerFlex backend.
volume_driver = cinder.volume.drivers.dell_emc.powerflex.driver.PowerFlexDriver
volume_backend_name = powerflex_backend
san_ip = 10.10.30.60
powerflex_storage_pools = sp_gold_cinder
powerflex_server_api_port = 443
```

---

## Pure Storage FlashArray

All-flash array with always-on, non-toggleable deduplication and compression at the controller level. Supports the widest protocol range of any backend in this tool.

- **Cinder driver:** `cinder.volume.drivers.pure.PureISCSIDriver` (iSCSI), `PureFCDriver` (Fibre Channel), or `PureNVMEDriver` (NVMe-oF/RoCE or NVMe-oF/TCP — selectable in Step 3)
- **Manila driver:** **none for FlashArray.** Pure Storage's official Manila support targets the separate **FlashBlade** platform, which this tool does not model. If a design needs both Pure block and Pure file storage, that's two different Pure products.
- **Ports:** `3260/TCP` (iSCSI), Fibre Channel fabric zoning (no IP port), `4420/TCP` (NVMe-oF/TCP), `443/TCP` (REST management)
- **Replication/DR:** asynchronous replication, synchronous replication via a stretched **ActiveCluster Pod**, and 3-site simultaneous sync+async ("Trisync") for regulated multi-site deployments.

```ini
[pure_backend]
# CONSIDERATION: Pure Storage FlashArray driver. Dedup/compression are always-on at the array (not driver-toggled).
volume_driver = cinder.volume.drivers.pure.PureISCSIDriver
volume_backend_name = pure_backend
san_ip = 10.10.30.80
pure_api_token = PURE_API_TOKEN_PLACEHOLDER
```

---

## HPE Alletra / Primera / 3PAR

A single driver codebase spans HPE's entire enterprise SAN lineage from classic 3PAR through the current Alletra MP, version-gated by storage OS release. The Step 3 "Array Platform" selector matters here: it changes the WSAPI management port.

- **Cinder driver:** `cinder.volume.drivers.hpe.hpe_3par_fc.HPE3PARFCDriver` (Fibre Channel) or `hpe_3par_iscsi.HPE3PARISCSIDriver` (iSCSI)
- **Manila driver:** none confirmed for this product line at the time this tool's data was last verified.
- **Ports:** `3260/TCP` (iSCSI), Fibre Channel fabric zoning; WSAPI management is `8080/TCP` on classic **3PAR**, `443/TCP` on **Primera / Alletra 9k / Alletra MP**.
- **Storage efficiency:** Primera/Alletra combine dedup and compression into a single "deco" provisioning mode, mutually exclusive with plain thin provisioning.
- **Replication:** "Peer Persistence" — synchronous, host-transparent failover with a quorum witness for split-brain protection.

```ini
[hpe_backend]
# CONSIDERATION: HPE Primera/Alletra 9k/Alletra MP driver (WSAPI port 443). Requires python-3parclient.
volume_driver = cinder.volume.drivers.hpe.hpe_3par_fc.HPE3PARFCDriver
volume_backend_name = hpe_backend
hpe3par_api_url = https://10.10.30.90:443/api/v1
hpe3par_san_ip = 10.10.30.90
hpe3par_cpg = OpenStack_CPG
```

---

## Dell PowerStore / PowerMax

Dell's traditional unified (PowerStore) and mainframe-class (PowerMax) SAN lineage — architecturally distinct from the scale-out PowerFlex backend above. The Step 3 "Array Platform" selector changes both the driver class and the management architecture entirely.

- **Cinder driver — PowerStore:** `cinder.volume.drivers.dell_emc.powerstore.driver.PowerStoreDriver` (iSCSI, FC, or NVMe-TCP), talking directly to the array's REST gateway.
- **Cinder driver — PowerMax:** `PowerMaxISCSIDriver`, `PowerMaxFCDriver`, or `PowerMaxNVMETCPDriver`, managed through **Unisphere for PowerMax** rather than the array directly — a materially different operational model from PowerStore.
- **Manila driver:** none confirmed for either platform. Dell's historical Manila support targets the separate Unity/PowerScale product line.
- **Ports:** `3260/TCP` (iSCSI), Fibre Channel fabric zoning, `4420/TCP` (NVMe-TCP); management is `443/TCP` (PowerStore direct REST) or `8443/TCP` (PowerMax, via Unisphere).
- **Replication:** PowerStore offers Cinder replication v2.1 with failover plus "Metro volume" active/active clustering; PowerMax offers SRDF Synchronous/Asynchronous/Metro modes.

```ini
[dellps_backend]
# CONSIDERATION: Dell PowerStore driver, direct-to-array REST gateway (port 443).
volume_driver = cinder.volume.drivers.dell_emc.powerstore.driver.PowerStoreDriver
volume_backend_name = dellps_backend
san_ip = 10.10.30.95
storage_protocol = ISCSI
```

---

## VAST Data

Unique among this tool's storage vendors: **the only backend besides Ceph itself with both an official Cinder block driver and an official Manila file driver**, from a single management plane (the cluster's VMS API).

- **Cinder driver:** `cinder.volume.drivers.vastdata.driver.VASTVolumeDriver` — NVMe-oF/TCP only, requires VAST cluster release ≥ 5.3.
- **Manila driver:** `manila.share.drivers.vastdata.driver.VASTShareDriver` — NFS, `driver_handles_share_servers = False` only (same DHSS constraint as native CephFS; the wizard enforces this the same way it does for CephFS).
- **Ports:** `4420/TCP` (NVMe-oF/TCP data path), `443/TCP` (VMS management REST, shared by both the Cinder and Manila drivers).

```ini
[vast_backend]
# CONSIDERATION: VAST Data driver. NVMe-oF/TCP only, requires VAST cluster release >= 5.3.
volume_driver = cinder.volume.drivers.vastdata.driver.VASTVolumeDriver
volume_backend_name = vast_backend
san_ip = 10.10.30.110
san_api_port = 443
vast_vippool_name = cinder-vip-pool
```

```ini
[vast_shares]
# CONSIDERATION: VAST Data NFS share driver. DHSS=False only, no share-server VMs.
share_driver = manila.share.drivers.vastdata.driver.VASTShareDriver
share_backend_name = vast_shares
driver_handles_share_servers = False
vast_mgmt_host = 10.10.30.110
vast_root_export = manila
```

---

## Choosing between backends: a quick decision guide

| If you need... | Consider |
|---|---|
| Zero vendor lock-in, lowest cost, and Manila file storage from the same cluster | **Ceph RBD** |
| Per-tenant dynamic share-server isolation (Manila DHSS=True) | **NetApp ONTAP** — the only backend here that supports it |
| Massive linear scale-out block storage | **Dell EMC PowerFlex** |
| Consistent low-latency all-flash block storage with array-level dedup/compression | **Pure Storage FlashArray** |
| An existing HPE 3PAR/Primera/Alletra estate | **HPE Alletra / Primera / 3PAR** |
| An existing Dell PowerStore or mainframe-attached PowerMax estate | **Dell PowerStore / PowerMax** |
| One vendor covering both Kubernetes CSI block volumes and NFS file shares | **VAST Data** |

You are not limited to one backend — Step 3 and Step 4 are both multi-select. See [Use Case 5: Multi-vendor storage design](use_cases.md#5-multi-vendor-storage-design-with-kubernetes) for a worked example combining four of these at once.

---

## Sourcing note

Driver class names, protocol lists, and port numbers above were verified directly against the official OpenStack Cinder and Manila driver documentation (`docs.openstack.org/cinder`, `docs.openstack.org/manila`) rather than vendor marketing pages. Where a vendor's official Manila support was not confirmed at the time of verification, this document says so explicitly rather than guessing — check the vendor's current documentation before relying on that gap being permanent. Use the **Check for Updates** panel in the running application (or `data/versions.json` directly) to see when this data was last verified.
