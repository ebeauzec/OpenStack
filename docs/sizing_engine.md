# Sizing & Capacity Engine

This document details the mathematical models, formulas, and operational assumptions used by the OpenStack Sizing, Compliance & Design Configurator to calculate infrastructure requirements, implemented in [js/calculator.js](../js/calculator.js). Every worked example below uses the tool's own default input set (the Financial Services profile: 400 VMs, 4 vCPUs/VM, 16 GB RAM/VM, 64-core/256 GB physical nodes, HA buffer of 2) — the same numbers are reproducible by opening the tool with no changes and reading Steps 2, 5, and 6.

---

## 1. Compute Sizing Model

The compute sizing engine aggregates standard virtual machine workloads with optional Kubernetes (OpenShift) worker and control plane overhead to determine the required count of physical hypervisor hosts.

### A. Total Virtual Resource Demands

$$\text{vCPUs}_{\text{Total}} = (\text{VM Count} \times \text{VM vCPUs}) + \text{vCPUs}_{\text{K8s}}$$

$$\text{RAM}_{\text{Total}} = (\text{VM Count} \times \text{VM RAM}) + \text{RAM}_{\text{K8s}}$$

$$\text{Local Disk}_{\text{Total}} = (\text{VM Count} \times \text{VM Disk}) + \text{Disk}_{\text{K8s}}$$

Where Kubernetes resource overhead is added only if the K8s sizing overlay is enabled:

$$\text{vCPUs}_{\text{K8s}} = (\text{Master Count} \times \text{Master vCPUs}) + (\text{Worker Count} \times \text{Worker vCPUs})$$

$$\text{RAM}_{\text{K8s}} = (\text{Master Count} \times \text{Master RAM}) + (\text{Worker Count} \times \text{Worker RAM})$$

$$\text{Disk}_{\text{K8s}} = \text{Worker Count} \times \text{Worker Disk}$$

**Worked example (defaults, K8s disabled):** 400 VMs × 4 vCPUs = **1,600 total vCPUs**. 400 VMs × 16 GB = **6,400 GB total RAM**.

---

### B. Physical Hypervisor Count Calculations

The number of physical compute nodes is the maximum node count required across CPU, RAM, **and local/ephemeral disk** dimensions, factoring in overcommit ratios and the HA buffer:

1. **Effective resources per node** (after overcommit):
   $$\text{Cores}_{\text{Effective}} = \text{Node Cores} \times \text{CPU Overcommit}$$
   $$\text{RAM}_{\text{Effective}} = \text{Node RAM} \times \text{RAM Overcommit}$$

2. **Raw node counts** (each dimension sized independently):
   $$\text{Nodes}_{\text{CPU}} = \lceil \text{vCPUs}_{\text{Total}} / \text{Cores}_{\text{Effective}} \rceil$$
   $$\text{Nodes}_{\text{RAM}} = \lceil \text{RAM}_{\text{Total}} / \text{RAM}_{\text{Effective}} \rceil$$
   $$\text{Nodes}_{\text{Disk}} = \lceil \text{Local Disk}_{\text{Total}} / \text{Node Local Disk} \rceil \quad \text{(only if using local/ephemeral disk on compute nodes)}$$

3. **Final compute host allocation:**
   $$\text{Compute Nodes} = \max(\text{Nodes}_{\text{CPU}}, \text{Nodes}_{\text{RAM}}, \text{Nodes}_{\text{Disk}}) + \text{HA Buffer}$$

   The Step 2 UI only displays the "Nodes Required for Local Disk" row when that dimension is actually the binding constraint — most designs boot from Cinder volumes rather than local ephemeral disk, so it's zero and hidden by default.

**Worked example (defaults: 64 cores/node, 3:1 CPU overcommit, 256 GB RAM/node, 1:1 RAM overcommit, HA buffer 2):**

$$\text{Cores}_{\text{Effective}} = 64 \times 3 = 192 \qquad \text{RAM}_{\text{Effective}} = 256 \times 1 = 256 \text{ GB}$$

$$\text{Nodes}_{\text{CPU}} = \lceil 1600 / 192 \rceil = 9 \qquad \text{Nodes}_{\text{RAM}} = \lceil 6400 / 256 \rceil = 25$$

$$\text{Compute Nodes} = \max(9, 25) + 2 = \mathbf{27}$$

RAM is the binding constraint in the default profile, not CPU — a direct consequence of the Financial Services profile's 1:1 (no-overcommit) RAM policy combined with a 3:1 CPU overcommit. Switching to a profile with a looser RAM overcommit (or a workload with a lower RAM:vCPU ratio) can flip which dimension governs the final node count entirely. This is exactly the kind of tradeoff worth surfacing to a customer during a sizing conversation, not discovering after hardware is racked.

---

## 2. Ceph Storage Sizing Model

The Ceph storage engine plans raw disk metrics based on user capacity targets (in Terabytes) and the chosen storage media, independent of whichever Cinder/Manila backends are actually selected — Ceph is sized whenever it's used for Cinder, Manila (CephFS), or Glance, and *only* the capacity actually routed to Ceph counts (capacity assigned to a non-Ceph backend like NetApp or Pure Storage is excluded from this calculation entirely).

### A. Raw Storage Capacity Planning

$$\text{Total Usable (TB)} = (\text{Cinder-on-Ceph} + \text{Manila-on-Ceph} + \text{Glance}) \times \text{Growth Buffer}$$

