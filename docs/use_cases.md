# Use Cases & Worked Examples

This document walks through five real scenarios end to end, using the tool's own default inputs (or the specific changes described in each section) and the **actual numbers and warning text the tool generates** — not illustrative approximations. Every figure below was captured from a live run of the application.

---

## 1. Financial Services private cloud (the tool's default profile)

**Scenario:** A CSP is standing up a medium-scale (~50-200 node) private cloud for a financial services tenant. Strict PCI-DSS and SOC 2 controls apply; there's no tolerance for uncontrolled overcommit.

**Step 1 inputs:** Industry Profile = *Financial Services*. This auto-selects:

| Setting | Value |
|---|---|
| Compliance checklist | SOC 2 Type II, PCI-DSS v4.0.1 |
| CPU Overcommit | 3:1 |
| RAM Overcommit | 1:1 (no memory overcommit) |

**Step 2 inputs (defaults):** 400 VMs, 4 vCPUs/VM, 16 GB RAM/VM, 64-core / 256 GB physical nodes, HA buffer of 2.

**Sizing result:**

| Metric | Value |
|---|---|
| Total vCPUs requested | 1,600 |
| Total RAM requested | 6,400 GB |
| Nodes required for CPU | 9 |
| Nodes required for RAM | 25 |
| Raw compute nodes (max of the above) | 25 |
| **Final compute nodes (+ HA buffer)** | **27** |

RAM is the binding constraint here, not CPU — with a 3:1 CPU overcommit but only 1:1 RAM overcommit (a direct consequence of the PCI-DSS/SOC 2 profile forbidding memory overcommit), the cluster needs far more nodes to satisfy RAM demand than CPU demand. This is exactly the kind of tradeoff the sizing engine is meant to surface before a customer proposal goes out.

**Storage (Ceph RBD, default backend):**

| Metric | Value |
|---|---|
| Cinder usable capacity | 150 TB |
| Manila usable capacity | 50 TB |
| Ceph total usable capacity (incl. growth buffer) | 246.0 TB |
| Ceph raw capacity needed (incl. 3x replication) | 984.0 TB |
| Minimum OSD disks (8 TB each) | 132 OSDs |
| Dedicated Ceph storage nodes | 11 |
| Target PGs (Cinder volumes pool) | 4,096 |

**Network fabric (Step 6, default 10 Gbps links):**

| Metric | Value |
|---|---|
| Total switch ports required | 164 |
| Recommended switch ports (20% headroom) | 197 |
| Storage fabric bandwidth | 220 Gbps |
| Overlay/tenant fabric bandwidth | 270 Gbps |

**Live validation, before any remediation:**

> **Compliance Gap (Encryption):** Standards (SOC2, PCI-DSS) require active encryption-at-rest. Enable Barbican in Step 3 to encrypt volumes, images, and ephemeral disks.
>
> **Compliance Gap (Disaster Recovery):** Standards (SOC2, PCI-DSS) mandate backup repositories. Enable Cinder Backup in Step 3.

Both warnings clear the moment Barbican KMS and Cinder Volume Backup are enabled in Step 3 — the validation engine re-evaluates on every keystroke, not on a "submit" action.

**Generated proposal excerpt** (from the actual Step 7 output):

> *"The sized physical hypervisor footprint requires **27 Nova Compute nodes** and a control plane composed of 3 Controller nodes configured in an Active/Active clustering design. The unified storage fabric is sized to accommodate **150 TB of Cinder block volumes** and **50 TB of Manila share file capacity**."*

---

## 2. Healthcare & Life Sciences

**Scenario:** A hospital network needs a HIPAA/GDPR-conscious private cloud for clinical applications and patient-record storage, with strict tenant network isolation.

**Step 1 inputs:** Industry Profile = *Healthcare & Life Sciences*. This auto-selects:

