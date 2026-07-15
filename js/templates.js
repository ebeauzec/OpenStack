/**
 * OpenStack Architecture & Sizing Tool
 * Templates generator for HLD, LLD, Glance, Nova, Neutron, Keystone, Cinder, Manila, Ceph, Ansible, SIEM, Juju, RHOSP, and Kubernetes.
 */

// Subnet parsing helper to compute host-by-host IP addresses supporting wide masks
export function getIpAddress(subnetCidr, hostIndex) {
  if (!subnetCidr) return '';
  const cleanIp = subnetCidr.split('/')[0];
  const parts = cleanIp.split('.').map(Number);
  if (parts.length !== 4 || parts.some(isNaN)) return subnetCidr;
  
  // Calculate base IP integer value
  const ipNum = parts[0] * 16777216 + parts[1] * 65536 + parts[2] * 256 + parts[3];
  
  // Parse hostIndex as integer to avoid string concatenation
  const indexNum = parseInt(hostIndex, 10) || 0;
  
  // Compute resulting IP integer
  const resultNum = ipNum + indexNum;
  
  // Convert back to dot-decimal
  const octet1 = Math.floor(resultNum / 16777216) % 256;
  const octet2 = Math.floor(resultNum / 65536) % 256;
  const octet3 = Math.floor(resultNum / 256) % 256;
  const octet4 = resultNum % 256;
  
  return `${octet1}.${octet2}.${octet3}.${octet4}`;
}

// Helper to generate dynamic regulatory compliance comment headers
export function getComplianceComments(inputs, service) {
  const compliance = inputs.compliance || [];
  if (compliance.length === 0) return '';

  let comments = `# =====================================================================\n`;
  comments += `# REGULATORY COMPLIANCE COMPONENT AUDIT & ALIGNMENT NOTES\n`;
  comments += `# Active Standards: ${compliance.map(c => c.toUpperCase()).join(', ')}\n`;
  
  let hasDirectives = false;

  if (compliance.includes('nca_cscc')) {
    hasDirectives = true;
    comments += `# [NCA CSCC - Saudi Arabia]:\n`;
    if (service === 'keystone') {
      comments += `#   - CCC-1.4: Strict password complexity and 1-hour token expiration active.\n`;
    } else if (service === 'cinder' || service === 'nova') {
      comments += `#   - CCC-3.2.1.2: Volume Encryption-at-Rest via Barbican KMS is ${inputs.enableBarbican ? 'ENABLED (Compliant)' : 'DISABLED (Non-Compliant - Action Required)'}.\n`;
      comments += `#   - CCC-6.1 / CCC-6.2: Backup & DR replication configured. Bandwidth/RTT constraints verified.\n`;
    } else if (service === 'neutron') {
      comments += `#   - CCC-1.2 / CCC-5.4: Log forwarding shipping all Neutron API/state events to SIEM IP ${inputs.siemIp || '10.10.99.100'}.\n`;
    } else if (service === 'ceph') {
      comments += `#   - CCC-6.1: Ceph replication pool size set to 3 (Min replication of 3 is mandated for data durability).\n`;
    }
  }

  if (compliance.includes('desc_csp')) {
    hasDirectives = true;
    comments += `# [DESC CSP - Dubai]:\n`;
    if (service === 'keystone') {
      comments += `#   - Section 4: Authentication rules aligned. Max token lifetime set to 3600 seconds.\n`;
    } else if (service === 'cinder' || service === 'nova') {
      comments += `#   - Section 5.4: Storage Encryption-at-Rest enabled via Barbican. FIPS 140-2 compliance supported.\n`;
      comments += `#   - Section 11.1 / 11.2: Off-site backups shipped to StorageGrid S3. Active-Passive DR replication active.\n`;
    } else if (service === 'manila') {
      comments += `#   - Section 5.1.3: Manila multi-tenancy isolated share servers (DHSS = ${inputs.manilaDhss === 'true' ? 'True (Compliant)' : 'False (Non-Compliant - DHSS=True required)'}).\n`;
    } else if (service === 'neutron') {
      comments += `#   - Section 6 / 9.2: Neutron security groups stateful OVS driver enforced. Audit log shipping to Syslog active.\n`;
    }
  }

  if (compliance.includes('nesa_ias')) {
    hasDirectives = true;
    comments += `# [NESA IAS - UAE]:\n`;
    comments += `#   - Access Control & Cryptography: Validated secure TLS endpoints, Barbican encryption integration, and SIEM event auditing.\n`;
  }

  if (compliance.includes('pci-dss')) {
    hasDirectives = true;
    comments += `# [PCI-DSS v4.0]:\n`;
    comments += `#   - Requirement 3: Cardholder data at rest must be encrypted. Barbican encryption is ${inputs.enableBarbican ? 'ENABLED (Compliant)' : 'DISABLED (Non-Compliant)'}.\n`;
    comments += `#   - Requirement 8: MFA/Keystone password complexity limits and token duration restricted.\n`;
    comments += `#   - Requirement 10: Event logs sent to central SIEM host ${inputs.siemIp || '10.10.99.100'}.\n`;
  }

  if (compliance.includes('gdpr') || compliance.includes('soc2')) {
    hasDirectives = true;
    comments += `# [GDPR / SOC 2]:\n`;
    comments += `#   - Tenant isolation, log auditing, encryption-at-rest, and DR replicas satisfy security and confidentiality trust principles.\n`;
  }

  if (!hasDirectives) {
    comments += `#   - Baseline security policies enforced.\n`;
  }

  comments += `# =====================================================================\n\n`;
  return comments;
}

// Helper to format lists of placement groups
function formatPgPools(pools) {
  return pools.map(p => `  - Pool: \`${p.name}\` -> PGs: \`${p.pgCount}\` (${p.pct}% target workload)`).join('\n');
}

function generateIpPlanningTable(inputs, computeResult, cephResult) {
  const compNodes = computeResult.finalComputeNodes || 3;
  const cephNodes = cephResult.cephNodes || 3;
  const cinderBackends = inputs.cinderBackends || ['ceph'];
  const manilaBackends = inputs.manilaBackends || ['cephfs_native'];
  const enableStoragegrid = inputs.enableStoragegrid || false;

  const mgmtSubnet = inputs.mgmtSubnet || '10.10.10.0/24';
  const apiSubnet = inputs.apiSubnet || '10.10.20.0/24';
  const storageFrontSubnet = inputs.storageFrontSubnet || '10.10.30.0/24';
  const storageBackSubnet = inputs.storageBackSubnet || '10.10.40.0/24';
  const tenantSubnet = inputs.tenantSubnet || '10.10.50.0/24';
  const extSubnet = inputs.extSubnet || '10.10.100.0/24';

  const ctrlStart = parseInt(inputs.mgmtCtrlStart) || 11;
  const compStart = parseInt(inputs.mgmtCompStart) || 101;
  const cephStart = parseInt(inputs.mgmtCephStart) || 201;

  const isCeph = cinderBackends.includes('ceph') || manilaBackends.some(b => b.startsWith('cephfs'));
  
  let md = `| Hostname | Role | Mgmt (${mgmtSubnet.split('/')[0]}) | Internal API (${apiSubnet.split('/')[0]}) | Storage Front (${storageFrontSubnet.split('/')[0]}) | Storage Back (${storageBackSubnet.split('/')[0]}) | Tenant VTEP (${tenantSubnet.split('/')[0]}) | External API (${extSubnet.split('/')[0]}) |\n`;
  md += `|---|---|---|---|---|---|---|---|\n`;
  
  // Controllers
  for (let i = 1; i <= 3; i++) {
    const suffix = ctrlStart + i - 1;
    md += `| \`controller0${i}\` | Controller (HA) | \`${getIpAddress(mgmtSubnet, suffix)}\` | \`${getIpAddress(apiSubnet, suffix)}\` | \`${getIpAddress(storageFrontSubnet, suffix)}\` | - | \`${getIpAddress(tenantSubnet, suffix)}\` | \`${getIpAddress(extSubnet, suffix)}\` |\n`;
  }
  
  // VIPs
  md += `| \`api-vip\` | Keepalived VIP | - | \`${getIpAddress(apiSubnet, ctrlStart - 1)}\` | - | - | - | \`${getIpAddress(extSubnet, ctrlStart - 1)}\` |\n`;

  // Computes
  for (let i = 1; i <= compNodes; i++) {
    const pad = String(i).padStart(2, '0');
    const suffix = compStart + i - 1;
    md += `| \`compute${pad}\` | Hypervisor | \`${getIpAddress(mgmtSubnet, suffix)}\` | - | \`${getIpAddress(storageFrontSubnet, suffix)}\` | - | \`${getIpAddress(tenantSubnet, suffix)}\` | - |\n`;
  }

  // Ceph Storage nodes
  if (isCeph) {
    for (let i = 1; i <= cephNodes; i++) {
      const pad = String(i).padStart(2, '0');
      const suffix = cephStart + i - 1;
      md += `| \`cephstorage${pad}\` | Ceph OSD Node | \`${getIpAddress(mgmtSubnet, suffix)}\` | - | \`${getIpAddress(storageFrontSubnet, suffix)}\` | \`${getIpAddress(storageBackSubnet, suffix)}\` | - | - |\n`;
    }
  }

  // External Storage Interfaces
  if (cinderBackends.includes('netapp') || manilaBackends.includes('netapp')) {
    md += `| \`netapp-controller\` | NetApp Storage | - | - | \`${inputs.netappIp || getIpAddress(storageFrontSubnet, 250)}\` | - | - | - |\n`;
  }
  if (cinderBackends.includes('emc')) {
    md += `| \`powerflex-gateway\` | Dell EMC Gateway | - | - | \`${inputs.emcIp || getIpAddress(storageFrontSubnet, 251)}\` | - | - | - |\n`;
  }
  if (enableStoragegrid) {
    md += `| \`storagegrid-s3\` | NetApp StorageGrid | - | - | \`${inputs.storagegridIp || getIpAddress(storageFrontSubnet, 252)}\` | - | - | - |\n`;
  }

  return md;
}

export function generateHLD(inputs, computeResult, cephResult) {
  const {
    projectName = 'Enterprise OpenStack Cloud',
    cspScale = 'medium',
    industry = 'financial',
    compliance = ['soc2', 'pci-dss'],
    controllerNodes = 3,
    cinderBackends = ['ceph'],
    manilaBackends = ['cephfs_native'],
    manilaDhss = 'false',
    enableStoragegrid = false,
    openstackDistro = 'kolla',
    openstackVersion = '2024.1',
    enableK8s = false,
    k8sMasterCount = 3,
    k8sWorkerCount = 10
  } = inputs;

  const complianceText = compliance.map(c => c.toUpperCase()).join(', ');

  const distroText = {
    kolla: "Kolla-Ansible Production Orchestrated containers",
    juju: "Canonical Charmed OpenStack (Juju model-driven LCM)",
    rhosp: "Red Hat OpenStack Platform (RHOSP director templates)"
  };

  const scaleText = {
    small: "Small-scale CSP Node (~10-50 Compute Hosts)",
    medium: "Medium-scale CSP Core (~50-200 Compute Hosts)",
    large: "Large/Enterprise Hyperscale Zone (200-1000+ Compute Hosts)"
  };

  const industryText = {
    general: "General Purpose Cloud Hosting Services",
    financial: "Financial Services Hosting (Strict PCI-DSS / DESC v2 Compliance)",
    healthcare: "Healthcare & Life Sciences Hosting (HIPAA/GDPR Data Residency)",
    telecom: "Telecom NFV Edge Platform (NESA High-Availability Mandates)",
    sovereign: "Sovereign Gov Cloud (Saudi NCA CSCC / DESC v2 Compliant)"
  };

  return `# High-Level Design (HLD)
## Project: ${projectName}
**OpenStack Distribution:** ${distroText[openstackDistro]} (Version: ${openstackVersion})
**Industry Profile:** ${industryText[industry]}
**Designed Scale:** ${scaleText[cspScale]}
**Compliance & Security Baseline:** ${complianceText || 'Standard Security'}

---

## 1. Executive Summary
This document defines the high-level architecture and physical sizing for a production-grade OpenStack cloud deployment. Tailored specifically for Cloud Service Provider (CSP) standards, this design guarantees **99.999% infrastructure availability** by employing a fully redundant control plane (3x Controller nodes in HA), segregated network zones, and enterprise-class multi-backend block, file, and object storage systems.

### Sizing and Physical Node Breakdown
- **Nova Compute Hosts:** \`${computeResult.finalComputeNodes}\` physical hypervisors (includes N+${inputs.haBuffer} HA buffer).
- **Control Plane Nodes:** \`${controllerNodes}\` dedicated controllers (Galera DB, RabbitMQ Active-Active HA).
- **Storage Nodes:** \`${cephBackendUsed(cinderBackends, manilaBackends) ? cephResult.cephNodes : 0}\` dedicated Ceph OSD nodes (if Ceph is used).
- **StorageGrid Object Storage:** \`${enableStoragegrid ? 'Integrated S3 Grid' : 'Not Provisioned'}\`.
- **Aggregate Storage Network Bandwidth:** \`${cephResult.cephNodes * inputs.linkSpeedGbps * 2}\` Gbps aggregated backend capacity.
${enableK8s ? `- **Kubernetes Cluster Overlay:** Sized for \`${k8sMasterCount}\` Master and \`${k8sWorkerCount}\` Worker VMs hosted on Nova hypervisors.` : ''}

---

## 2. Core Architecture Topology & Zone Isolation
The OpenStack deployment is split into distinct physical and logical networks (zones) to establish clear traffic boundaries, security isolation, and compliance parameters:

### Core Network Zones Matrix
| Zone Name | VLAN | Encompassed Services & Traffic | Security & Isolation Policies |
|---|---|---|---|
| **Public API Zone** | VLAN 100 | HAProxy Public endpoints, Horizon Web GUI, Octavia load balancer targets. | Exposed to the internet. TLS 1.3 enforced. HSTS headers active. |
| **Management & Deployment** | VLAN 10 | SSH, Ansible execution, monitoring (Prometheus/Grafana), Juju controller / RHOSP Director SSH commands. | Strictly private. Access permitted only via secure VPN gateways or corporate bastions. |
| **Internal API Control Plane** | VLAN 20 | Inter-service API communication (Nova talking to Keystone), Galera DB sync, RabbitMQ messaging. | Fully isolated. Hypervisors (computes) and storage targets are strictly blocked from joining. |
| **Tenant Overlay Data** | VLAN 50 | GENEVE and VXLAN virtual tunnel endpoints (VTEPs) carrying guest VM and K8s node traffic. | Isolated from all physical controllers. Zero routing allowed to storage controllers or management shells. |
| **Storage Frontend Data** | VLAN 30 | QEMU/Libvirt block connections, NetApp iSCSI/NFS LIFs, PowerFlex SDC-to-SDS endpoints, Ceph Public Network. | Dedicated high-bandwidth zone. Jumbo frames (MTU 9000) configured. Blocked from external routing. |
| **Storage Backend (Replication)**| VLAN 40 | Ceph internal OSD-to-OSD data mirroring, disk scrubbing, and cluster heartbeat traffic. | Private Ceph network. Hypervisors (computes) and controllers have zero network interfaces on this VLAN. |

### Architectural Flow Map
\`\`\`
                                  [ INTERNET / USER CLIENT ]
                                              |
                                              | (VLAN 100 - Public API Zone)
                                              v
                                     [ HAProxy / Keepalived ]
                                              |
                                              | (VLAN 20 - Internal API Zone)
                                              v
                                   [ 3x Controllers HA Cluster ]
                                     |                       |
      (VLAN 10 - Management Zone)    |                       | (VLAN 30 - Storage Frontend)
                                     v                       v
                         [ Compute Hypervisors ] <=======> [ Storage Nodes / Arrays ]
                                     |                             |
                                     | (VLAN 50 - Tenant Overlay)  | (VLAN 40 - Storage Backend)
                                     v                             v
                       [ Isolated VMs & K8s Nodes ]        [ Ceph replication / OSDs ]
\`\`\`

---

## 3. Storage Architecture & Business Continuity Decisions

### Cinder Block Storage Backends
${cinderBackends.map(b => `#### Backend: ${b.toUpperCase()}
${getCinderBackendHldDescription(b, inputs)}`).join('\n\n')}

### Manila Shared File Systems
${manilaBackends.map(b => `#### Shared Backend: ${b.toUpperCase()} (DHSS = ${manilaDhss.toUpperCase()})
- **DHSS Choice:** \`driver_handles_share_servers = ${manilaDhss.toUpperCase()}\`
- **Implications & Impact on Backend:**
${getManilaDhssHldDescription(manilaDhss, b)}`).join('\n\n')}

