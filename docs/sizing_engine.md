# Sizing & Capacity Sizing Engine

This document details the mathematical models, formulas, and operational assumptions used by the OpenStack Sizing, Compliance & Design Configurator to calculate infrastructure requirements.

---

## 1. Compute Sizing Model

The compute sizing engine aggregates standard virtual machine workloads with optional Kubernetes (OpenShift) worker and control plane overhead to determine the required count of physical hypervisor hosts.

### A. Total Virtual Resource Demands
The total CPU, RAM, and storage demands are computed as follows:

$$\text{vCPUs}_{\text{Total}} = (\text{VM Count} \times \text{VM vCPUs}) + \text{vCPUs}_{\text{K8s}}$$

$$\text{RAM}_{\text{Total}} = (\text{VM Count} \times \text{VM RAM}) + \text{RAM}_{\text{K8s}}$$

$$\text{Local Disk}_{\text{Total}} = (\text{VM Count} \times \text{VM Disk}) + \text{Disk}_{\text{K8s}}$$

Where Kubernetes resource overhead ($\text{vCPUs}_{\text{K8s}}$, $\text{RAM}_{\text{K8s}}$, $\text{Disk}_{\text{K8s}}$) is added if OpenShift/K8s integration is enabled:

$$\text{vCPUs}_{\text{K8s}} = (\text{Master Count} \times \text{Master vCPUs}) + (\text{Worker Count} \times \text{Worker vCPUs})$$

$$\text{RAM}_{\text{K8s}} = (\text{Master Count} \times \text{Master RAM}) + (\text{Worker Count} \times \text{Worker RAM})$$

$$\text{Disk}_{\text{K8s}} = \text{Worker Count} \times \text{Worker Disk}$$

---

### B. Physical Hypervisor Count Calculations
The number of physical compute nodes is determined by finding the maximum node count required across CPU, RAM, and Local Disk dimensions, factoring in overcommit ratios and High Availability (HA) buffers:

1. **Effective Resources per Node**:
   $$\text{Cores}_{\text{Effective}} = \text{Node Cores} \times \text{CPU Overcommit}$$
   $$\text{RAM}_{\text{Effective}} = \text{Node RAM} \times \text{RAM Overcommit}$$

2. **Raw Node Counts**:
   $$\text{Nodes}_{\text{CPU}} = \lceil \frac{\text{vCPUs}_{\text{Total}}}{\text{Cores}_{\text{Effective}}} \rceil$$
   $$\text{Nodes}_{\text{RAM}} = \lceil \frac{\text{RAM}_{\text{Total}}}{\text{RAM}_{\text{Effective}}} \rceil$$
   $$\text{Nodes}_{\text{Disk}} = \lceil \frac{\text{Local Disk}_{\text{Total}}}{\text{Node Local Disk}} \rceil$$

3. **Final Compute Host Allocation**:
   $$\text{Compute Nodes} = \max(\text{Nodes}_{\text{CPU}}, \text{Nodes}_{\text{RAM}}, \text{Nodes}_{\text{Disk}}) + \text{HA Buffer}$$

---

## 2. Ceph Storage Sizing Model

The Ceph storage engine plans raw disk metrics based on user capacity targets (in Terabytes) and the chosen storage media.

### A. Raw Storage Capacity Planning
To account for data replication and operational thresholds, raw storage capacity is calculated using the replica factor and an operational utilization limit (typically 75%):

$$\text{Raw Capacity (TB)} = \frac{\text{Usable Capacity (TB)} \times \text{Replica Factor}}{\text{Utilization Limit}}$$

### B. OSD (Object Storage Daemon) Allocation
The total number of physical OSD drives and Ceph storage nodes is determined based on disk sizes and drive densities per node:

1. **Total OSD Drives Required**:
   $$\text{OSD Count} = \lceil \frac{\text{Raw Capacity (TB)}}{\text{OSD Size (TB)}} \rceil$$

2. **Ceph Nodes Required**:
   $$\text{Ceph Nodes} = \max\left(\lceil \frac{\text{OSD Count}}{\text{OSDs per Node}} \rceil, \text{Replica Factor}\right)$$

   *Note: The node count is capped at a minimum equal to the replica factor to maintain proper fault domain isolation.*

---

## 3. Network Bandwidth Calculation

Switch link capacity recommendations (e.g., 10 Gbps, 25 Gbps, or 100 Gbps interfaces) are determined by calculating the worst-case aggregate traffic traversing the network fabrics.

### A. Storage Front/Back Network Demands
Ceph storage replication traffic is isolated to the private back-end network. High IOPS/write workloads require greater interface speeds:

$$\text{Back-end Traffic (Gbps)} = \text{OSD Count} \times \text{OSD Write Bandwidth (Gbps)} \times \text{Replica Factor}$$