| Setting | Value |
|---|---|
| Compliance checklist | HIPAA Compl., GDPR Data Res. |
| CPU Overcommit | 4:1 |
| RAM Overcommit | 1:1 |

**Selected Profile Impact** (actual tool output):

> *"Healthcare mandates strict project networking isolation, encryption-at-rest for Cinder and Manila shares, and syslog forwarding of admin tokens."*

**What to do differently from the default financial profile:**
- Enable **Barbican KMS** in Step 3 — HIPAA's Security Rule treats encryption-at-rest as an "addressable" (in practice, expected) safeguard for electronic protected health information (ePHI); see [docs/compliance.md](compliance.md) for the current regulatory status.
- Consider **DHSS = True** for Manila in Step 4 if serving multiple untrusted departments/tenants that must not share a storage network — this requires a backend that supports it (NetApp ONTAP in this tool's current backend set; native CephFS and VAST Data do not, and the wizard will block the conflict with a specific warning if you try).
- Keep **SIEM/rsyslog forwarding** configured in Step 6 — the compliance engine expects Keystone token modifications and admin CLI executions to reach a central log target.

---

## 3. Telecom NFV edge platform

**Scenario:** A telecom operator is deploying an edge OpenStack cloud to host Network Function Virtualization (NFV) workloads, where packet loss and failover latency directly affect subscriber-facing SLAs.

**Step 1 inputs:** Industry Profile = *Telecom NFV*. This auto-selects:

| Setting | Value |
|---|---|
| Compliance checklist | UAE NESA IAS (now IAR/IAS v2) |
| CPU Overcommit | 4:1 |
| RAM Overcommit | 1:1 |

**Selected Profile Impact** (actual tool output):

> *"Telecom NFV dictates NESA/UAE IAR-IAS v2 High-Availability controls with link protection, separate data routing planes, and zero packet-drop tuning."*

**What matters for this profile:**
- The 4:1 CPU overcommit ceiling exists specifically to "prevent denial-of-service conditions via resource starvation" (the tool's own live-validation warning text) — NFV workloads are latency-sensitive, and starved CPU scheduling shows up immediately as jitter.
- Consider a higher **Network Interface Link Speed** in Step 6 (25 or 100 Gbps) — NFV data planes are typically far more bandwidth-hungry than a standard tenant VM workload, and the Network Fabric Stats panel will reflect the higher overlay bandwidth requirement immediately.
- Review the **ML2/OVN vs. ML2/OVS** choice in Step 6 carefully for your specific NFV dataplane acceleration requirements (e.g. SR-IOV, DPDK) — see [docs/architecture.md](architecture.md) for how the Neutron driver choice propagates through the generated templates.

---

## 4. Sovereign Government Cloud

**Scenario:** A government agency in a Gulf state requires a cloud that satisfies both Saudi and UAE/Dubai sovereign cloud frameworks simultaneously, with in-country encryption key custody and strict 1:1 resource guarantees.

**Step 1 inputs:** Industry Profile = *Sovereign Gov Cloud*. This auto-selects:

| Setting | Value |
|---|---|
| Compliance checklist | Saudi NCA CCC, Dubai DESC CSP |
| CPU Overcommit | 2:1 |
| RAM Overcommit | 1:1 |
| Manila DHSS | forced to `True` (dynamic per-tenant share server isolation) |

**Selected Profile Impact** (actual tool output):

> *"Sovereign Government Cloud enforces Dubai DESC CSP (ISR v3.0) and Saudi NCA CCC-2:2024 directives. Data residency must remain local, 1:1 resource sizing is enforced, and encryption keys must be handled in-country. Rsyslog SIEM forwarding must capture Keystone token modifications, root CLI access executions, and storage access log payloads."*

**A real conflict the wizard catches automatically:**

The Sovereign profile forces Manila's DHSS setting to `True` for per-tenant isolation, but the tool's *default* Manila backend is CephFS Native — which does **not** support DHSS=True (neither does VAST Data's Manila driver; only NetApp ONTAP does, among this tool's current backend set). If you select this industry profile without also switching the Manila backend to NetApp ONTAP, Step 4 shows:

> *"Warning: the CephFS backend does not support DHSS=True. You must configure DHSS to False for these shares, or switch to NetApp ONTAP."*

...and the **Next** button is disabled specifically on Step 4, with the reason visible right there — not silently, and not on an unrelated step. This is a deliberate design point covered in [docs/architecture.md](architecture.md#state-synchronization-flow): validation gates are always scoped to the step where their explanation is visible.

**2:1 CPU overcommit** is the tightest ceiling of any profile in this tool — a direct reflection of the "no oversubscription of shared sovereign tenant resources" posture common to both the Saudi NCA CCC and Dubai DESC CSP frameworks. Expect a Sovereign Gov Cloud sizing to need noticeably more physical nodes than the same VM count under a Financial Services or Telecom profile.

---

## 5. Multi-vendor storage design with Kubernetes

**Scenario:** An enterprise wants a single OpenStack cloud where legacy virtualized workloads sit on Ceph, a latency-sensitive tier sits on Pure Storage FlashArray, a NetApp estate is being migrated in, and a new Kubernetes-on-OpenStack platform uses VAST Data for both its block PVCs and shared file storage.

**Step 2:** Enable the **Kubernetes VM Sizing Overlay** — set master/worker counts, per-node vCPU/RAM/disk, CNI (Calico or Cilium), and CSI driver (OpenStack Cinder CSI or Ceph-RBD Native CSI).

**Step 3:** Select **all four** of Ceph RBD, NetApp ONTAP, Pure Storage FlashArray, and VAST Data as Cinder backends. Each reveals its own configuration group; the sizing engine adds every non-Ceph backend's capacity as an independent volume pool without inflating the Ceph OSD count.

**What the live topology diagram does differently:** with five or more storage entries active in the diagram at once (four vendors here, or more if StorageGrid object storage is also enabled), the topology renderer automatically switches from its hand-tuned 1-4-block layouts to a generic grid layout that scales up to eight simultaneous backends — see the second example image in [docs/architecture.md](architecture.md#dynamic-svg-topology-dashboard) for exactly what this produces with Ceph + NetApp + Pure + VAST + a Kubernetes overlay all active together.

**Generated `cinder.conf` excerpt for the VAST Data backend** (actual tool output):

```ini
[vast_backend]
# CONSIDERATION: VAST Data driver. NVMe-oF/TCP only, requires VAST cluster release >= 5.3.
volume_driver = cinder.volume.drivers.vastdata.driver.VASTVolumeDriver
volume_backend_name = vast_backend
san_ip = 10.10.30.110
san_api_port = 443
san_login = admin
san_password = VastSecurePass123!
vast_vippool_name = cinder-vip-pool
```

*(The `admin`/placeholder password strings are intentional — this tool generates a structurally-correct config skeleton for you to fill in with your actual vault-managed secrets, not a config meant to be deployed verbatim.)*

**Why VAST Data is worth calling out specifically:** it's the only backend in this tool's storage matrix (besides Ceph itself) that ships an official upstream driver for *both* Cinder block volumes and Manila file shares from a single management plane (the cluster's VMS API) — see [docs/storage_backends.md](storage_backends.md#vast-data) for the full driver/protocol detail. For a design that wants one storage vendor covering both a Kubernetes CSI PVC tier and a legacy NFS share tier, that's a materially simpler operational story than running two separate arrays.

---

## See also

- [docs/sizing_engine.md](sizing_engine.md) — the underlying formulas behind every number in this document.
- [docs/compliance.md](compliance.md) — the full rule set behind every live validation warning.
- [docs/storage_backends.md](storage_backends.md) — driver/protocol/port reference for all seven backends.
- [docs/architecture.md](architecture.md) — how the topology diagram and state pipeline actually work.