### Business Continuity, Replication & Backup Policies
- **Cinder Volumes Backup:** ${inputs.enableCinderBackup === 'true' ? `Enabled. Vol backups are shipped to **${inputs.cinderBackupTarget === 'storagegrid' ? 'NetApp StorageGrid S3' : 'Ceph Backup Pool'}** using multi-stream compression.` : 'Disabled. (Check compliance checklist; NCA CSCC recommends external volume backup targets).'}
- **Manila Share Replication:** ${inputs.enableManilaReplication === 'true' ? `Active share mirroring configured. NetApp ONTAP handles this via SVM SnapMirror active sync; CephFS utilizes active-passive MDS mirroring daemon.` : 'Not Configured.'}
- **Ceph RBD Mirroring:** For Ceph backends, active-passive asynchronous journaling mirrors RBD images across two geodistributed data centers over WAN interfaces.
- **S3 Data Protection (StorageGrid):** S3 bucket objects replication rules are managed by the StorageGrid Information Lifecycle Management (ILM) engine, ensuring dual-site active replica copies.
- **Cinder Volume Replication (Disaster Recovery):** ${inputs.enableCinderReplication ? `Enabled. Mode: **${inputs.cinderReplMode.toUpperCase()}**. WAN Target: **${inputs.cinderReplTarget}**.
  - *Implications:* ${inputs.cinderReplMode === 'sync' ? 'Synchronous mode guarantees zero data loss (RPO=0) but adds write network latency directly to QEMU write operations. Maximum supported distance is 100km (RTT < 2ms).' : 'Asynchronous mode permits infinite geo-distribution but exposes an RPO equal to the sync replication cycle (e.g. 5 minutes).'}` : 'Disabled.'}
- **Volume Encryption (Barbican KMS):** ${inputs.enableBarbican ? `Enabled. Boot volumes are encrypted using Castellan wrapper and Barbican API key manager.
  - *Implications:* Enhances security compliance (FIPS 140-2 / DESC CSP). Adds a 5-15% CPU load overhead on hypervisors during high disk IOPS workloads due to real-time QEMU decryption.` : 'Disabled.'}
- **Kubernetes Velero Backup:** ${inputs.enableVelero ? 'Enabled. Schedule backups of container namespaces and PV snapshots directly to NetApp StorageGrid S3 buckets.' : 'Disabled.'}

---

## 4. Kubernetes (K8s-on-OpenStack) Architectural Overlay
When Kubernetes integration is active, standard tenant virtual resources are expanded to host containerized workloads:
- **Tenant Control Plane**: 3x HA Master VMs hosted on separate compute hypervisors via Nova server group anti-affinity rules.
- **Persistent Volume Driver**: Dynamically provisioned via the OpenStack Cinder CSI driver, translating K8s PersistentVolumeClaims (PVCs) into Cinder block devices.
- **CNI Networking**: Calico configured to route container traffic directly over the Neutron VLAN/overlay interfaces.
`;
}

export function generateLLD(inputs, computeResult, cephResult) {
  const {
    cinderBackends = ['ceph'],
    manilaBackends = ['cephfs_native'],
    manilaDhss = 'false',
    projectName = 'Enterprise OpenStack Cloud',
    linkSpeedGbps = 10,
    replicaFactor = 3,
    netappSvm = 'svm_openstack',
    netappIp = '10.10.30.50',
    netappProto = 'iscsi',
    emcPool = 'pool_cinder',
    emcIp = '10.10.30.60',
    enableStoragegrid = false,
    storagegridIp = '10.10.30.70',
    storagegridPort = '10443',
    storagegridBucket = 'glance-images',
    storagegridIlm = '2_Copies_Dual_Site',
    compliance = [],
    enableK8s = false,
    k8sCni = 'calico',
    k8sCsi = 'cinder'
  } = inputs;

  const isCephUsed = cephBackendUsed(cinderBackends, manilaBackends);

  return `# Low-Level Design (LLD)
## Project: ${projectName}
**Target Environment:** CSP Highly Available Infrastructure

---

## 1. Network Interface Planning & IP Address Allocation
All hosts (Controllers, Computes, Storage) utilize at least four physical ports bonded into two logical interfaces:
- \`bond0\` (Active/Backup or LACP): Connects to the **Management & API Network**.
- \`bond1\` (LACP): Dedicated to the high-performance **Storage Data & Tenant Overlay Network**.

### Dynamic IP Address Assignment Table
The following table outlines the IP address planning across the sized physical infrastructure:

${generateIpPlanningTable(inputs, computeResult, cephResult)}

### Logical Network Segmentation (VLANs)
| VLAN ID | Subnet Name | Description | MTU | Bandwidth Requirement |
|---|---|---|---|---|
| **VLAN 10** | Management Network | Internal host communication, SSH, Ansible, DB clustering. | 1500 | 1 Gbps |
| **VLAN 20** | Internal API Network | OpenStack service-to-service communication. | 1500 | 10/25 Gbps |
| **VLAN 30** | Storage Frontend Network | VMs and Cinder-volume services reaching Storage targets. | 9000 | 10/25/100 Gbps |
| **VLAN 40** | Storage Backend (Replication) | Ceph internal OSD-to-OSD replication and heartbeats. | 9000 | 25/100 Gbps |
| **VLAN 50** | Tenant Overlay Network | Geneve/VXLAN overlay tunnel endpoints (VTEPs). | 9000 | 10/25 Gbps |
| **VLAN 100**| External/API Public | Public API access, SNAT/DNAT floating IPs. | 1500 | 10/25 Gbps |

---

## 2. Regulatory & Compliance Framework Mapping
Below is the compliance mapping detailing how this architecture drives compliance with Middle East and Global directives:

| Regulatory Directive | Requirement Details | Solution Implementation Measure | Compliance Driver |
|---|---|---|---|
| **Saudi Arabia NCA CSCC-1:2019** | Section CCC-1.1.2: Resource Allocations | Enforced CPU overcommit <= 2:1 and 1:1 RAM mapping on compute nodes. | Resource predictability & prevention of VM starvation. |
| **Saudi Arabia NCA CSCC-1:2019** | Section CCC-1.5.1: Encryption-at-Rest | Active Ceph OSD encryption using \`dm-crypt\` and NetApp Volume Encryption (NVE). | Prevents data leakage from physical disk theft. |
| **Dubai DESC CSP Standard v2.0** | Section 5.1.3: Tenant Data Isolation | Manila \`DHSS = True\` SVM provisioning, separating tenant network namespaces. | Multi-tenant boundary verification and traffic geofencing. |
| **Dubai DESC CSP Standard v2.0** | Section 7.2.1: Log Preservation & Shipping | Rsyslog TLS forwarding of all Keystone auth and audit events to SIEM. | Centralized auditing and non-repudiation tracking. |
| **UAE NESA IAS** | Zone Isolation & Security | strict VLAN separation and LACP bonding on separate physical switch fabrics. | Prevention of lateral movement in case of compromised host. |
| **PCI-DSS v4.0** | Encryption & Token Security | Keystone Fernet tokens rotated daily; SSL/TLS 1.3 enforced on all APIs. | Protects Cardholder Data (CHD) in transit and auth credentials. |
| **GDPR** | Data Residency | Ceph pool CRUSH rules pinned to domestic physical storage hosts only. | Compliance with sovereign borders data processing laws. |

---

## 3. Ports and Network Firewall Matrix
The following TCP/UDP ports must be permitted across interfaces:

### Storage & Shared File Systems TCP/UDP Ports
| Source Zone | Destination Zone | Port / Protocol | Service Name | Purpose |
|---|---|---|---|---|
| Compute Nodes | Storage Cluster | \`6789 / TCP\` | Ceph MON | RADOS cluster management / mapping |
| Compute Nodes | Storage Cluster | \`3300 / TCP\` | Ceph v2 Messenger | Secure RADOS protocol |
| Compute Nodes | Storage Cluster | \`6800-7300 / TCP\` | Ceph OSD | Direct read/write to BlueStore OSDs |
| Compute Nodes | NetApp Controller | \`3260 / TCP\` | iSCSI | Cinder volumes mapping (NetApp iSCSI) |
| Compute Nodes | NetApp / Dell Array | \`2049 / TCP\` | NFS | Cinder NFS / Manila Shared NFS |
| Compute / Tenants| NetApp / Dell Array | \`445 / TCP\` | CIFS/SMB | Manila Shared CIFS (Windows shares) |
| Compute Nodes | Dell PowerFlex | \`7011 / TCP\` | PowerFlex SDC | PowerFlex Storage Data Client API |
| Controller Nodes| NetApp Controller | \`443 / TCP\` | NetApp ONTAPI | Cinder/Manila control plane volume provisioning |
| Glance / Controllers| StorageGrid Endpoint| \`${storagegridPort} / TCP\` | StorageGrid S3 | Object storage API for Glance images |

### Control Plane Management Ports
| Source Zone | Destination Zone | Port / Protocol | Service Name | Purpose |
|---|---|---|---|---|
| Compute Nodes | Controllers | \`8774 / TCP\` | Nova API | Compute management actions |
| Compute Nodes | Controllers | \`9696 / TCP\` | Neutron API | VM network updates |
| Compute Nodes | Controllers | \`8776 / TCP\` | Cinder API | Disk provisioning triggers |
| Compute Nodes | Controllers | \`8786 / TCP\` | Manila API | Share provisioning triggers |
| All Hosts | SIEM / Syslog Server| \`514 / UDP & TCP\` | Rsyslog | Shipping audit and system logs |

${enableK8s ? `### Kubernetes Cluster Traffic Ports
| Source Zone | Destination Zone | Port / Protocol | Service Name | Purpose |
|---|---|---|---|---|
| Worker Nodes | Master Nodes | \`6443 / TCP\` | K8s API Server | Kubelet node status and API communication |
| Master Nodes | Master Nodes | \`2379-2380 / TCP\` | etcd Cluster | Key-value store replication |
| Worker / Master | Worker / Master | \`10250 / TCP\` | Kubelet API | Node agent monitoring |
| Worker / Master | Worker / Master | \`179 / TCP\` | Calico BGP | Dynamic container route advertisement (CNI) |
| Worker / Master | Worker / Master | \`4789 / UDP\` | VXLAN Overlay | Encapsulated pod-to-pod data paths |
` : ''}

---

## 4. Cinder Storage Low-Level Details & Data Flow
The deployment leverages multi-backend block storage arrays. Data flows and configuration limits are detailed below:

${cinderBackends.map(b => `### Backend: ${b.toUpperCase()}
\`\`\`
[ Tenant VM ] (Inside Compute Node)
     |
     | (VirtIO-Block / SCSI Driver)
     v
[ Libvirt / QEMU ] (Nova Compute Host)
     |
     | ===> Data IO Path (Runs on Storage Frontend Network VLAN 30)
     |
     v
+--------------------------------------------------------------------------+
|                        BACKEND STORAGE CONTROLLER                        |
+--------------------------------------------------------------------------+
|  ${b === 'ceph' ? 'Ceph RADOS Cluster (OSDs 6800-7300)' : b === 'netapp' ? `NetApp ONTAP Cluster (SVM - ${netappProto.toUpperCase()} Port ${netappProto === 'iscsi' ? '3260' : '2049'})` : 'Dell EMC PowerFlex MDM/SDS (Port 7011)'} |
+--------------------------------------------------------------------------+
\`\`\`

#### IO Flow Details (${b.toUpperCase()})
- **Control Path:** The user requests a volume attach. \`cinder-api\` validates and writes to the DB. \`cinder-scheduler\` forwards to \`cinder-volume\` managing the selected backend.
- **Data Path:**
${b === 'ceph' ? '  - **Ceph RBD:** Compute node hosts a librbd driver directly in QEMU. QEMU directly contacts OSD ports (`6800-7300`) over the Storage Frontend network.' : b === 'netapp' && netappProto === 'iscsi' ? '  - **NetApp iSCSI:** QEMU/Libvirt initiates an iSCSI session to the target portal (Port 3260). The block device is exposed as a local SCSI block (e.g. `/dev/sdX`) and attached to the VM.' : b === 'netapp' && netappProto === 'nfs' ? '  - **NetApp NFS:** Compute node mounts the NFS share (Port 2049). The VM disk is stored as a `.raw` or `.qcow2` image file on the mounted directory.' : '  - **Dell PowerFlex:** SDC driver intercepts system calls and maps logical volumes directly to block devices over PowerFlex network ports.'}`).join('\n\n')}

---

## 5. Manila Shared File Systems Low-Level Design
Manila manages multi-tenant shared filesystems. The LLD changes based on the **DHSS** configuration:

### DHSS = ${manilaDhss.toUpperCase()} Network Architecture
- **Tenant Share Server Isolation:**
  - ${manilaDhss === 'true' ? 'Manila creates separate Share Servers (VMs or dedicated Storage Virtual Machines - SVMs) inside Neutron networks. The backend array must support dynamic API creation of interfaces/SVMs.' : 'Manila does NOT handle share servers. Manila mounts shares directly on predefined, shared backend interfaces. Tenants mount the shared filesystems from the same storage controller IP.'}
- **Security Implications:**
  - ${manilaDhss === 'true' ? 'High Security (DESC Compliant). Network traffic is completely segregated per tenant via dedicated VLANs. There is zero routing between different tenants\' shares.' : 'Medium Security. Network isolation must be enforced externally at the routing/firewall layer, or shares must be explicitly controlled using CephX auth or export rules.'}

---

## 6. Storage System Native Provisioning & Compliance Guidelines

### A. Ceph Storage Cluster Configuration (Ceph CLI)
Run these commands on the Ceph admin host to provision pools and authorize keys:
\`\`\`bash
# 1. Create standard OpenStack pools
ceph osd pool create images 64 64 replicated
ceph osd pool create vms 128 128 replicated
ceph osd pool create volumes 1024 1024 replicated

# 2. Configure replication limits (compliance audit baseline)
ceph osd pool set volumes size ${replicaFactor}
ceph osd pool set volumes min_size 2

# 3. Create client keyrings with scoped permissions
ceph auth get-or-create client.cinder mon 'profile rbd' osd 'profile rbd pool=volumes, profile rbd pool=vms, profile rbd-read-only pool=images' -o /etc/ceph/ceph.client.cinder.keyring
ceph auth get-or-create client.glance mon 'profile rbd' osd 'profile rbd pool=images' -o /etc/ceph/ceph.client.glance.keyring
\`\`\`

### B. NetApp ONTAP Native Configuration (ONTAP Shell)
Run these commands on the NetApp ONTAP cluster shell to provision SVM and storage endpoints:
\`\`\`bash
# 1. Create dedicated Storage Virtual Machine (SVM)
vserver create -vserver ${netappSvm} -subtype default -ipspace Default

# 2. Enable iSCSI and NFS protocols
vserver modify -vserver ${netappSvm} -protocols iscsi,nfs

# 3. Create logical data interface (LIF) on Storage VLAN 30
network interface create -vserver ${netappSvm} -lif lif_data_01 -service-policy default-data-blocks -home-node node01 -home-port a0a-30 -address ${netappIp} -netmask 255.255.255.0

# 4. Start iSCSI Target service
iscsi create -vserver ${netappSvm} -target-alias target_openstack
iscsi start -vserver ${netappSvm}

# 5. Create NFS export policy rule allowing compute subnet access
vserver export-policy rule create -vserver ${netappSvm} -policyname default -clientmatch 10.10.30.0/24 -protocol nfs3,nfs4 -rorule sys -rwrule sys -superuser sys

# 6. Configure storage efficiency parameters (Deduplication & Compression - DESC v2 Compliant)
volume efficiency modify -vserver ${netappSvm} -volume vol_cinder_* -policy auto -compression true -inline-compression true -dedupe true -inline-dedupe true
\`\`\`

#### Host-Side multipath configuration (\`multipath.conf\` - ALUA Enabled)
\`\`\`ini
devices {
    device {
        vendor                "NETAPP"
        product               "LUN.*"
        path_grouping_policy  "group_by_prio"
        path_checker          "tur"
        features              "2 pg_init_retries 50"
        hardware_handler      "1 alua"
        prio                  "ontap"
        failback              "immediate"
        rr_weight             "uniform"
        rr_min_io_rq          1
        detect_prio           yes
        retain_attached_hw_handler yes
    }
}
\`\`\`

### C. Dell EMC PowerFlex Configuration (PowerFlex CLI)
Run these commands on the PowerFlex MDM nodes to authorize SDC clients and storage volumes:
\`\`\`bash
# 1. Register Compute Hosts (SDC) to MDM cluster
${Array.from({ length: computeResult.finalComputeNodes }).map((_, i) => `scli --add_sdc --sdc_ip ${getIpAddress(inputs.storageFrontSubnet || '10.10.30.0/24', (parseInt(inputs.mgmtCompStart) || 101) + i)} --sdc_name compute${String(i+1).padStart(2, '0')}`).slice(0, 3).join('\n')}
# ... [repeated for all ${computeResult.finalComputeNodes} Compute Hosts] ...

# 2. Create Storage Pool mapping
scli --add_storage_pool --protection_domain_name pd01 --storage_pool_name ${emcPool}

# 3. Enable high performance multipath parameters
scli --set_performance_parameters --sdc_all --performance_profile high_performance
\`\`\`

${enableStoragegrid ? `### D. NetApp StorageGrid Configuration (StorageGrid Shell / API)
Run these configuration guidelines for StorageGrid:
\`\`\`bash
# 1. Create S3 Storage Tenant
storagegrid tenant create --name "openstack-tenant" --protocol s3 --allow-platform-services true

# 2. Create S3 Bucket for Glance Images
storagegrid s3 create-bucket --tenant "openstack-tenant" --bucket "${storagegridBucket}"

# 3. Apply Information Lifecycle Management (ILM) Replication Policy (DESC Compliant)
# Enforces that all Glance images are replicated twice across separate datacenters
storagegrid ilm rule create --name "${storagegridIlm}" --match-all --replicate 2 --locations "site1,site2"
\`\`\`
` : ''}