$$\text{Raw Capacity (TB)} = \frac{\text{Total Usable (TB)} \times \text{Replica Factor}}{\text{Utilization Limit}}$$

**Worked example (defaults: 150 TB Cinder + 50 TB Manila + 5 TB Glance, 1.2x growth buffer, 3x replica, 75% utilization limit):**

$$\text{Total Usable} = (150 + 50 + 5) \times 1.2 = 246.0 \text{ TB}$$

$$\text{Raw Capacity} = \frac{246.0 \times 3}{0.75} = 984.0 \text{ TB}$$

### B. OSD (Object Storage Daemon) Allocation

$$\text{OSD Count} = \lceil \text{Raw Capacity (TB)} / \text{OSD Size (TB)} \rceil$$

$$\text{Ceph Nodes} = \max\left(\lceil \text{OSD Count} / \text{OSDs per Node} \rceil, \; 3\right)$$

*Node count is floored at 3 (not the replica factor, as an earlier revision of this document stated) — 3 nodes is the minimum for Ceph MON/MGR quorum regardless of the data replica factor chosen.*

**Worked example (defaults: 8 TB OSDs, 12 OSDs/node):**

$$\text{OSD Count} = \lceil 984.0 / 8 \rceil = 123 \rightarrow \textbf{132 OSDs after even-distribution rounding across nodes}$$

$$\text{Ceph Nodes} = \max(\lceil 123 / 12 \rceil, 3) = \max(11, 3) = \mathbf{11}$$

### C. Placement Group (PG) Allocation

Once the final OSD count is known, target PGs are computed per pool using the standard Ceph sizing formula, allocated across four pools by percentage of expected workload (Cinder 50%, Manila 20%, Glance 10%, Nova ephemeral 20%), then rounded up to the nearest power of two per pool with a floor of 16:

$$\text{Target Total PGs} = \frac{\text{Final OSD Count} \times 100}{\text{Replica Factor}}$$

**Worked example:** with 132 OSDs and a 3x replica factor, target total PGs = `(132 × 100) / 3 = 4,400`, split 50/20/10/20 across the four pools and rounded to the nearest power of two per pool. The Cinder volumes pool (50% share, 2,200 raw target) rounds up to **4,096 PGs** — the exact figure the Step 5 sidebar and generated `ceph.conf` both display for the default sizing profile.

---

## 3. Network Fabric Sizing Model

Switch port counts and link capacity recommendations are determined from the final sized node counts and the configured network link speed (Step 6), implemented in `calculateNetwork()`.

### A. Switch Port Requirements

$$\text{Total Ports} = (\text{Compute Nodes} + \text{Ceph Nodes} + \text{Controller Nodes} + \text{StorageGrid Nodes}) \times 4$$

Each node is assumed to need 4 physical switch ports (management, storage front-end, storage back-end/replication, and tenant overlay — matching the six logical subnets defined in Step 6, with some sharing a physical NIC pair). StorageGrid, when active, adds 2 dedicated object-storage nodes to the count.

$$\text{Recommended Switch Ports} = \lceil \text{Total Ports} \times 1.2 \rceil$$

The 20% headroom accounts for redundant/failover ports and near-term scale-out without a second switch procurement cycle.

**Worked example (defaults: 27 compute + 11 Ceph + 3 controller nodes, StorageGrid inactive):**

$$\text{Total Ports} = (27 + 11 + 3) \times 4 = \mathbf{164}$$

$$\text{Recommended} = \lceil 164 \times 1.2 \rceil = \mathbf{197}$$

### B. Storage & Overlay Fabric Bandwidth

$$\text{Storage Fabric Bandwidth (Gbps)} = (\text{Ceph Nodes} + \text{StorageGrid Nodes}) \times \text{Link Speed} \times 2$$

$$\text{Overlay/Tenant Fabric Bandwidth (Gbps)} = \text{Compute Nodes} \times \text{Link Speed}$$

The storage fabric factor of 2 accounts for full-duplex replication traffic (each OSD both sends and receives replica writes); the overlay fabric is sized per compute node at line rate, reflecting worst-case simultaneous tenant traffic.

**Worked example (defaults: 10 Gbps links):**

$$\text{Storage Fabric} = 11 \times 10 \times 2 = \mathbf{220 \text{ Gbps}}$$

$$\text{Overlay Fabric} = 27 \times 10 = \mathbf{270 \text{ Gbps}}$$

Both figures — along with the port counts above — are shown live in the Step 6 **Network Fabric Stats** panel and recalculate immediately if you change the link speed, enable StorageGrid, or adjust any upstream sizing input.

---

## 4. Where these numbers show up downstream

Every figure calculated here flows directly into the Step 7 generated documents — the Proposal & Design Document's Executive Summary states the exact `finalComputeNodes`/Ceph node count in prose, the HLD's IP Planning Table allocates one row per physical node using these exact counts, the **Hardware Bill of Materials** turns the same node counts and per-tier specs into a procurement-ready table (see `generateBOM()` in [js/templates.js](../js/templates.js)), and the Kolla-Ansible inventory / Juju bundle `to:` placement / RHOSO Custom Resource replica counts are all derived from the same numbers — there's a single source of truth from sizing input to generated deployment artifact. See [docs/use_cases.md](use_cases.md) for the numbers rendered in context across all five worked scenarios.