---

${isCephUsed ? `## 7. Ceph Cluster Storage Architecture & Placement Groups
### OSD Layout and CRUSH Rules
- **Total Physical OSDs:** \`${cephResult.finalOsdCount}\` disks.
- **Drive Size:** \`${inputs.osdSizeTb}\` TB.
- **Total OSD Nodes:** \`${cephResult.cephNodes}\` hosts.
- **OSD Media:** \`${inputs.osdMedia.toUpperCase()}\`.
- **Target CRUSH Failure Domain:** \`host\` (Allows any single host to fail completely without data loss).

### PG Configuration
For optimal performance, the PG count must match the next power of 2 from the target allocation.
${formatPgPools(cephResult.pools)}
` : ''}
`;
}

export function generateAnsible(inputs, computeResult, cephResult) {
  const {
    cinderBackends = ['ceph'],
    manilaBackends = ['cephfs_native'],
    enableStoragegrid = false
  } = inputs;

  const isCeph = cephBackendUsed(cinderBackends, manilaBackends);
  const mgmtSubnet = inputs.mgmtSubnet || '10.10.10.0/24';
  const apiSubnet = inputs.apiSubnet || '10.10.20.0/24';
  const ctrlStart = parseInt(inputs.mgmtCtrlStart) || 11;
  const compStart = parseInt(inputs.mgmtCompStart) || 101;
  const cephStart = parseInt(inputs.mgmtCephStart) || 201;

  return `# Kolla-Ansible Production Inventory & Global Configuration
# Reference: Operational HLD/LLD Deployment Automation

---
# File: /etc/kolla/inventory/multinode
[control]
# Dedicated high-availability controllers
controller01 ansible_host=${getIpAddress(mgmtSubnet, ctrlStart)} ansible_user=kolla
controller02 ansible_host=${getIpAddress(mgmtSubnet, ctrlStart + 1)} ansible_user=kolla
controller03 ansible_host=${getIpAddress(mgmtSubnet, ctrlStart + 2)} ansible_user=kolla

[network]
controller01
controller02
controller03

[compute]
# Dynamic list of Compute Nodes based on sizing (${computeResult.finalComputeNodes} Nodes)
${Array.from({ length: computeResult.finalComputeNodes }).map((_, i) => `compute${String(i+1).padStart(2, '0')} ansible_host=${getIpAddress(mgmtSubnet, compStart + i)} ansible_user=kolla`).join('\n')}

[monitoring]
controller01

[storage]
# Storage controllers/gateways (Ansible connects via Management network)
${isCeph ? Array.from({ length: cephResult.cephNodes }).map((_, i) => `cephstorage${String(i+1).padStart(2, '0')} ansible_host=${getIpAddress(mgmtSubnet, cephStart + i)} ansible_user=kolla`).join('\n') : '# External Storage arrays configured directly via driver APIs'}

---
# File: /etc/kolla/globals.yml
---
kolla_base_distro: "ubuntu"
kolla_install_type: "source"
openstack_release: "2024.1" # Caracal

# HA configuration
kolla_internal_vip_address: "${getIpAddress(apiSubnet, ctrlStart - 1)}"
kolla_external_vip_address: "${getIpAddress(inputs.extSubnet || '10.10.100.0/24', ctrlStart - 1)}"
enable_haproxy: "yes"
keepalived_virtual_router_id: "51"

# Core OpenStack Services
enable_cinder: "yes"
enable_manila: "yes"
enable_neutron: "yes"
enable_nova: "yes"
enable_glance: "yes"
enable_keystone: "yes"

# Storage Backends Integration
cinder_backend_ceph: "${cinderBackends.includes('ceph') ? 'yes' : 'no'}"
enable_cinder_backend_netapp: "${cinderBackends.includes('netapp') ? 'yes' : 'no'}"
enable_cinder_backend_dell_emc: "${cinderBackends.includes('emc') ? 'yes' : 'no'}"

# Manila (Shared File Systems) Backend Selection
manila_backend_cephfs: "${manilaBackends.some(b => b.startsWith('cephfs')) ? 'yes' : 'no'}"
enable_manila_backend_netapp: "${manilaBackends.includes('netapp') ? 'yes' : 'no'}"

# Glance Object Backend Selection
glance_backend_s3: "${enableStoragegrid ? 'yes' : 'no'}"

# Logging & External SIEM Forwarding
enable_central_logging: "yes"
openstack_logging_debug: "no"
`;
}

export function generateJujuBundle(inputs) {
  const {
    cpuOvercommit = 3,
    ramOvercommit = 1,
    manilaDhss = 'false'
  } = inputs;

  return `# Canonical Juju Bundle - bundle.yaml
# Dynamic configuration bundle for Canonical Charmed OpenStack
series: jammy
applications:
  mysql:
    charm: ch:mysql-innodb-cluster
    num_units: 3
    to:
      - 'lxd:0'
      - 'lxd:1'
      - 'lxd:2'
  rabbitmq-server:
    charm: ch:rabbitmq-server
    num_units: 3
    to:
      - 'lxd:0'
      - 'lxd:1'
      - 'lxd:2'
  keystone:
    charm: ch:keystone
    num_units: 3
    options:
      token-provider: fernet
    to:
      - 'lxd:0'
      - 'lxd:1'
      - 'lxd:2'
  nova-cloud-controller:
    charm: ch:nova-cloud-controller
    num_units: 3
    options:
      cpu-allocation-ratio: ${cpuOvercommit}
      ram-allocation-ratio: ${ramOvercommit}
    to:
      - 'lxd:0'
      - 'lxd:1'
      - 'lxd:2'
  nova-compute:
    charm: ch:nova-compute
    options:
      enable-resize: true
      enable-live-migration: true
  cinder:
    charm: ch:cinder
    num_units: 3
    options:
      default-volume-type: ceph_rbd
    to:
      - 'lxd:0'
      - 'lxd:1'
      - 'lxd:2'
  manila:
    charm: ch:manila
    num_units: 3
    options:
      driver-handles-share-servers: ${manilaDhss === 'true' ? 'True' : 'False'}
    to:
      - 'lxd:0'
      - 'lxd:1'
      - 'lxd:2'
relations:
  - - keystone:shared-db
    - mysql:shared-db
  - - nova-cloud-controller:amqp
    - rabbitmq-server:amqp
  - - cinder:image-service
    - glance:image-service
`;
}

export function generateRhospTemplates(inputs) {
  const {
    cpuOvercommit = 3,
    ramOvercommit = 1,
    apiSubnet = '10.10.20.0/24',
    mgmtSubnet = '10.10.10.0/24',
    openstackVersion = '2024.1'
  } = inputs;

  if (openstackVersion === '18.0') {
    return `# Red Hat OpenStack Services on OpenShift (RHOSO) 18.0 Custom Resource
# File: openstack-control-plane.yaml
apiVersion: core.openstack.org/v1beta1
kind: OpenStackControlPlane
metadata:
  name: openstack-control-plane
  namespace: openstack
spec:
  secret: osp-secret
  storageClass: ${inputs.cinderBackends && inputs.cinderBackends.includes('ceph') ? 'ocs-storagecluster-ceph-rbd' : 'local-storage'}
  
  keystone:
    template:
      databaseInstance: openstack
      secret: osp-secret

  placement:
    template:
      databaseInstance: openstack
      secret: osp-secret

  glance:
    template:
      databaseInstance: openstack
      customServiceConfig: |
        [DEFAULT]
        enabled_backends = default_backend:rbd
        [default_backend]
        rbd_store_pool = images
        store_description = Ceph RBD image store
      storageClass: local-storage
      storageRequest: ${inputs.glanceCapacityTb || 5}Gi

  cinder:
    template:
      databaseInstance: openstack
      secret: osp-secret
      cinderAPI:
        replicas: ${inputs.haBuffer || 2}
      cinderScheduler:
        replicas: ${inputs.haBuffer || 2}
      cinderBackup:
        replicas: ${inputs.enableCinderBackup === 'true' || inputs.enableCinderBackup === true ? (inputs.haBuffer || 2) : 0}
      cinderVolumes:
        ceph-backend:
          customServiceConfig: |
            [ceph-backend]
            volume_backend_name = ceph
            volume_driver = cinder.volume.drivers.rbd.RBDDriver
            rbd_pool = volumes
            rbd_user = openstack
            rbd_secret_uuid = $secret_uuid

  nova:
    template:
      secret: osp-secret
      databaseInstance: openstack
      metadataServiceTemplate:
        replicas: ${inputs.haBuffer || 2}
      novaAPI:
        replicas: ${inputs.haBuffer || 2}
      novaConductor:
        replicas: ${inputs.haBuffer || 2}
      novaScheduler:
        replicas: ${inputs.haBuffer || 2}
      # Allocation ratios configuration
      customServiceConfig: |
        [DEFAULT]
        cpu_allocation_ratio = ${cpuOvercommit}.0
        ram_allocation_ratio = ${ramOvercommit}.0

  neutron:
    template:
      databaseInstance: openstack
      secret: osp-secret
      neutronAPI:
        replicas: ${inputs.haBuffer || 2}

  rabbitmq:
    templates:
      rabbitmq:
        replicas: ${inputs.haBuffer || 2}
`;
  }

  const ctrlStart = parseInt(inputs.mgmtCtrlStart) || 11;

  return `# Red Hat OpenStack director (TripleO) Environment file
# File: network-environment.yaml
parameter_defaults:
  # Overcommit parameters
  NovaCpuAllocationRatio: ${cpuOvercommit}.0
  NovaRamAllocationRatio: ${ramOvercommit}.0

  # IP Addressing VIP boundaries
  ControlPlaneDefaultRoute: ${getIpAddress(mgmtSubnet, 1)}
  EC2MetadataIp: ${getIpAddress(mgmtSubnet, 1)}
  
  # Static VIP assignments
  InternalApiVirtualFixedIPs:
    - ip_address: ${getIpAddress(apiSubnet, ctrlStart - 1)}
  PublicVirtualFixedIPs:
    - ip_address: ${getIpAddress(inputs.extSubnet || '10.10.100.0/24', ctrlStart - 1)}

  # VLAN interface configurations mapping
  ControlPlaneSubnetCidr: ${mgmtSubnet.split('/')[1]}
  InternalApiNetworkVlanID: 20
  StorageNetworkVlanID: 30
  StorageMgmtNetworkVlanID: 40
  TenantNetworkVlanID: 50
  ExternalNetworkVlanID: 100

# File: overcloud_deploy.sh
# Run this script to execute RHOSP deployment
# openstack overcloud deploy \\
#   --templates \\
#   -e /usr/share/openstack-tripleo-heat-templates/environments/network-isolation.yaml \\
#   -e network-environment.yaml \\
#   -e /usr/share/openstack-tripleo-heat-templates/environments/storage-ceph.yaml
`;
}

export function generateK8sCsi(inputs) {
  return `# Kubernetes Cinder CSI StorageClass & Driver config
# File: cinder-csi.yaml
apiVersion: storage.k8s.io/v1
kind: StorageClass
metadata:
  name: openstack-cinder-sc
  annotations:
    storageclass.kubernetes.io/is-default-class: "true"
provisioner: cinder.csi.openstack.org
volumeBindingMode: WaitForFirstConsumer
allowVolumeExpansion: true
parameters:
  # Targets Cinder volume type defined in cinder.conf
  type: ceph_rbd
  availability: Nova
---
apiVersion: storage.k8s.io/v1
kind: CSIDriver
metadata:
  name: cinder.csi.openstack.org
spec:
  attachRequired: true
  podInfoOnMount: true
  volumeLifecycleModes:
    - Persistent
`;
}

export function generateCloudConfig(inputs) {
  const {
    apiSubnet = '10.10.20.0/24'
  } = inputs;

  const ctrlStart = parseInt(inputs.mgmtCtrlStart) || 11;

  return `# Kubernetes OpenStack Cloud Provider Configuration
# File: /etc/kubernetes/cloud-config
[Global]
# Auth API pointing to the HA Keystone VIP on Internal API (VLAN 20)
auth-url = https://${getIpAddress(apiSubnet, ctrlStart - 1)}:5000/v3
username = k8s-cloud-provider
password = K8sSecretPass123!
project-name = k8s-project
domain-name = Default
region = RegionOne

[BlockStorage]
# Cinder v3 block volume configurations
bs-version = v3
trust-device-path = false
ignore-volume-az = true
`;
}

export function generateCinderConf(inputs) {
  const {
    cinderBackends = ['ceph'],
    netappIp = '10.10.30.50',
    netappSvm = 'svm_cinder_prod',
    netappProto = 'iscsi',
    emcIp = '10.10.30.60',
    emcPool = 'sp_gold_cinder',
    apiSubnet = '10.10.20.0/24',
    netappDedup = 'true',
    netappCompression = 'true',
    enableCinderBackup = 'false',
    cinderBackupTarget = 'storagegrid',
    storagegridIp = '10.10.30.70',
    storagegridPort = '10443',
    storagegridBucket = 'cinder-backups',
    storagegridAccessKey = 'SG_ACCESS_KEY_ID',
    storagegridSecretKey = 'SG_SECRET_ACCESS_KEY',
    enableBarbican = false,
    barbicanBackend = 'vault',
    enableCinderReplication = false,
    cinderReplTarget = '10.20.30.50',
    cinderReplMode = 'async',
    cinderMultiAttach = false,
    cinderQosEnable = false,
    cinderQosMaxIops = 5000,
    cinderQosMaxBps = 104857600,
    compliance = []
  } = inputs;

  const ctrlStart = parseInt(inputs.mgmtCtrlStart) || 11;

  let enabledBackendsList = [];
  let backendsConfigs = '';

  const multiAttachDefault = cinderMultiAttach ? '\nenable_force_upload = true' : '';
  const cephMultiAttach = cinderMultiAttach ? '\nrbd_exclusive_cbs = false\nrbd_exclusive_lock = false' : '';

  if (cinderBackends.includes('ceph')) {
    enabledBackendsList.push('ceph_rbd');
    backendsConfigs += `\n[ceph_rbd]
# CONSIDERATION: Ceph RBD Driver for Glance/Cinder Direct VM Disk Ingestion.
volume_driver = cinder.volume.drivers.rbd.RBDDriver
volume_backend_name = ceph_rbd
rbd_pool = volumes
rbd_ceph_conf = /etc/ceph/ceph.conf
rbd_flatten_volume_from_snapshot = false
rbd_max_clone_depth = 5
rbd_store_chunk_size = 4
rados_connect_timeout = -1
rbd_user = cinder
rbd_secret_uuid = 4a9f3d9d-64bc-4d82-824f-9e73b22b10a2
${enableCinderReplication ? `replication_device = backend_id:ceph_rbd_replica,conf:/etc/ceph/ceph.conf,user:cinder-replica,pool:volumes` : ''}${cephMultiAttach}\n`;
  }

  if (cinderBackends.includes('netapp')) {
    enabledBackendsList.push('netapp_backend');
    backendsConfigs += `\n[netapp_backend]
# CONSIDERATION: NetApp ONTAP Unified Driver integration.
volume_driver = cinder.volume.drivers.netapp.common.NetAppDriver
volume_backend_name = netapp_backend
netapp_storage_family = ontap_cluster
netapp_storage_protocol = ${netappProto}
netapp_server_hostname = ${netappIp}
netapp_server_port = 443
netapp_user_name = admin
netapp_password = NetAppSecurePass123!
netapp_vserver = ${netappSvm}
netapp_lun_space_reservation = false
netapp_dedup = ${netappDedup}
netapp_compression = ${netappCompression}
${netappProto === 'nfs' ? 'nfs_shares_config = /etc/cinder/nfs_shares' : ''}
${enableCinderReplication ? `netapp_replication_device = target_device_ip:${cinderReplTarget},vserver:${netappSvm}_replica,username:admin,password:NetAppSecurePass123!,sync_type=${cinderReplMode === 'sync' ? 'sync' : 'async'}` : ''}\n`;
  }

  if (cinderBackends.includes('emc')) {
    enabledBackendsList.push('powerflex_backend');
    backendsConfigs += `\n[powerflex_backend]
# CONSIDERATION: Dell EMC PowerFlex backend.
volume_driver = cinder.volume.drivers.dell_emc.powerflex.driver.PowerFlexDriver
volume_backend_name = powerflex_backend
san_ip = ${emcIp}
san_login = admin
san_password = PowerFlexSecurePass123!
powerflex_storage_pools = ${emcPool}
powerflex_server_api_port = 443
powerflex_round_robin_device_numbering = true
powerflex_allow_non_disruptive_volume_refresh = true\n`;
  }

  const enabledBackendsStr = enabledBackendsList.join(', ');
  const defaultVolumeType = enabledBackendsList[0] || 'ceph_rbd';

  // Backup configuration block
  let backupConfig = '';
  if (enableCinderBackup === 'true') {
    if (cinderBackupTarget === 'storagegrid') {
      backupConfig = `
[backup]
# ADVANCED PROTECTION: Cinder Backups to StorageGrid S3 Object store
backup_driver = cinder.backup.drivers.s3.S3BackupDriver
backup_s3_store_host = https://${storagegridIp}:${storagegridPort}/
backup_s3_store_access_key = ${storagegridAccessKey}
backup_s3_store_secret_key = ${storagegridSecretKey}
backup_s3_store_bucket = ${storagegridBucket}
backup_s3_store_create_bucket_on_put = true
backup_s3_store_cacert = /etc/ssl/certs/StorageGrid_CA.pem
backup_compression_algorithm = zlib`;
    } else {
      backupConfig = `
[backup]
# ADVANCED PROTECTION: Cinder Backups to dedicated Ceph RADOS pool
backup_driver = cinder.backup.drivers.ceph.CephBackupDriver
backup_ceph_conf = /etc/ceph/ceph.conf
backup_ceph_user = cinder-backup
backup_ceph_pool = backups
backup_ceph_stripe_unit = 4194304
backup_ceph_stripe_count = 8
backup_compression_algorithm = zlib`;
    }
  }

  let barbicanConfig = '';
  if (enableBarbican) {
    barbicanConfig = `
[key_manager]
# KEY MANAGEMENT INTEGRATION: Encrypts virtual disks using Barbican KMS.
# Performance implications: QEMU/dm-crypt introduces a 5-15% CPU hypervisor overhead.
backend = barbican
api_class = castellan.key_manager.barbican_key_manager.BarbicanKeyManager
barbican_api_endpoint = https://${getIpAddress(apiSubnet, ctrlStart - 1)}:9311
barbican_auth_type = keystone

# Selected KMS Backend: ${barbicanBackend.toUpperCase()}
# Refer to the deployment guide tab for steps to register keys in ${barbicanBackend === 'vault' ? 'HashiCorp Vault' : barbicanBackend === 'softhsm' ? 'SoftHSMv2' : 'Hardware HSM'}.`;
  }

  let qosConfig = '';
  if (cinderQosEnable) {
    qosConfig = `
# CINDER QOS VOLUMES THROTTLING ACTIVE
# Target Limits: Max IOPS = ${cinderQosMaxIops}, Max BPS = ${cinderQosMaxBps}
# Note: Admin must create corresponding QoS specs in OpenStack:
#   openstack volume qos create --property maxIOPS=${cinderQosMaxIops} --property maxBPS=${cinderQosMaxBps} qos-limits
#   openstack volume qos associate qos-limits <volume_type_uuid>`;
  }

  return `${getComplianceComments(inputs, 'cinder')}# /etc/cinder/cinder.conf
# Dynamic configuration for OpenStack Cinder backends

[database]
connection = mysql+pymysql://cinder:CinderPass123!@${getIpAddress(apiSubnet, ctrlStart - 1)}/cinder

[keystone_authtoken]
www_authenticate_uri = https://${getIpAddress(inputs.extSubnet || '10.10.100.0/24', ctrlStart - 1)}:5000
auth_url = https://${getIpAddress(apiSubnet, 10)}:5000
memcached_servers = ${getIpAddress(apiSubnet, ctrlStart)}:11211,${getIpAddress(apiSubnet, ctrlStart + 1)}:11211,${getIpAddress(apiSubnet, ctrlStart + 2)}:11211
auth_type = password
project_domain_name = Default
user_domain_name = Default
project_name = service
username = cinder
password = CinderServicePass123!

[DEFAULT]
enabled_backends = ${enabledBackendsStr}
default_volume_type = ${defaultVolumeType}${multiAttachDefault}
${backendsConfigs}
${backupConfig}
${barbicanConfig}
${qosConfig}
`;
}

export function generateManilaConf(inputs) {
  const {
    manilaBackends = ['cephfs_native'],
    manilaDhss = 'false',
    netappIp = '10.10.30.50',
    netappSvm = 'svm_manila_shares',
    apiSubnet = '10.10.20.0/24',
    enableManilaReplication = 'false',
    compliance = []
  } = inputs;

  const ctrlStart = parseInt(inputs.mgmtCtrlStart) || 11;

  let enabledBackendsList = [];
  let backendConfig = '';
  const dhssBool = manilaDhss === 'true' ? 'True' : 'False';

  if (manilaBackends.includes('cephfs_native')) {
    enabledBackendsList.push('cephfs_native');
    backendConfig += `\n[cephfs_native]
share_driver = manila.share.drivers.cephfs.driver.CephFSDriver
share_backend_name = cephfs_native
cephfs_conf_path = /etc/ceph/ceph.conf
cephfs_auth_id = manila
cephfs_cluster_name = ceph
cephfs_enable_snapshots = True
driver_handles_share_servers = False\n`;
  }

  if (manilaBackends.includes('cephfs_ganesha')) {
    enabledBackendsList.push('cephfs_nfs');
    backendConfig += `\n[cephfs_nfs]
share_driver = manila.share.drivers.cephfs.driver.CephFSDriver
share_backend_name = cephfs_nfs
cephfs_conf_path = /etc/ceph/ceph.conf
cephfs_auth_id = manila
cephfs_cluster_name = ceph
driver_handles_share_servers = False
cephfs_protocol_helper_type = NFS
cephfs_nfs_cluster_id = ganesha-nfs-cluster\n`;
  }

  if (manilaBackends.includes('netapp')) {
    enabledBackendsList.push('netapp_shares');
    backendConfig += `\n[netapp_shares]
share_driver = manila.share.drivers.netapp.common.NetAppDriver
share_backend_name = netapp_shares
netapp_storage_family = ontap_cluster
netapp_server_hostname = ${netappIp}
netapp_server_port = 443
netapp_user_name = admin
netapp_password = NetAppSecurePass123!
driver_handles_share_servers = ${dhssBool}
${manilaDhss === 'false' ? `netapp_vserver = ${netappSvm}` : '# SVM dynamically managed and created by Manila driver over Neutron vlan segmentation'}
# BUSINESS CONTINUITY: Manila Share replication (SnapMirror)
${enableManilaReplication === 'true' ? 'replica_state_update_interval = 300\nreplication_domain = snapmirror_dr_domain' : ''}\n`;
  }

  const enabledBackendsStr = enabledBackendsList.join(', ');
  const enabledProtocols = manilaBackends.includes('netapp') ? 'NFS, CIFS, CEPHFS' : 'CEPHFS, NFS';

  return `${getComplianceComments(inputs, 'manila')}# /etc/manila/manila.conf
# Dynamic configuration for OpenStack Manila backend

[database]
connection = mysql+pymysql://manila:ManilaPass123!@${getIpAddress(apiSubnet, ctrlStart - 1)}/manila

[keystone_authtoken]
www_authenticate_uri = https://${getIpAddress(inputs.extSubnet || '10.10.100.0/24', ctrlStart - 1)}:5000
auth_url = https://${getIpAddress(apiSubnet, 10)}:5000
memcached_servers = ${getIpAddress(apiSubnet, ctrlStart)}:11211,${getIpAddress(apiSubnet, ctrlStart + 1)}:11211,${getIpAddress(apiSubnet, ctrlStart + 2)}:11211
auth_type = password
project_domain_name = Default
user_domain_name = Default
project_name = service
username = manila
password = ManilaServicePass123!

[DEFAULT]
enabled_share_backends = ${enabledBackendsStr}
enabled_share_protocols = ${enabledProtocols}
${backendConfig}
`;
}

export function generateCephConf(inputs, cephResult) {
  const {
    replicaFactor = 3,
    osdMedia = 'ssd',
    enableCinderReplication = false,
    compliance = []
  } = inputs;

  const storageFrontSubnet = inputs.storageFrontSubnet || '10.10.30.0/24';
  const storageBackSubnet = inputs.storageBackSubnet || '10.10.40.0/24';
  const cephStart = parseInt(inputs.mgmtCephStart) || 201;

  // Enforce replica size minimum of 3 for critical compliance standards
  const isSovereign = compliance.includes('nca_cscc') || compliance.includes('desc_csp');
  const finalReplicaFactor = isSovereign ? Math.max(3, replicaFactor) : replicaFactor;

  return `${getComplianceComments(inputs, 'ceph')}# /etc/ceph/ceph.conf
# Dynamic configuration for Ceph Storage cluster

[global]
fsid = d3b3f27f-94d7-40c2-9e90-2580a13e51fe
mon_initial_members = cephmon01, cephmon02, cephmon03
mon_host = ${getIpAddress(storageFrontSubnet, cephStart)}, ${getIpAddress(storageFrontSubnet, cephStart + 1)}, ${getIpAddress(storageFrontSubnet, cephStart + 2)}
auth_cluster_required = cephx
auth_service_required = cephx
auth_client_required = cephx

public_network = ${storageFrontSubnet}
cluster_network = ${storageBackSubnet}

osd_pool_default_size = ${finalReplicaFactor}
osd_pool_default_min_size = 2
${isSovereign && replicaFactor < 3 ? '# Compliance Override: pool default size forced to 3 (NCA CSCC CCC-6.1 / DESC CSP Sec 11.2)\n' : ''}
enable_experimental_unrecoverable_data_corrupting_features = ""
bluestore_block_db_size = ${osdMedia === 'hdd' ? '21474836480' : '0'}
bluestore_block_wal_size = ${osdMedia === 'hdd' ? '5368709120' : '0'}
osd_memory_target = ${osdMedia === 'nvme' ? '8589934592' : '4294967296'}

[mon]
mon_allow_pool_delete = false
mon_warn_on_legacy_crush_tunables = true

[osd]
osd_max_backfills = 1
osd_recovery_max_active = 2
osd_recovery_op_priority = 3
osd_client_op_priority = 63

[client.cinder]
rbd_default_features = ${enableCinderReplication ? '125' : '61'} # 125 enables exclusive-lock, journaling, object-map, fast-diff for journal-based replication mirroring; 61 is standard base features.
`;
}

export function generateSIEMConf(inputs) {
  const {
    siemIp = '10.10.99.100',
    siemPort = '514',
    compliance = []
  } = inputs;

  return `${getComplianceComments(inputs, 'neutron')}# /etc/rsyslog.d/99-openstack-siem.conf
module(load="imfile")
template(name="SIEMFormat" type="string" string="<%PRI%>%TIMESTAMP:::date-rfc3339% %HOSTNAME% %APP-NAME%[%PROCID%]: %msg%\\n")

input(type="imfile" File="/var/log/audit/audit.log" Tag="auditd" Severity="info" Facility="local6")
input(type="imfile" File="/var/log/kolla/keystone/keystone-apache-public-access.log" Tag="keystone-auth" Severity="info" Facility="local6")
input(type="imfile" File="/var/log/kolla/nova/nova-api.log" Tag="nova-api" Severity="info" Facility="local6")
input(type="imfile" File="/var/log/kolla/cinder/cinder-api.log" Tag="cinder-api" Severity="info" Facility="local6")
input(type="imfile" File="/var/log/kolla/manila/manila-api.log" Tag="manila-api" Severity="info" Facility="local6")

local6.* action(type="omfwd"
                Target="${siemIp}"
                Port="${siemPort}"
                Protocol="tcp"
                template="SIEMFormat"
                action.resumeRetryCount="-1"
                queue.type="linkedlist"
                queue.size="50000"
                queue.saveonshutdown="on")
`;
}

export function generateGlanceConf(inputs) {
  const {
    glanceBackend = 'rbd',
    storagegridIp = '10.10.30.70',
    storagegridPort = '10443',
    storagegridBucket = 'glance-images',
    storagegridAccessKey = 'SG_ACCESS_KEY_ID',
    storagegridSecretKey = 'SG_SECRET_ACCESS_KEY',
    apiSubnet = '10.10.20.0/24',
    compliance = []
  } = inputs;

  const ctrlStart = parseInt(inputs.mgmtCtrlStart) || 11;

  let storeBackend = glanceBackend;
  let storeConfig = '';

  if (glanceBackend === 'rbd') {
    storeConfig = `[glance_store]
stores = rbd, http
default_store = rbd
rbd_store_pool = images
rbd_store_user = glance
rbd_store_ceph_conf = /etc/ceph/ceph.conf
rbd_store_chunk_size = 8`;
  } else if (glanceBackend === 's3') {
    storeConfig = `[glance_store]
stores = s3, http
default_store = s3
s3_store_host = https://${storagegridIp}:${storagegridPort}/
s3_store_access_key = ${storagegridAccessKey}
s3_store_secret_key = ${storagegridSecretKey}
s3_store_bucket = ${storagegridBucket}
s3_store_create_bucket_on_put = true
s3_store_bucket_url_format = path
s3_store_cacert = /etc/ssl/certs/StorageGrid_CA.pem`;
  } else {
    storeBackend = 'file';
    storeConfig = `[glance_store]
stores = file, http
default_store = file
filesystem_store_datadir = /var/lib/glance/images/`;
  }

  return `${getComplianceComments(inputs, 'glance')}# /etc/glance/glance-api.conf
# Dynamic configuration for OpenStack Glance Image Service

[DEFAULT]
debug = False
bind_host = ${getIpAddress(apiSubnet, ctrlStart - 1)}
bind_port = 9292

[database]
connection = mysql+pymysql://glance:GlancePass123!@${getIpAddress(apiSubnet, ctrlStart - 1)}/glance

[keystone_authtoken]
www_authenticate_uri = https://${getIpAddress(inputs.extSubnet || '10.10.100.0/24', ctrlStart - 1)}:5000
auth_url = https://${getIpAddress(apiSubnet, 10)}:5000
auth_type = password
project_domain_name = Default
user_domain_name = Default
project_name = service
username = glance
password = GlanceServicePass123!

${storeConfig}
`;
}

export function generateNovaConf(inputs, computeResult) {
  const {
    cpuOvercommit = 3,
    ramOvercommit = 1,
    cinderBackends = ['ceph'],
    apiSubnet = '10.10.20.0/24',
    enableBarbican = false,
    novaCpuMode = 'host-model',
    novaInstanceHa = false,
    compliance = []
  } = inputs;

  const isCeph = cinderBackends.includes('ceph');
  const ctrlStart = parseInt(inputs.mgmtCtrlStart) || 11;

  let barbicanConfig = '';
  if (enableBarbican) {
    barbicanConfig = `
[key_manager]
# KEY MANAGER INTEGRATION: Required for Nova to boot encrypted volumes.
backend = barbican
api_class = castellan.key_manager.barbican_key_manager.BarbicanKeyManager
barbican_api_endpoint = https://${getIpAddress(apiSubnet, ctrlStart - 1)}:9311
barbican_auth_type = keystone`;
  }

  let cpuModeConfig = `cpu_mode = ${novaCpuMode}`;
  if (novaCpuMode === 'custom') {
    cpuModeConfig = `cpu_mode = custom
cpu_model = Broadwell-noTSX`;
  }

  let instanceHaConfig = '';
  let schedulerHaConfig = '';
  if (novaInstanceHa) {
    instanceHaConfig = `
# INSTANCE HA TUNING
resume_guests_state_on_host_boot = true`;
    schedulerHaConfig = `
[scheduler]
# Enable evacuation anti-affinity filters to schedule around failed compute hosts
enabled_filters = ComputeFilter,ImagePropertiesFilter,ServerGroupAntiAffinityFilter,ServerGroupAffinityFilter`;
  }

  return `${getComplianceComments(inputs, 'nova')}# /etc/nova/nova.conf
# Dynamic configuration for OpenStack Nova Compute Service

[DEFAULT]
my_ip = ${getIpAddress(apiSubnet, ctrlStart)}
log_dir = /var/log/kolla/nova
state_path = /var/lib/nova

cpu_allocation_ratio = ${cpuOvercommit}.0
ram_allocation_ratio = ${ramOvercommit}.0
disk_allocation_ratio = 1.0

compute_driver = libvirt.LibvirtDriver${instanceHaConfig}

[database]
connection = mysql+pymysql://nova:NovaPass123!@${getIpAddress(apiSubnet, ctrlStart - 1)}/nova

[api_database]
connection = mysql+pymysql://nova_api:NovaApiPass123!@${getIpAddress(apiSubnet, ctrlStart - 1)}/nova_api

[keystone_authtoken]
www_authenticate_uri = https://${getIpAddress(inputs.extSubnet || '10.10.100.0/24', ctrlStart - 1)}:5000
auth_url = https://10.10.20.10:5000
auth_type = password
project_domain_name = Default
user_domain_name = Default
project_name = service
username = nova
password = NovaServicePass123!

[libvirt]
virt_type = kvm
${cpuModeConfig}
images_type = ${isCeph ? 'rbd' : 'raw'}
${isCeph ? `images_rbd_pool = vms
images_rbd_ceph_conf = /etc/ceph/ceph.conf
rbd_user = cinder
rbd_secret_uuid = 4a9f3d9d-64bc-4d82-824f-9e73b22b10a2
disk_cachemodes = "writeback"
hw_disk_discard = "unmap"` : '# Ephemeral disks managed locally by Libvirt filesystem'}

[vnc]
enabled = true
server_listen = 0.0.0.0
server_proxyclient_address = \$my_ip
novncproxy_base_url = https://${getIpAddress(inputs.extSubnet || '10.10.100.0/24', ctrlStart - 1)}:6080/vnc_lite.html
${barbicanConfig}${schedulerHaConfig}
`;
}

export function generateNeutronConf(inputs) {
  const {
    apiSubnet = '10.10.20.0/24',
    neutronDriver = 'ovn',
    tenantTunnelProto = 'geneve',
    compliance = []
  } = inputs;

  const ctrlStart = parseInt(inputs.mgmtCtrlStart) || 11;
  const isComplianceActive = compliance.length > 0;
  const firewallDriver = isComplianceActive ? 'neutron.agent.firewall.OvsFirewallDriver' : 'neutron.agent.firewall.NoopFirewallDriver';

  const isOvn = neutronDriver === 'ovn';
  const mechanismDrivers = isOvn ? 'ovn' : 'openvswitch,l2population';

  let ovnConfig = '';
  if (isOvn) {
    ovnConfig = `
[ovn]
# OVN DATABASE CONNECTION SCHEMES (Clustered database endpoints on VLAN 20 API subnet)
ovn_nb_connection = tcp:${getIpAddress(apiSubnet, ctrlStart)}:6641,tcp:${getIpAddress(apiSubnet, ctrlStart + 1)}:6641,tcp:${getIpAddress(apiSubnet, ctrlStart + 2)}:6641
ovn_sb_connection = tcp:${getIpAddress(apiSubnet, ctrlStart)}:6642,tcp:${getIpAddress(apiSubnet, ctrlStart + 1)}:6642,tcp:${getIpAddress(apiSubnet, ctrlStart + 2)}:6642
ovn_l3_mode = true
ovn_metadata_enabled = true`;
  }

  return `${getComplianceComments(inputs, 'neutron')}# /etc/neutron/neutron.conf
# Dynamic configuration for OpenStack Neutron Network Service

[DEFAULT]
core_plugin = ml2
service_plugins = router,octavia
bind_host = ${getIpAddress(apiSubnet, ctrlStart - 1)}
bind_port = 9696
auth_strategy = keystone
global_physnet_mtu = 9000

[database]
connection = mysql+pymysql://neutron:NeutronPass123!@${getIpAddress(apiSubnet, ctrlStart - 1)}/neutron

[keystone_authtoken]
www_authenticate_uri = https://${getIpAddress(inputs.extSubnet || '10.10.100.0/24', ctrlStart - 1)}:5000
auth_url = https://${getIpAddress(apiSubnet, 10)}:5000
auth_type = password
project_domain_name = Default
user_domain_name = Default
project_name = service
username = neutron
password = NeutronServicePass123!

[ml2]
type_drivers = flat,vlan,vxlan,geneve
tenant_network_types = ${tenantTunnelProto}
mechanism_drivers = ${mechanismDrivers}
extension_drivers = port_security

[ml2_type_geneve]
vni_ranges = 1000:5000
max_header_size = 50

[ml2_type_vxlan]
vxlan_group = 239.1.1.1
vni_ranges = 1000:5000

[securitygroup]
enable_security_group = true
firewall_driver = ${firewallDriver}
${isComplianceActive ? '# Compliance Override: OvsFirewallDriver enforced to secure tenant traffic segmentation (NCA CSCC CCC-1.2 / DESC CSP Sec 6)\n' : ''}${ovnConfig}
`;
}

export function generateKeystoneConf(inputs) {
  const {
    apiSubnet = '10.10.20.0/24',
    compliance = []
  } = inputs;

  const isNca = compliance.includes('nca_cscc') || compliance.includes('desc_csp');
  const ctrlStart = parseInt(inputs.mgmtCtrlStart) || 11;

  return `${getComplianceComments(inputs, 'keystone')}# /etc/keystone/keystone.conf
# Dynamic configuration for OpenStack Keystone Identity Service

[DEFAULT]
debug = False
log_dir = /var/log/kolla/keystone
token_expiration = ${isNca ? '3600' : '14400'}

[database]
connection = mysql+pymysql://keystone:KeystonePass123!@${getIpAddress(apiSubnet, ctrlStart - 1)}/keystone

[token]
provider = fernet

[security_compliance]
password_regex = ^(?=.*[a-z])(?=.*[A-Z])(?=.*\\d)(?=.*[@\$!%*?&])[A-Za-z\\d@\$!%*?&]{12,}\$
password_regex_description = Password must be at least 12 characters and contain uppercase, lowercase, numbers, and symbols.
lockout_failure_attempts = 5
lockout_duration = 1800
unique_last_password_count = 5
`;
}

export function generateDeploymentSteps(inputs) {
  const {
    openstackDistro = 'kolla',
    openstackVersion = '2024.1',
    cinderBackends = ['ceph'],
    manilaBackends = ['cephfs_native'],
    enableStoragegrid = false,
    enableK8s = false,
    k8sCni = 'calico',
    k8sCsi = 'cinder',
    enableBarbican = false,
    barbicanBackend = 'vault',
    enableCinderReplication = false,
    enableVelero = false,
    neutronDriver = 'ovn',
    tenantTunnelProto = 'geneve',
    cinderMultiAttach = false,
    cinderQosEnable = false,
    cinderQosMaxIops = 5000,
    cinderQosMaxBps = 104857600
  } = inputs;

  const mgmtSubnet = inputs.mgmtSubnet || '10.10.10.0/24';
  const apiSubnet = inputs.apiSubnet || '10.10.20.0/24';
  const storageFrontSubnet = inputs.storageFrontSubnet || '10.10.30.0/24';
  const storageBackSubnet = inputs.storageBackSubnet || '10.10.40.0/24';
  const tenantSubnet = inputs.tenantSubnet || '10.10.50.0/24';
  const ctrlStart = parseInt(inputs.mgmtCtrlStart) || 11;

  let distroSteps = '';
  if (openstackDistro === 'kolla') {
    distroSteps = `## 2. Kolla-Ansible Automation Platform Initialization
Perform these steps on your deployment host (Ansible control node):
1. **Install Kolla-Ansible package and dependencies:**
   \`\`\`bash
   # Install python3-pip and virtualenv
   apt-get update && apt-get install -y python3-pip python3-venv
   python3 -m venv /opt/kolla-venv
   source /opt/kolla-venv/bin/activate
   pip install --upgrade pip
   pip install "ansible-core>=2.14,<2.16" kolla-ansible==${openstackVersion}
   \`\`\`
2. **Copy configuration templates:**
   \`\`\`bash
   mkdir -p /etc/kolla
   cp -r /opt/kolla-venv/share/kolla-ansible/etc_examples/kolla/* /etc/kolla/
   cp /opt/kolla-venv/share/kolla-ansible/ansible/inventory/multinode .
   \`\`\`
3. **Configure multinode inventory and globals.yml:**
   Replace the contents of \`/etc/kolla/inventory/multinode\` and \`/etc/kolla/globals.yml\` with the generated configurations from the tabs above.
4. **Run server bootstrapping:**
   Prepare control and compute hypervisors (installs Docker, configures hostname resolution, restarts SSH):
   \`\`\`bash
   kolla-ansible -i multinode bootstrap-servers
   \`\`\`
5. **Run deployment pre-checks:**
   \`\`\`bash
   kolla-ansible -i multinode prechecks
   \`\`\`
6. **Deploy the OpenStack cloud:**
   \`\`\`bash
   kolla-ansible -i multinode deploy
   \`\`\`
7. **Post-deploy credentials generation:**
   \`\`\`bash
   kolla-ansible -i multinode post-deploy
   source /etc/kolla/admin-openrc.sh
   openstack service list
   \`\`\``;
  } else if (openstackDistro === 'juju') {
    distroSteps = `## 2. Canonical Charmed OpenStack (Juju) Platform Initialization
Perform these steps on your deployment host (Juju client machine):
1. **Install Juju and launch the Controller:**
   \`\`\`bash
   # Install Juju client via snap
   snap install juju --channel=3.1/stable
   
   # Bootstrap Juju controller onto MAAS (Metal-as-a-Service) cloud fabric
   # (Ensure MAAS credentials are pre-configured in ~/.config/juju/clouds.yaml)
   juju bootstrap maas-cloud openstack-controller
   \`\`\`
2. **Add Juju model for OpenStack:**
   \`\`\`bash
   juju add-model openstack-prod
   \`\`\`
3. **Deploy the Charmed OpenStack bundle:**
   Copy the generated \`bundle.yaml\` from the tab above to the client, and execute:
   \`\`\`bash
   juju deploy ./bundle.yaml
   \`\`\`
4. **Monitor deployment status:**
   \`\`\`bash
   # Wait for all charms to transition to active/idle state
   juju status --watch 5s
   \`\`\`
5. **Download the Keystone admin-openrc file:**
   \`\`\`bash
   juju run keystone/leader get-admin-credentials
   # Source credentials to gain CLI access
   source ./openrc
   openstack service list
   \`\`\``;
  } else if (openstackDistro === 'rhosp') {
    if (openstackVersion === '18.0') {
      distroSteps = `## 2. Red Hat OpenStack Services on OpenShift (RHOSO) 18.0 Operator Deployment
Perform these steps on your OpenShift Container Platform (RHOCP) bastion or control node:
1. **Access the cluster and create namespace:**
   \`\`\`bash
   oc login -u admin -p password https://api.openshift.example.com:6443
   oc new-project openstack
   \`\`\`
2. **Install RHOSO Operator:**
   Install the **Red Hat OpenStack Services on OpenShift** operator via the OpenShift OperatorHub or using Subscription manifests:
   \`\`\`bash
   cat <<EOF | oc apply -f -
   apiVersion: operators.coreos.com/v1alpha1
   kind: Subscription
   metadata:
     name: openstack-operator
     namespace: openstack
   spec:
     channel: stable-18.0
     installPlanApproval: Automatic
     name: openstack-operator
     source: redhat-operators
     sourceNamespace: openshift-marketplace
   EOF
   \`\`\`
3. **Deploy prerequisites & credentials secret:**
   Create the \`osp-secret\` custom secret holding database passwords, rabbitmq users, and service admin passwords:
   \`\`\`bash
   oc create secret generic osp-secret \\
     --from-literal=AdminPassword=admin_secure_pass \\
     --from-literal=DatabasePassword=db_secure_pass \\
     --from-literal=RabbitMqPassword=mq_secure_pass
   \`\`\`
4. **Deploy the OpenStack Control Plane:**
   Copy the generated \`openstack-control-plane.yaml\` from the tab above and deploy it:
   \`\`\`bash
   oc apply -f openstack-control-plane.yaml
   \`\`\`
5. **Monitor the deployment status:**
   Verify that all OpenStack control plane components initialize and transitions to 'Ready' state:
   \`\`\`bash
   oc get openstackcontrolplane -w
   # Confirm that all service pods in the openstack namespace are Running:
   oc get pods -n openstack
   \`\`\``;
    } else {
      distroSteps = `## 2. Red Hat OpenStack Platform (RHOSP) ${openstackVersion} Director Platform Initialization
Perform these steps on your Undercloud host (Director client node):
1. **Install RHOSP TripleO packages:**
   \`\`\`bash
   # Enable Red Hat repositories
   subscription-manager register --username=redhat_user --password=redhat_pass
   subscription-manager release --set=8.8
   subscription-manager repos --enable=openstack-${openstackVersion}-for-rhel-8-x86_64-rpms
   dnf install -y python3-tripleoclient
   \`\`\`
2. **Configure Undercloud environment:**
   Create and configure \`undercloud.conf\` for local provisioning services, then install:
   \`\`\`bash
   openstack undercloud install
   source stackrc
   \`\`\`
3. **Register Bare Metal Nodes:**
   Prepare \`instackenv.json\` listing all IPMI control IPs, MAC addresses, and disk indexes for controllers, computes, and storage nodes:
   \`\`\`bash
   openstack overcloud node import instackenv.json
   openstack overcloud node introspect --all-manageable --provide
   \`\`\`
4. **Write network-environment.yaml:**
   Copy the generated \`network-environment.yaml\` from the tab above to \`/home/stack/\`.
5. **Deploy the Overcloud:**
   Run the deployment shell script generated in the tab above:
   \`\`\`bash
   chmod +x overcloud_deploy.sh
   ./overcloud_deploy.sh
   \`\`\``;
    }
  }

  return `# Step-by-Step Production Deployment & Hardening Guide

Follow these steps to deploy and configure all sized components in the designed environment:

---

## 1. Network Zoning & Switches Configuration
Run these actions on your physical Leaf/Spine network switches:
- **VLAN Provisioning:** Tag ports connected to compute and storage node interfaces for VLAN 10 (Mgmt), VLAN 20 (API), VLAN 30 (Storage Front), VLAN 40 (Storage Back), and VLAN 50 (Tenant VTEP).
- **MTU 9000 (Jumbo Frames):** Enforce MTU 9000 on all switch interfaces mapped to VLAN 30 (Storage Front) and VLAN 40 (Storage Back) to prevent IP packet fragmentation during high-throughput iSCSI/Ceph traffic.

---

${distroSteps}

---

## 3. Controllers & HA Plane Deployment
Configure these parameters on the three Controller Hosts (\`controller01\`, \`02\`, \`03\`):
1. **HAProxy & Keepalived VIP configuration:**
   Initialize virtual IP bindings on VLAN 20 and VLAN 100:
   \`\`\`bash
   # Ensure Keepalived daemon is active and configured
   systemctl enable --now keepalived
   # Verify VIP binds correctly to VLAN 20 virtual interface
   ip addr show bond0.20
   \`\`\`
2. **Database & Message Queue Clustering:**
   Bootstrap Galera DB and RabbitMQ clusters across controllers:
   \`\`\`bash
   # Initialize Galera cluster on controller01
   galera_new_cluster
   # Join controller02 and 03
   systemctl start mysql
   # Verify cluster size equals 3
   mysql -u root -e "SHOW STATUS LIKE 'wsrep_cluster_size';"
   \`\`\`
${(() => {
  if (!enableBarbican) return '';
  let backendDetails = '';
  if (barbicanBackend === 'vault') {
    backendDetails = `
   - **Vault Integration Steps:**
     1. Initialize HashiCorp Vault transit engine on external KMS node:
        \`\`\`bash
        export VAULT_ADDR='https://vault.internal.local:8200'
        vault secrets enable transit
        vault write -f transit/keys/barbican-key
        \`\`\`
     2. Create Vault access policy for Barbican:
        \`\`\`hcl
        path "transit/encrypt/barbican-key" { capabilities = ["update"] }
        path "transit/decrypt/barbican-key" { capabilities = ["update"] }
        \`\`\`
     3. Generate AppRole credentials for Barbican container mapping:
        \`\`\`bash
        vault auth enable approle
        vault write auth/approle/role/barbican-role policies="barbican" token_num_uses=0
        vault read auth/approle/role/barbican-role/role-id
        vault write -f auth/approle/role/barbican-role/secret-id
        \`\`\`
     4. Save role-id and secret-id, and configure them inside the Barbican config.`;
  } else if (barbicanBackend === 'softhsm') {
    backendDetails = `
   - **SoftHSMv2 Setup Steps:**
     1. Install SoftHSMv2 package on Barbican/Controller hosts:
        \`\`\`bash
        apt-get install -y softhsm2
        \`\`\`
     2. Initialize SoftHSM slot 0 for Barbican keyring:
        \`\`\`bash
        softhsm2-util --init-token --slot 0 --label "barbican_token" --pin 1234 --so-pin 4321
        \`\`\`
     3. Configure slot directory permissions for the \`barbican\` user:
        \`\`\`bash
        chown -R barbican:barbican /var/lib/softhsm/tokens/
        \`\`\`
     4. Map PKCS#11 library provider link \`/usr/lib/softhsm/libsofthsm2.so\` in Barbican plugin config.`;
  } else if (barbicanBackend === 'pkcs11') {
    backendDetails = `
   - **Hardware HSM (PKCS#11) Setup Steps:**
     1. Load vendor HSM PKCS11 dynamic link library (e.g. \`libCryptoki.so\`).
     2. Configure slot index and token PIN in Barbican PKCS#11 backend parameters.
     3. Verify PKCS#11 slot list:
        \`\`\`bash
        pkcs11-tool --module /usr/lib/hsm/libCryptoki.so --list-slots
        \`\`\``;
  }

  return `3. **Barbican KMS Key Manager Bootstrap:**
   Bootstrap and configure Barbican key management APIs for Volume Encryption:
   \`\`\`bash
   # Execute Kolla playbooks targeting Barbican microservices
   kolla-ansible -i multinode deploy --tags barbican
   \`\`\`
   ${backendDetails}
   - **Verify Barbican Response:**
     \`\`\`bash
     openstack secret store --name "test_key" --payload "my-super-secret-key-material"
     openstack secret list
     \`\`\`\n`;
})()}
${(() => {
  if (neutronDriver !== 'ovn') return '';
  return `4. **OVN Database Clustered Service Bootstrap:**
   On the first controller (\`controller01\`), initialize OVN Northbound and Southbound databases:
   \`\`\`bash
   # Initialize clustered NB and SB databases
   ovn-ctl start_northd \\
     --db-nb-create-cluster-local-addr=${getIpAddress(apiSubnet, ctrlStart)} \\
     --db-sb-create-cluster-local-addr=${getIpAddress(apiSubnet, ctrlStart)}
   \`\`\`
   On \`controller02\` and \`controller03\`, join the active OVN database cluster:
   \`\`\`bash
   # Join Northbound DB cluster
   ovn-ctl start_northd \\
     --db-nb-join-cluster-addr=${getIpAddress(apiSubnet, ctrlStart)} \\
     --db-nb-cluster-local-addr=\$(ip addr show dev bond0.20 | grep 'inet ' | awk '{print \$2}' | cut -d/ -f1)
   # Join Southbound DB cluster
   ovn-ctl start_northd \\
     --db-sb-join-cluster-addr=${getIpAddress(apiSubnet, ctrlStart)} \\
     --db-sb-cluster-local-addr=\$(ip addr show dev bond0.20 | grep 'inet ' | awk '{print \$2}' | cut -d/ -f1)
   \`\`\`
   Verify database cluster synchronization status:
   \`\`\`bash
   ovs-appctl -t /var/run/ovn/ovnnb_db.ctl raft/list-peers
   ovs-appctl -t /var/run/ovn/ovnsb_db.ctl raft/list-peers
   \`\`\`\n`;
})()}

---

## 4. Storage Backends Native Integration

${cinderBackends.includes('ceph') ? `### A. Ceph RADOS Storage Cluster
1. **Bootstrap Cephadm:**
   Run Cephadm bootstrap on the first Ceph manager node over Storage Frontend:
   \`\`\`bash
   cephadm bootstrap --mon-ip ${getIpAddress(storageFrontSubnet, parseInt(inputs.mgmtCephStart) || 201)} --single-host-defaults
   \`\`\`
2. **Add OSD storage disks:**
   Orchestrate and deploy OSDs dynamically across the ${inputs.osdPerNode} SSDs per host:
   \`\`\`bash
   ceph orch device search
   ceph orch apply osd --all-available-devices
   \`\`\`
3. **DB/WAL Placement (if HDD media selected):**
   If rotational drives are used, offload DB and WAL writes to NVMe partitions (20GB DB / 5GB WAL):
   \`\`\`bash
   ceph-volume lvm batch --db-devices /dev/nvme0n1 --osd-devices /dev/sdb /dev/sdd
   \`\`\`
${enableCinderReplication ? `4. **Ceph RBD Mirroring Configuration (Disaster Recovery):**
   Enable pool-level journaling and register remote DR cluster peer:
   \`\`\`bash
   # Enable exclusive-lock and journaling features on volumes pool
   rbd mirror pool enable volumes pool
   # Create a bootstrap token for target cluster peering
   rbd mirror pool peer bootstrap create volumes > /tmp/peer_token.txt
   # (On secondary site cluster) Import the token to establish DR relations:
   rbd mirror pool peer bootstrap import volumes /tmp/peer_token.txt
   \`\`\`
` : ''}
` : ''}

${cinderBackends.includes('netapp') ? `### B. NetApp ONTAP SAN/NAS Integration
1. **Vserver & LIF creation:**
   Run these vserver configuration steps in the ONTAP shell:
   \`\`\`bash
   vserver create -vserver ${inputs.netappSvm} -subtype default
   network interface create -vserver ${inputs.netappSvm} -lif lif_data_01 -service-policy default-data-blocks -home-node node01 -home-port a0a-30 -address ${inputs.netappIp} -netmask 255.255.255.0
   \`\`\`
2. **iSCSI portals and igroup mappings:**
   Register the IQNs of all compute hosts in the ONTAP igroup:
   \`\`\`bash
   igroup create -vserver ${inputs.netappSvm} -igroup igroup_computes -protocol iscsi -ostype linux
   # Register compute initiators dynamically
   igroup add -vserver ${inputs.netappSvm} -igroup igroup_computes -initiator iqn.1993-08.org.debian:01:compute01
   \`\`\`
3. **NFS Export Policies:**
   If using NFS, restrict export paths to VLAN 30 compute subnets:
   \`\`\`bash
   vserver export-policy rule create -vserver ${inputs.netappSvm} -policyname default -clientmatch ${storageFrontSubnet} -protocol nfs3,nfs4 -rorule sys -rwrule sys -superuser sys
   \`\`\`
${enableCinderReplication ? `4. **ONTAP SnapMirror SVM Peering (Disaster Recovery):**
   Create and initialize the SVM SnapMirror relationship to secondary array:
   \`\`\`bash
   # Peering vservers between primary and secondary ONTAP clusters
   vserver peer create -vserver ${inputs.netappSvm} -peer-vserver ${inputs.netappSvm}_replica -applications snapmirror -peer-cluster cluster_dr
   # Initialize SnapMirror pipe
   snapmirror create -source-path ${inputs.netappSvm}: -destination-path ${inputs.netappSvm}_replica: -type XDP -policy MirrorAllSnapshots
   snapmirror initialize -destination-path ${inputs.netappSvm}_replica:
   \`\`\`
` : ''}
` : ''}

${enableStoragegrid ? `### C. NetApp StorageGrid Object Storage
1. **S3 Tenant Account & Access Credentials:**
   Generate S3 credentials via StorageGrid Management API.
2. **Glance Bucket Provisioning & ILM Replication rules:**
   Apply policies enforcing dual-site replication copies:
   - Rule Name: \`${inputs.storagegridIlm}\`
   - Data Protection: Replicate 2 copies across Site 1 and Site 2.
` : ''}

${(cinderMultiAttach || cinderQosEnable) ? `### D. Cinder Advanced Policy & Volumes Tuning
${cinderMultiAttach ? `1. **Multi-Attach Configuration:** Create a multi-attach capable volume type to allow clustering filesystems:
   \`\`\`bash
   openstack volume type create multiattach-type
   openstack volume type set --property multiattach="<is> True" multiattach-type
   # Create a shared volume and attach to multiple instances
   openstack volume create --size 20 --type multiattach-type shared-vol-01
   openstack server add volume instance-01 shared-vol-01
   openstack server add volume instance-02 shared-vol-01
   \`\`\`` : ''}
${cinderQosEnable ? `${cinderMultiAttach ? '2' : '1'}. **QoS Rate-Limiting Policy:** Enforce IOPS and Throughput caps on tenant volume operations to prevent noisy neighbors:
   \`\`\`bash
   # Create QoS spec in Cinder
   openstack volume qos create --property maxIOPS=${cinderQosMaxIops} --property maxBPS=${cinderQosMaxBps} qos-limit-spec
   # Associate QoS with volume type
   openstack volume qos associate qos-limit-spec ${cinderBackends.includes('ceph') ? 'ceph_rbd' : cinderBackends[0] || 'volumes'}
   \`\`\`` : ''}
` : ''}

---

## 5. Compute Hosts Configuration
Run these actions on all sized hypervisors (\`compute01\` to \`computeNN\`):
- **Enable virtualization dependencies:**
  \`\`\`bash
  apt-get install -y qemu-kvm libvirt-daemon-system multipath-tools
  \`\`\`
- **Multipath configuration for SAN (NetApp iSCSI):**
  Configure \`/etc/multipath.conf\` with ONTAP optimized ALUA devices parameters, and reload daemon:
  \`\`\`bash
  systemctl enable --now multipathd
  multipath -r
  \`\`\`
- **OVS/Neutron Agent Configuration:**
${neutronDriver === 'ovn' ? `  Configure the local Open vSwitch chassis to route tunnel traffic via OVN:
  \`\`\`bash
  # Configure local encap protocol and IP for VTEP (using VLAN 50 overlay network)
  ovs-vsctl set open_vswitch . external_ids:ovn-encap-type=${tenantTunnelProto}
  ovs-vsctl set open_vswitch . external_ids:ovn-encap-ip=\$(ip addr show dev bond0.50 | grep 'inet ' | awk '{print \$2}' | cut -d/ -f1)
  # Establish northbound/southbound DB remote endpoint bindings
  ovs-vsctl set open_vswitch . external_ids:ovn-remote="tcp:${getIpAddress(apiSubnet, ctrlStart)}:6642,tcp:${getIpAddress(apiSubnet, ctrlStart+1)}:6642,tcp:${getIpAddress(apiSubnet, ctrlStart+2)}:6642"
  # Start the OVN agent controller
  systemctl enable --now ovn-controller
  \`\`\`` : `  Configure Open vSwitch local agent tunnel endpoint:
  \`\`\`bash
  # Create local integration bridge and register tunnel IP mapping
  ovs-vsctl add-br br-int
  ovs-vsctl add-br br-tun
  # Start openvswitch l2 agent on the hypervisor
  systemctl enable --now neutron-openvswitch-agent
  \`\`\``}

---

## 6. Kubernetes Cluster Deployment ( Magnum / Kubeadm )
If hosting Kubernetes VMs on OpenStack hypervisors:
1. **Cloud Controller Manager (CCM) setup:**
   Copy the generated [cloud-config](file:///etc/kubernetes/cloud-config) to all master VMs.
2. **Kubernetes Bootstrap (kubeadm):**
   Initialize the master plane pointing to internal VIP:
   \`\`\`bash
   kubeadm init --control-plane-endpoint "${getIpAddress(apiSubnet, ctrlStart - 1)}:6443" --pod-network-cidr=192.168.0.0/16
   \`\`\`
3. **CNI calico deployment:**
   Apply Calico manifests routing pods overlay traffic over GENEVE:
   \`\`\`bash
   kubectl apply -f https://raw.githubusercontent.com/projectcalico/calico/v3.25.0/manifests/calico.yaml
   \`\`\`
4. **Volume CSI Driver mount:**
   Apply Cinder CSI configurations allowing dynamic disk mapping:
   \`\`\`bash
   kubectl apply -f cinder-csi.yaml
   \`\`\`
${enableVelero ? `5. **Velero K8s Backup Bootstrap:**
   Install Velero CLI and bootstrap backup agents pointing to StorageGrid S3:
   \`\`\`bash
   # Download Velero binary
   wget https://github.com/vmware-tanzu/velero/releases/download/v1.11.0/velero-v1.11.0-linux-amd64.tar.gz
   tar -xvf velero-v1.11.0-linux-amd64.tar.gz && mv velero-v1.11.0-linux-amd64/velero /usr/local/bin/
   # Install backup scheduler in Kubernetes
   velero install \\
     --provider aws \\
     --plugins velero/velero-plugin-for-aws:v1.7.0 \\
     --bucket ${inputs.storagegridBucket || 'k8s-backups'} \\
     --secret-file ./credentials-velero \\
     --use-node-agent \\
     --backup-location-config region=us-east-1,s3ForcePathStyle="true",s3Url=https://${inputs.storagegridIp}:${inputs.storagegridPort}
   \`\`\`
` : ''}
`;
}

// Internal helpers
function cephBackendUsed(cinderBackends, manilaBackends) {
  return cinderBackends.includes('ceph') || manilaBackends.some(b => b.startsWith('cephfs'));
}

function getCinderBackendHldDescription(backend, inputs) {
  if (backend === 'ceph') {
    return `- **Architecture Choice:** Ceph RBD (RADOS Block Device) integrated directly with QEMU/KVM hypervisors.
- **Protocol:** Native RADOS (runs directly over TCP network, skipping local filesystem translation layers).
- **Redundancy:** Data is replication-scoped inside Ceph pools across physical hosts.
- **Advantages:** Cost-effective, zero vendor lock-in, extreme performance for virtual disk reads/writes using direct block mapping.`;
  } else if (backend === 'netapp') {
    return `- **Architecture Choice:** NetApp ONTAP Storage System.
- **Protocol:** \`${inputs.netappProto.toUpperCase()}\` (runs over Dedicated Storage network).
- **Storage Family:** Clustered ONTAP.
- **Efficiency:** Hardware-deduplication (\`${inputs.netappDedup === 'true' ? 'enabled' : 'disabled'}\`) and compression (\`${inputs.netappCompression === 'true' ? 'enabled' : 'disabled'}\`) configured.
- **Host Multipathing:** ALUA enabled on hypervisors to handle active/non-optimized path failovers.`;
  } else if (backend === 'emc') {
    return `- **Architecture Choice:** Dell EMC PowerFlex software-defined storage.
- **Protocol:** Custom SDC block driver.
- **Advantages:** Massively parallel block distribution, millisecond latency profiles, linear scale-out and enterprise multi-pathing natively handled by the Storage Data Client daemon on compute nodes.`;
  }
}

function getManilaDhssHldDescription(dhss, backend) {
  if (dhss === 'true') {
    return `- **Implications:** Manila dynamically deploys Share Servers (e.g. NetApp SVMs) directly inside the tenant's Neutron private networks. This guarantees complete isolation at the IP layer (DESC compliant).
- **Backend Storage Overhead:** Storage backend must support automated SVM generation and dynamic IP interface bindings. High overhead per tenant, but satisfies security isolation (e.g., PCI-DSS/HIPAA).
- **Best Use Case:** Public clouds serving multiple untrusted enterprise clients.`;
  } else {
    return `- **Implications:** Manila provisions shares on a single, shared storage interface or pre-provisioned storage servers (e.g., single SVM or native CephFS cluster). Network separation is flat.
- **Backend Storage Overhead:** Lower setup times, lower cluster CPU overhead. Shares are separated using access control lists (export rules or CephX keys) rather than direct virtual networking boundaries.
- **Best Use Case:** Single-tenant private cloud, or highly cooperative internal team deployments.`;
  }
}

export function generateK8sVelero(inputs) {
  const {
    storagegridIp = '10.10.30.70',
    storagegridPort = '10443',
    storagegridBucket = 'k8s-backups',
    storagegridAccessKey = 'SG_ACCESS_KEY_ID',
    storagegridSecretKey = 'SG_SECRET_ACCESS_KEY'
  } = inputs;

  return `# Kubernetes Velero Backup Configuration & Manifests
# File: velero-backup.yaml
# IMPLICATIONS: Backup of Kubernetes namespaces and CSI persistent volumes
# directly to NetApp StorageGrid S3. Incremental backups are executed via Restic/Kopia.

apiVersion: velero.io/v1
kind: BackupStorageLocation
metadata:
  name: storagegrid-s3
  namespace: velero
spec:
  provider: aws
  objectStore:
    bucket: ${storagegridBucket}
    prefix: k8s-cluster-backups
  config:
    region: us-east-1
    s3ForcePathStyle: "true"
    s3Url: https://${storagegridIp}:${storagegridPort}
---
apiVersion: velero.io/v1
kind: VolumeSnapshotLocation
metadata:
  name: openstack-cinder
  namespace: velero
spec:
  provider: cinder.csi.openstack.org
  config:
    region: RegionOne
---
# S3 Credentials Secret
# kubectl create secret generic cloud-credentials --namespace velero --from-literal=aws="[access-key]:[secret-key]"
apiVersion: v1
kind: Secret
metadata:
  name: cloud-credentials
  namespace: velero
type: Opaque
stringData:
  cloud: |
    [default]
    aws_access_key_id = ${storagegridAccessKey}
    aws_secret_access_key = ${storagegridSecretKey}
`;
}

export function generateProposalDesign(inputs, computeResult, cephResult) {
  const {
    projectName = 'Enterprise OpenStack Cloud',
    openstackDistro = 'kolla',
    openstackVersion = '2024.1',
    cspScale = 'medium',
    industry = 'financial',
    compliance = ['soc2', 'pci-dss'],
    vmCount = 400,
    vmVcpus = 4,
    vmRam = 16,
    vmDisk = 50,
    cpuOvercommit = 3,
    ramOvercommit = 1,
    nodeCores = 64,
    nodeRam = 256,
    nodeDisk = 1000,
    haBuffer = 2,
    novaCpuMode = 'host-model',
    cinderCapacityTb = 150,
    cinderBackends = ['ceph'],
    netappIp = '10.10.30.50',
    netappSvm = 'svm_cinder_prod',
    netappProto = 'iscsi',
    netappDedup = 'true',
    netappCompression = 'true',
    enableCinderBackup = 'false',
    enableBarbican = false,
    barbicanBackend = 'vault',
    enableCinderReplication = false,
    cinderReplTarget = '10.20.30.50',
    cinderReplMode = 'async',
    manilaCapacityTb = 50,
    manilaDhss = 'false',
    manilaBackends = ['cephfs_native'],
    glanceCapacityTb = 5,
    glanceBackend = 'rbd',
    storageFrontSubnet = '10.10.30.0/24',
    siemIp = '10.10.99.100',
    siemPort = 514,
    tenantTunnelProto = 'geneve',
    osdMedia = 'ssd'
  } = inputs;

  const complianceText = compliance.length > 0 
    ? compliance.map(c => c.toUpperCase()).join(', ') 
    : 'Standard Cloud Security Baseline';

  const distroNames = {
    kolla: 'Kolla-Ansible Containerized Deployment',
    juju: 'Charmed OpenStack (Juju Model-Driven)',
    rhosp: 'Red Hat OpenStack Platform (Director Templates)'
  };
  const distroName = distroNames[openstackDistro] || openstackDistro;

  const hasNetApp = cinderBackends.includes('netapp') || manilaBackends.includes('netapp');
  const hasCeph = cinderBackends.includes('ceph') || manilaBackends.includes('cephfs_native') || glanceBackend === 'rbd';
  const hasPowerFlex = cinderBackends.includes('emc');

  // NetApp Section
  let netappSection = '';
  if (hasNetApp) {
    netappSection = `### 4.1 NetApp ONTAP Storage Array Integration
NetApp ONTAP is configured as a key storage controller backend, providing high-availability block and file access.

* **Complementing OpenStack with Copy Offloading (COT):**
  * **Instant Volume Clones:** By deploying the **NetApp Copy Offload Tool (COT)**, the hypervisor bypasses standard block copying when spawning instances from Glance images or cloning existing volumes. Instead, ONTAP clones the volume instantly at the hardware level (File/LUN-level cloning).
  * **Network & Host CPU Savings:** Bypassing host CPU cycle utilization and keeping high-bandwidth traffic off the **${storageFrontSubnet}** storage front-end network decreases VM provisioning times from minutes to seconds.
* **Storage Efficiencies:**
  * Native hardware-assisted **inline deduplication** (Sized: \`${netappDedup === 'true' ? 'Enabled' : 'Disabled'}\`), **compression** (Sized: \`${netappCompression === 'true' ? 'Enabled' : 'Disabled'}\`), and **compaction** reduce the physical storage footprint on the controller shelves without exposing compute nodes to overhead.
* **SnapMirror Disaster Recovery:**
  * Leverages **ONTAP SnapMirror** to replicate Cinder volume blocks directly to the secondary array at \`${cinderReplTarget}\` (${cinderReplMode === 'sync' ? 'Synchronously' : 'Asynchronously'}). This provides business continuity and hardware-level replication that doesn't consume hypervisor host cycles or VM resources.
* **Network Lif Isolation:**
  * **SVM Data LIF Topology:** Management traffic is separated from storage paths by assigning multiple Logical Interfaces (LIFs) to the Storage Virtual Machine (\`${netappSvm}\`). Block data flows through dedicated storage LIFs mapped directly to iSCSI/NFS target networks.`;
  }

  // Ceph Section
  let cephSection = '';
  if (hasCeph) {
    const cephNodes = cephResult.cephNodes || 3;
    const targetPgs = cephResult.targetPgs || 128;
    const replicaCount = inputs.replicaFactor || 3;
    cephSection = `### 4.2 Ceph Unified Storage Cluster Integration
A high-performance Ceph cluster is sized with **${cephNodes} storage nodes** to support unified block (RBD) and file (CephFS) storage paths.

* **BlueStore WAL/DB NVMe Partitioning:**
  * For production deployments, all OSDs run on the BlueStore storage engine.
  * **Metadata Offloading:** Write-Ahead Log (WAL) and DB partitions are isolated onto dedicated NVMe SSDs, while the bulk block data resides on larger ${osdMedia.toUpperCase()}s. This eliminates write latency bottlenecks and accelerates small metadata updates.
* **Placement Group (PG) Allocation:**
  * To ensure even data distribution and protect against cluster degradation, PGs are calculated with the formula: \`(OSDs * 100) / Replica Factor\` rounded up to the nearest power of 2.
  * Sized configuration target is set to **${targetPgs} PGs** per pool to support optimal performance.
* **Ceph RBD Mirroring (Disaster Recovery):**
  * Leverages the \`rbd-mirror\` daemon to asynchronously replicate volume pools to a remote Ceph cluster. Mirroring journals write operations continuously, ensuring safe and resilient data synchronization across geographic sites.
* **CRUSH Map High Availability:**
  * The CRUSH map rules are structured with a failure domain of \`host\`, ensuring that replicas (replica count: \`${replicaCount}\`) are never written to the same physical chassis, keeping the cluster functional even during a complete node failure.`;
  }

  // PowerFlex Section
  let powerflexSection = '';
  if (hasPowerFlex) {
    powerflexSection = `### 4.3 Dell PowerFlex High-Performance Block Storage
Dell PowerFlex is configured to deliver software-defined block storage with extreme scale and performance.

* **Storage Data Client (SDC) Architecture:**
  * Instead of legacy iSCSI protocols, a lightweight software client (SDC) is installed on every Nova Compute host.
  * **Bypassing SCSI Layer:** The SDC bypasses the traditional SCSI layer and communicates directly with the Storage Data Servers (SDS) via a proprietary TCP/IP-based protocol, slashing execution path lengths and reducing compute latency.
* **Active-Active Multipathing & Elastic Sizing:**
  * SDC establishes simultaneous connections to all SDS nodes in the cluster.
  * **Dynamic Load Balancing:** Block read/write calls are automatically load-balanced across all physical data paths and network interfaces, eliminating the need for complex multipath configuration daemons (like multipathd) and providing seamless throughput.`;
  }

  return `# Technical Proposal & OpenStack Cloud Architecture Design
**Project Target:** ${projectName}
**Orchestration Distribution:** ${distroName}
**OpenStack Release:** Release ${openstackVersion}
**Compliance Level:** ${complianceText}

---

## 1. Executive Summary
This document provides the high-level and low-level architectural design details for a production-grade OpenStack private cloud. Custom-tailored to support **${vmCount} active virtual machines**, the infrastructure guarantees resilience, high-performance workload delivery, and security compliance.

The sized physical hypervisor footprint requires **${computeResult.finalComputeNodes} Nova Compute nodes** and a control plane composed of 3 Controller nodes configured in an Active/Active clustering design. The unified storage fabric is sized to accommodate **${cinderCapacityTb} TB of Cinder block volumes** and **${manilaCapacityTb} TB of Manila share file capacity**.

---

## 2. Infrastructure Advantages & Core Concepts

### 2.1 Neutron OVN SDN Advantage
This deployment leverages the **Open Virtual Network (OVN)** SDN driver for Neutron:
* **Distributed Services:** Layer 3 routing, distributed DHCP, and local metadata services run directly on the Nova compute hosts, removing the centralized Network Node bottleneck.
* **Logical Flow Compilation:** Network layout modifications are processed by the central OVN database and compiled locally into Open vSwitch flows via the \`ovn-controller\` daemon running on each hypervisor.
* **Operational Simplicity:** Legacy agents (\`neutron-l3-agent\`, \`neutron-dhcp-agent\`) are replaced by standard OVS interfaces, lowering troubleshooting complexity.

### 2.2 Glance Storage Offloading
* **Storage Ingestion Routing:** Rather than routing image transfer streams through the controllers, image downloads are directed straight to the Compute nodes from the **${glanceBackend === 's3' ? 'S3/StorageGrid Object Store' : 'Ceph RBD Pool'}**. This eliminates ephemeral space exhaustion on the controller nodes during simultaneous VM provisioning.

---

## 3. Storage Integration & Lifecycle

### 3.1 Cinder Volume Ingestion Path
* **Hypervisor Direct Mount:** Cinder manages block device lifecycles (creation, deletion, snapping), but the active read/write data paths flow directly from Compute nodes to the storage array:
  * **QEMU Integration:** Libvirt configures the VM to attach the volume directly via **${netappProto.toUpperCase()}** or **librbd** over the storage network, bypassing any intermediate OS mounts on the hypervisor host.
  * **Traffic Separation:** All storage block traffic is isolated on the **${storageFrontSubnet}** network.

### 3.2 Manila File Share Lifecycle
* **Multi-Tenant Share Exports:** Manila provisions shared filesystems dynamically. For native CephFS, compute nodes mount the file shares directly, while NetApp ONTAP configures export policies and routes traffic through dedicated Storage Virtual Machine interfaces.

---

## 4. Vendor Storage Architecture & Best Practices

${netappSection || '*No NetApp backends selected in current sizing configuration.*'}

${cephSection || '*No Ceph backends selected in current sizing configuration.*'}

${powerflexSection || '*No Dell PowerFlex backends selected in current sizing configuration.*'}

---

## 5. Deployment Implementation Guide

### 5.1 Step-by-Step Orchestration
1. **Host Configuration:** Install target operating system (e.g. RHEL or Ubuntu), configure network bonding (LACP), and set Jumbo Frames (MTU 9000).
2. **Deploy Control Plane:** Run distribution-specific playbooks (e.g. \`kolla-ansible deploy\`) to launch containerized control services.
3. **Configure Cinder/Manila Backends:** Inject vendor configuration snippets into \`/etc/cinder/cinder.conf\` and \`/etc/manila/manila.conf\`.
4. **Barbican KMS Hardening:** If active, connect Barbican to the secure Key Management system.
5. **SIEM Event Forwarding:** Configure local syslog agents to ship OpenStack logs to the central SIEM receiver at \`${siemIp}:${siemPort}\`.

---

## 6. Security Baseline and Regulatory Compliance

To satisfy the **${complianceText}** requirements, the following baseline configurations are applied:
* **Barbican Encryption at Rest:** Barbican coordinates keys via the **${barbicanBackend.toUpperCase()}** backend to encrypt block volumes, glance images, and ephemeral VM drives.
* **Automated Cinder Backups:** Volume backups are continuously captured and pushed to an offsite S3 backup target.
* **Centralized Auditing:** API audit trails are forwarded immediately to SIEM to ensure non-repudiation.
`;
}

export function generateLiveTopologySVG(inputs, computeResult, cephResult) {
  const {
    projectName = 'CSP Cloud',
    openstackDistro = 'kolla',
    openstackVersion = '2024.1',
    vmCount = 400,
    enableK8s = false,
    k8sWorkerCount = 10,
    k8sCsi = 'cinder',
    cinderCapacityTb = 150,
    cinderBackends = ['ceph'],
    manilaCapacityTb = 50,
    manilaBackends = ['cephfs_native'],
    glanceCapacityTb = 5,
    glanceBackend = 'rbd',
    enableCinderBackup = 'false',
    cinderBackupTarget = 'storagegrid',
    enableBarbican = false,
    barbicanBackend = 'vault',
    enableStoragegrid = false,
    siemIp = '',
    neutronDriver = 'ovn',
    tenantTunnelProto = 'geneve',
    osdMedia = 'ssd'
  } = inputs;

  const computeNodes = (computeResult && computeResult.finalComputeNodes) || Math.max(3, Math.ceil(vmCount / 10));
  const cephNodes = (cephResult && cephResult.cephNodes) || 3;

  const hasCeph = cinderBackends.includes('ceph') || manilaBackends.includes('cephfs_native') || glanceBackend === 'rbd';
  const hasNetApp = cinderBackends.includes('netapp') || manilaBackends.includes('netapp');
  const hasPowerFlex = cinderBackends.includes('emc');
  const hasStorageGrid = enableStoragegrid;

  // Build storage layout
  const activeStorage = [];
  if (hasCeph) {
    activeStorage.push({
      id: 'ceph',
      label: 'Ceph RBD/FS',
      detail: `${cephNodes} OSD Nodes`,
      color: '#ff5e62',
      glow: 'glow-red'
    });
  }
  if (hasNetApp) {
    activeStorage.push({
      id: 'netapp',
      label: 'NetApp ONTAP',
      detail: 'ONTAP SVM',
      color: '#f01f26',
      glow: 'glow-red'
    });
  }
  if (hasPowerFlex) {
    activeStorage.push({
      id: 'emc',
      label: 'PowerFlex',
      detail: 'SDC Transport',
      color: '#ffe066',
      glow: 'glow-cyan'
    });
  }
  if (hasStorageGrid) {
    activeStorage.push({
      id: 'storagegrid',
      label: 'StorageGrid',
      detail: 'S3 Object Store',
      color: '#00fe9c',
      glow: 'glow-cyan'
    });
  }

  const N = activeStorage.length;
  const storageBlocks = [];
  if (N === 1) {
    storageBlocks.push({ ...activeStorage[0], x: 700, y: 90, w: 140, h: 50, cx: 770, cy: 115 });
  } else if (N === 2) {
    storageBlocks.push({ ...activeStorage[0], x: 625, y: 90, w: 140, h: 50, cx: 695, cy: 115 });
    storageBlocks.push({ ...activeStorage[1], x: 785, y: 90, w: 140, h: 50, cx: 855, cy: 115 });
  } else if (N === 3) {
    storageBlocks.push({ ...activeStorage[0], x: 625, y: 55, w: 140, h: 45, cx: 695, cy: 77 });
    storageBlocks.push({ ...activeStorage[1], x: 785, y: 55, w: 140, h: 45, cx: 855, cy: 77 });
    storageBlocks.push({ ...activeStorage[2], x: 705, y: 120, w: 140, h: 45, cx: 775, cy: 142 });
  } else if (N === 4) {
    storageBlocks.push({ ...activeStorage[0], x: 625, y: 55, w: 140, h: 45, cx: 695, cy: 77 });
    storageBlocks.push({ ...activeStorage[1], x: 785, y: 55, w: 140, h: 45, cx: 855, cy: 77 });
    storageBlocks.push({ ...activeStorage[2], x: 625, y: 120, w: 140, h: 45, cx: 695, cy: 142 });
    storageBlocks.push({ ...activeStorage[3], x: 785, y: 120, w: 140, h: 45, cx: 855, cy: 142 });
  }

  // Start SVG string
  let svg = `<svg width="100%" height="100%" viewBox="0 0 950 240" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <filter id="glow-red" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="3" result="blur" />
      <feComposite in="SourceGraphic" in2="blur" operator="over" />
    </filter>
    <filter id="glow-cyan" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="3" result="blur" />
      <feComposite in="SourceGraphic" in2="blur" operator="over" />
    </filter>
    <marker id="arrow-blue" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
      <path d="M 0 0 L 10 5 L 0 10 z" fill="#ff5e62" />
    </marker>
    <marker id="arrow-red" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
      <path d="M 0 0 L 10 5 L 0 10 z" fill="#f01f26" />
    </marker>
    <marker id="arrow-green" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
      <path d="M 0 0 L 10 5 L 0 10 z" fill="#00fe9c" />
    </marker>
  </defs>

  <!-- 1. Controller Plane Container -->
  <rect x="15" y="15" width="190" height="210" rx="8" ry="8" fill="rgba(22, 22, 25, 0.65)" stroke="rgba(255, 255, 255, 0.08)" stroke-width="1.5" />
  <text x="25" y="32" font-family="'Outfit', sans-serif" font-size="10px" font-weight="600" fill="var(--text-muted)">Controller Plane</text>

  <!-- Controller Services -->
  <!-- Keystone -->
  <g transform="translate(25, 45)">
    <rect x="0" y="0" width="75" height="28" rx="5" ry="5" fill="rgba(240, 31, 38, 0.08)" stroke="#f01f26" stroke-width="1" />
    <text x="37" y="17" font-family="'Outfit', sans-serif" font-size="9px" font-weight="600" fill="#f3f4f6" text-anchor="middle">Keystone</text>
  </g>

  <!-- Glance -->
  <g transform="translate(115, 45)">
    <rect x="0" y="0" width="75" height="28" rx="5" ry="5" fill="rgba(240, 31, 38, 0.08)" stroke="#f01f26" stroke-width="1" />
    <text x="37" y="17" font-family="'Outfit', sans-serif" font-size="9px" font-weight="600" fill="#f3f4f6" text-anchor="middle">Glance</text>
  </g>

  <!-- Nova Ctrl -->
  <g transform="translate(25, 85)">
    <rect x="0" y="0" width="75" height="28" rx="5" ry="5" fill="rgba(240, 31, 38, 0.08)" stroke="#f01f26" stroke-width="1" />
    <text x="37" y="17" font-family="'Outfit', sans-serif" font-size="9px" font-weight="600" fill="#f3f4f6" text-anchor="middle">Nova Ctrl</text>
  </g>

  <!-- Neutron DBs -->
  <g transform="translate(115, 85)">
    <rect x="0" y="0" width="75" height="28" rx="5" ry="5" fill="rgba(240, 31, 38, 0.08)" stroke="#f01f26" stroke-width="1" />
    <text x="37" y="17" font-family="'Outfit', sans-serif" font-size="9px" font-weight="600" fill="#f3f4f6" text-anchor="middle">OVN DBs</text>
  </g>
`;

  // Barbican & KMS backend
  if (enableBarbican) {
    let kmsLabel = 'SoftHSM v2';
    if (barbicanBackend === 'vault') kmsLabel = 'Vault KMS';
    if (barbicanBackend === 'pkcs11') kmsLabel = 'Hardware HSM';

    svg += `
  <!-- Barbican API -->
  <g transform="translate(25, 125)">
    <rect x="0" y="0" width="165" height="26" rx="5" ry="5" fill="rgba(255, 94, 98, 0.08)" stroke="#ff5e62" stroke-width="1" />
    <text x="82" y="16" font-family="'Outfit', sans-serif" font-size="9px" font-weight="600" fill="#f3f4f6" text-anchor="middle">Barbican KMS API</text>
  </g>

  <!-- KMS Backend -->
  <g transform="translate(25, 165)">
    <rect x="0" y="0" width="165" height="26" rx="5" ry="5" fill="rgba(255, 94, 98, 0.1)" stroke="#ff5e62" stroke-width="1" />
    <text x="82" y="16" font-family="'Outfit', sans-serif" font-size="9px" font-weight="600" fill="#f3f4f6" text-anchor="middle">${kmsLabel}</text>
  </g>
`;
  }

  // 2. Middle Layer (SIEM & Backups)
  const hasSiem = siemIp && siemIp.trim() !== '';
  if (hasSiem) {
    svg += `
  <!-- SIEM Logger -->
  <g transform="translate(225, 30)">
    <rect x="0" y="0" width="115" height="40" rx="5" ry="5" fill="rgba(255, 255, 255, 0.05)" stroke="rgba(255,255,255,0.2)" stroke-width="1" />
    <text x="57" y="18" font-family="'Outfit', sans-serif" font-size="9px" font-weight="600" fill="#f3f4f6" text-anchor="middle">SIEM Syslog</text>
    <text x="57" y="30" font-family="'Outfit', sans-serif" font-size="7.5px" fill="var(--text-muted)" text-anchor="middle">${siemIp}</text>
  </g>
`;
  }

  const hasBackup = enableCinderBackup === 'true';
  if (hasBackup) {
    svg += `
  <!-- Backup Target -->
  <g transform="translate(225, 90)">
    <rect x="0" y="0" width="115" height="40" rx="5" ry="5" fill="rgba(255, 220, 102, 0.06)" stroke="var(--accent-yellow)" stroke-width="1" />
    <text x="57" y="18" font-family="'Outfit', sans-serif" font-size="9px" font-weight="600" fill="var(--accent-yellow)" text-anchor="middle">Cinder Backup</text>
    <text x="57" y="30" font-family="'Outfit', sans-serif" font-size="7.5px" fill="var(--text-muted)" text-anchor="middle">${cinderBackupTarget.toUpperCase()}</text>
  </g>
`;
  }

  // 3. Compute Plane Container
  svg += `
  <!-- Compute Plane Container -->
  <rect x="360" y="15" width="230" height="210" rx="8" ry="8" fill="rgba(22, 22, 25, 0.65)" stroke="rgba(255, 255, 255, 0.08)" stroke-width="1.5" />
  <text x="370" y="32" font-family="'Outfit', sans-serif" font-size="10px" font-weight="600" fill="var(--text-muted)">Nova Compute (${computeNodes} Nodes)</text>

  <!-- Compute Nodes -->
  <!-- Tenant VM -->
  <g transform="translate(370, 45)">
    <rect x="0" y="0" width="90" height="32" rx="5" ry="5" fill="rgba(240, 31, 38, 0.08)" stroke="#f01f26" stroke-width="1" />
    <text x="45" y="19" font-family="'Outfit', sans-serif" font-size="9px" font-weight="600" fill="#f3f4f6" text-anchor="middle">Tenant VM</text>
  </g>

  <!-- Libvirt / QEMU -->
  <g transform="translate(485, 45)">
    <rect x="0" y="0" width="90" height="32" rx="5" ry="5" fill="rgba(240, 31, 38, 0.08)" stroke="#f01f26" stroke-width="1" />
    <text x="45" y="19" font-family="'Outfit', sans-serif" font-size="9px" font-weight="600" fill="#f3f4f6" text-anchor="middle">Libvirt / QEMU</text>
  </g>

  <!-- SDN local agent -->
  <g transform="translate(485, 95)">
    <rect x="0" y="0" width="90" height="32" rx="5" ry="5" fill="rgba(240, 31, 38, 0.08)" stroke="#f01f26" stroke-width="1" />
    <text x="45" y="19" font-family="'Outfit', sans-serif" font-size="9px" font-weight="600" fill="#f3f4f6" text-anchor="middle">${neutronDriver === 'ovn' ? 'ovn-controller' : 'OVS Agent'}</text>
  </g>
`;

  if (enableK8s) {
    svg += `
  <!-- Kubernetes Cluster overlay -->
  <g transform="translate(370, 145)">
    <rect x="0" y="0" width="205" height="45" rx="5" ry="5" fill="rgba(0, 254, 156, 0.05)" stroke="#00fe9c" stroke-width="1" />
    <text x="10" y="16" font-family="'Outfit', sans-serif" font-size="9px" font-weight="600" fill="#00fe9c">Kubernetes Workloads</text>
    <text x="10" y="29" font-family="'Outfit', sans-serif" font-size="8px" fill="var(--text-muted)">Workers: ${k8sWorkerCount} | CSI: ${k8sCsi.toUpperCase()}</text>
  </g>
`;
  }

  // 4. Storage Fabric Tier
  svg += `
  <!-- Storage Tier Container -->
  <rect x="610" y="15" width="325" height="210" rx="8" ry="8" fill="rgba(22, 22, 25, 0.65)" stroke="rgba(255, 255, 255, 0.08)" stroke-width="1.5" />
  <text x="620" y="32" font-family="'Outfit', sans-serif" font-size="10px" font-weight="600" fill="var(--text-muted)">Storage Fabric Tier</text>
`;

  // Draw dynamically positioned active storage backends
  if (N === 0) {
    svg += `
  <text x="772" y="120" font-family="'Outfit', sans-serif" font-size="11px" fill="var(--text-muted)" text-anchor="middle">*No Active Storage Backends*</text>
`;
  } else {
    storageBlocks.forEach(s => {
      svg += `
  <!-- Storage Block: ${s.id} -->
  <g transform="translate(${s.x}, ${s.y})">
    <rect x="0" y="0" width="${s.w}" height="${s.h}" rx="5" ry="5" fill="rgba(22, 22, 25, 0.7)" stroke="${s.color}" stroke-width="1.2" />
    <text x="${s.w / 2}" y="17" font-family="'Outfit', sans-serif" font-size="9px" font-weight="600" fill="#f3f4f6" text-anchor="middle">${s.label}</text>
    <text x="${s.w / 2}" y="29" font-family="'Outfit', sans-serif" font-size="7.5px" fill="var(--text-muted)" text-anchor="middle">${s.detail}</text>
  </g>
`;
    });
  }

  // 5. Connection Paths (Horizontal curves)
  svg += `<!-- Connection Flows -->\n`;

  // Keystone control lines
  svg += `  <!-- Keystone Authentication Lines -->
  <path d="M 62 59 L 110 59" stroke="#ff5e62" stroke-width="1" fill="none" opacity="0.4" />
  <path d="M 62 59 L 62 85" stroke="#ff5e62" stroke-width="1" fill="none" opacity="0.4" />
  <path d="M 62 59 L 110 85" stroke="#ff5e62" stroke-width="1" fill="none" opacity="0.4" />
`;

  if (enableBarbican) {
    svg += `  <path d="M 62 59 L 62 125" stroke="#ff5e62" stroke-width="1" fill="none" opacity="0.4" />
  <!-- Barbican KMS link -->
  <path d="M 105 138 L 105 165" stroke="#ff5e62" stroke-width="1.2" fill="none" marker-end="url(#arrow-blue)" />
`;
  }

  // Glance storage path
  if (glanceBackend === 'rbd' && hasCeph) {
    const cephBlock = storageBlocks.find(b => b.id === 'ceph');
    if (cephBlock) {
      svg += `  <!-- Glance to Ceph RBD -->
  <path d="M 152 59 C 250 -10 550 -10 ${cephBlock.cx} ${cephBlock.y}" stroke="#f01f26" stroke-width="1.5" class="flow-path-animated" fill="none" marker-end="url(#arrow-red)" />
`;
    }
  } else if (glanceBackend === 's3' && hasStorageGrid) {
    const sgBlock = storageBlocks.find(b => b.id === 'storagegrid');
    if (sgBlock) {
      svg += `  <!-- Glance to StorageGrid S3 -->
  <path d="M 152 59 C 250 -10 550 -10 ${sgBlock.cx} ${sgBlock.y}" stroke="#00fe9c" stroke-width="1.5" class="flow-path-animated" fill="none" marker-end="url(#arrow-green)" />
`;
    }
  }

  // VM network line
  svg += `  <!-- Tenant VM to Local Agent -->
  <path d="M 460 61 L 485 61" stroke="#00fe9c" stroke-width="1.2" fill="none" />
  <!-- Local SDN Controller agent to Neutron DBs -->
  <path d="M 485 111 C 350 130 250 130 190 99" stroke="#00fe9c" stroke-width="1.2" stroke-dasharray="4,3" fill="none" marker-end="url(#arrow-green)" />
`;

  // Nova Control to Libvirt
  svg += `  <!-- Nova API to Libvirt Control Path -->
  <path d="M 100 99 C 250 90 300 61 485 61" stroke="#ff5e62" stroke-width="1.2" fill="none" marker-end="url(#arrow-blue)" />
`;

  // Cinder Libvirt Mount Storage Paths (Active data paths)
  storageBlocks.forEach(s => {
    if (s.id !== 'storagegrid') {
      svg += `  <!-- Libvirt / QEMU to Cinder ${s.label} Data Path -->
  <path d="M 535 61 C 580 61 600 ${s.cy} ${s.x} ${s.cy}" stroke="#f01f26" stroke-width="1.8" class="flow-path-animated" fill="none" marker-end="url(#arrow-red)" />
`;
    }
  });

  // K8s CSI driver mounting Cinder Volumes
  if (enableK8s) {
    svg += `  <!-- K8s CSI Mount Path -->
  <path d="M 480 145 C 480 115 535 115 535 77" stroke="#00fe9c" stroke-width="1.2" stroke-dasharray="3,3" fill="none" marker-end="url(#arrow-green)" />
`;
  }

  // Backup flow
  if (hasBackup) {
    const backupTargetBlock = glanceBackend === 's3' || cinderBackupTarget === 'storagegrid' ? 'storagegrid' : 'ceph';
    const tgt = storageBlocks.find(b => b.id === backupTargetBlock);
    if (tgt) {
      svg += `  <!-- Cinder Backup to ${tgt.label} -->
  <path d="M 535 61 C 380 90 350 100 340 110" stroke="#ff5e62" stroke-width="1.2" stroke-dasharray="4,4" fill="none" marker-end="url(#arrow-blue)" />
`;
    }
  }

  // SIEM logging paths
  if (hasSiem) {
    svg += `  <!-- SIEM syslog auditing streams -->
    <path d="M 15 120 L 225 50" stroke="#ff9e9e" stroke-width="0.8" stroke-dasharray="3,3" fill="none" opacity="0.3" />
    <path d="M 360 120 L 340 50" stroke="#ff9e9e" stroke-width="0.8" stroke-dasharray="3,3" fill="none" opacity="0.3" />
`;
  }

  svg += `</svg>`;
  return svg;
}

