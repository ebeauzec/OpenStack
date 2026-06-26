/**
 * OpenStack Architecture & Sizing Calculator
 * Provides calculations for Compute, Ceph Storage, Network, and Port requirements.
 */

export function calculateCompute(inputs) {
  const {
    vmCount,
    vmVcpus,
    vmRam,
    vmDisk,
    cpuOvercommit,
    ramOvercommit,
    nodeCores,
    nodeRam,
    nodeDisk,
    haBuffer,
    compliance = [],
    
    // Kubernetes integration
    enableK8s = false,
    k8sMasterCount = 3,
    k8sMasterVcpus = 4,
    k8sMasterRam = 16,
    k8sWorkerCount = 10,
    k8sWorkerVcpus = 8,
    k8sWorkerRam = 32,
    k8sWorkerDisk = 100,

    // IP Suffix Range Controls
    mgmtCtrlStart = 11,
    mgmtCtrlEnd = 20,
    mgmtCompStart = 101,
    mgmtCompEnd = 200,
    mgmtCephStart = 201,
    mgmtCephEnd = 250
  } = inputs;

  // 1. Calculate Kubernetes virtual resource footprint
  let k8sTotalVcpus = 0;
  let k8sTotalRam = 0;
  let k8sTotalDisk = 0;
  
  if (enableK8s) {
    k8sTotalVcpus = (k8sMasterCount * k8sMasterVcpus) + (k8sWorkerCount * k8sWorkerVcpus);
    k8sTotalRam = (k8sMasterCount * k8sMasterRam) + (k8sWorkerCount * k8sWorkerRam);
    k8sTotalDisk = (k8sWorkerCount * k8sWorkerDisk);
  }

  // 2. Aggregate standard workloads with Kubernetes node VM demands
  const totalVcpusNeeded = (vmCount * vmVcpus) + k8sTotalVcpus;
  const totalRamNeeded = (vmCount * vmRam) + k8sTotalRam;
  const totalLocalDiskNeeded = (vmCount * vmDisk) + k8sTotalDisk;

  // Effective resources per physical node (including overcommit)
  const effectiveCoresPerNode = nodeCores * cpuOvercommit;
  const effectiveRamPerNode = nodeRam * ramOvercommit;

  // Raw nodes needed
  const nodesForCpu = Math.ceil(totalVcpusNeeded / effectiveCoresPerNode);
  const nodesForRam = Math.ceil(totalRamNeeded / effectiveRamPerNode);
  
  // Storage sizing if using local disks on compute nodes
  const nodesForStorage = nodeDisk > 0 ? Math.ceil(totalLocalDiskNeeded / nodeDisk) : 0;

  // Base compute nodes is the max of CPU or RAM constraints
  const rawComputeNodes = Math.max(nodesForCpu, nodesForRam);
  
  // Total compute nodes including HA buffer
  const finalComputeNodes = rawComputeNodes + haBuffer;

  // Total physical resources provisioned
  const totalPhysicalCores = finalComputeNodes * nodeCores;
  const totalPhysicalRam = finalComputeNodes * nodeRam;
  const totalPhysicalLocalDisk = finalComputeNodes * nodeDisk;

  // Real ratios
  const realCpuRatio = (totalVcpusNeeded / totalPhysicalCores).toFixed(2);
  const realRamRatio = (totalRamNeeded / totalPhysicalRam).toFixed(2);

  // Compliance Alerts and Checks
  const complianceWarnings = [];
  
  if (compliance.includes('nca_cscc')) {
    if (cpuOvercommit > 2) {
      complianceWarnings.push("NCA CSCC (Saudi Arabia) Compliance Warning: Section CCC-1.1.2 recommends capping CPU overcommit at 2:1 for critical environments to maintain performance guarantees.");
    }
    if (ramOvercommit > 1) {
      complianceWarnings.push("NCA CSCC (Saudi Arabia) Compliance Warning: Section CCC-1.1.2 dictates 1:1 RAM allocation (no RAM overcommit) for cloud database nodes.");
    }
  }

  if (compliance.includes('desc_csp')) {
    if (cpuOvercommit > 3) {
      complianceWarnings.push("DESC CSP (Dubai) Compliance Warning: Section 5.1.3 mandates CPU overcommit should not exceed 3:1 to protect multi-tenant SLAs.");
    }
    if (ramOvercommit > 1) {
      complianceWarnings.push("DESC CSP (Dubai) Compliance Warning: Section 5.1.3 mandates 1:1 RAM allocation to prevent memory pressure swap events on hypervisors.");
    }
  }

  if (compliance.includes('nesa_ias')) {
    if (cpuOvercommit > 4) {
      complianceWarnings.push("NESA IAS (UAE) compliance recommends limiting CPU overcommit below 4:1 to prevent denial-of-service conditions via resource starvation.");
    }
  }

  // 3. IP Pool Validation Engine
  const ctrlRangeSize = mgmtCtrlEnd - mgmtCtrlStart + 1;
  const compRangeSize = mgmtCompEnd - mgmtCompStart + 1;
  const cephRangeSize = mgmtCephEnd - mgmtCephStart + 1;

  // Check capacity limits
  if (3 > ctrlRangeSize) {
    complianceWarnings.push(`IP Range Error: Controllers pool (${mgmtCtrlStart}-${mgmtCtrlEnd}) has only ${ctrlRangeSize} addresses, but 3 dedicated IPs are required for HA.`);
  }
  if (finalComputeNodes > compRangeSize) {
    complianceWarnings.push(`IP Range Error: Computes pool (${mgmtCompStart}-${mgmtCompEnd}) has only ${compRangeSize} addresses, but the sizing sizing requests ${finalComputeNodes} Compute hosts.`);
  }
  
  // Check overlaps
  const checkOverlap = (s1, e1, s2, e2, name1, name2) => {
    if (s1 <= e2 && s2 <= e1) {
      complianceWarnings.push(`IP Range Overlap Error: ${name1} range (${s1}-${e1}) overlaps with ${name2} range (${s2}-${e2}). Adjust pool suffix ranges.`);
    }
  };

  checkOverlap(mgmtCtrlStart, mgmtCtrlEnd, mgmtCompStart, mgmtCompEnd, "Controllers", "Computes");
  checkOverlap(mgmtCompStart, mgmtCompEnd, mgmtCephStart, mgmtCephEnd, "Computes", "Ceph Nodes");
  checkOverlap(mgmtCtrlStart, mgmtCtrlEnd, mgmtCephStart, mgmtCephEnd, "Controllers", "Ceph Nodes");

  // 4. Cinder replication DR bandwidth estimations
  let drBandwidthMbps = 0;
  let drLatencyMsLimit = 0;
  let drDailyChangeGb = 0;
  const { enableCinderReplication = false, cinderReplMode = 'async', cinderCapacityTb = 150 } = inputs;
  if (enableCinderReplication) {
    drDailyChangeGb = (cinderCapacityTb * 1024 * 0.05); // 5% daily churn rate standard
    if (cinderReplMode === 'sync') {
      drBandwidthMbps = 1000;
      drLatencyMsLimit = 2; // Sync needs <= 2ms RTT
    } else {
      drBandwidthMbps = Math.round(((drDailyChangeGb * 1024) / 14400) * 8);
      drLatencyMsLimit = 50; // Async allows up to 50ms RTT
    }
  }

  return {
    totalVcpusNeeded,
    totalRamNeeded,
    totalLocalDiskNeeded,
    nodesForCpu,
    nodesForRam,
    nodesForStorage,
    rawComputeNodes,
    finalComputeNodes,
    totalPhysicalCores,
    totalPhysicalRam,
    totalPhysicalLocalDisk,
    realCpuRatio,
    realRamRatio,
    complianceWarnings,
    k8sTotalVcpus,
    k8sTotalRam,
    k8sTotalDisk,
    drBandwidthMbps,
    drLatencyMsLimit,
    drDailyChangeGb
  };
}

export function calculateCeph(inputs) {
  const {
    cinderCapacityTb,
    manilaCapacityTb,
    glanceCapacityTb,
    replicaFactor,
    osdSizeTb,
    osdPerNode,
    utilizationLimit, // e.g. 0.75
    growthBuffer, // e.g. 1.2 for 20%
    enableStoragegrid = false,
    storagegridCapacityTb = 0,
    
    // IP Suffix Range Controls
    mgmtCephStart = 201,
    mgmtCephEnd = 250
  } = inputs;

  // Total Usable capacity needed on Ceph
  const totalUsableCapacityTb = (cinderCapacityTb + manilaCapacityTb + glanceCapacityTb) * growthBuffer;

  // Raw capacity needed (accounting for replicas and the safe utilization limit)
  const rawCapacityNeededTb = (totalUsableCapacityTb * replicaFactor) / utilizationLimit;

  // Total number of OSDs needed
  const totalOsdNeeded = Math.ceil(rawCapacityNeededTb / osdSizeTb);

  // Ceph Storage Node requirements
  const rawCephNodes = Math.max(3, Math.ceil(totalOsdNeeded / osdPerNode)); // Min 3 nodes for Ceph HA
  
  // Recalculate OSDs to distribute evenly across nodes if necessary
  const finalOsdCount = Math.max(totalOsdNeeded, rawCephNodes * osdPerNode);

  // PG Calculations
  const targetTotalPgs = (finalOsdCount * 100) / replicaFactor;
  
  const poolAllocations = [
    { name: 'volumes (Cinder)', pct: 0.50, key: 'cinder' },
    { name: 'shares (Manila)', pct: 0.20, key: 'manila' },
    { name: 'images (Glance)', pct: 0.10, key: 'glance' },
    { name: 'vms (Nova Ephemeral)', pct: 0.20, key: 'nova' }
  ];

  const pools = poolAllocations.map(pool => {
    const rawPg = (targetTotalPgs * pool.pct);
    const pg = nextPowerOf2(rawPg);
    return {
      name: pool.name,
      key: pool.key,
      pct: pool.pct * 100,
      pgCount: Math.max(16, pg)
    };
  });

  const totalCalculatedPgs = pools.reduce((sum, p) => sum + p.pgCount, 0);

  // StorageGrid specific sizing metrics
  const storagegridRawCapacityNeededTb = enableStoragegrid ? (storagegridCapacityTb * 1.3) : 0; // 30% metadata and overhead

  // IP validation warnings for Ceph Nodes
  const cephRangeSize = mgmtCephEnd - mgmtCephStart + 1;
  const cephIpWarnings = [];
  if (rawCephNodes > cephRangeSize) {
    cephIpWarnings.push(`Ceph IP Range Error: Ceph OSD pool (${mgmtCephStart}-${mgmtCephEnd}) has only ${cephRangeSize} addresses, but Ceph sizing requires ${rawCephNodes} nodes.`);
  }

  return {
    totalUsableCapacityTb,
    rawCapacityNeededTb,
    totalOsdNeeded,
    cephNodes: rawCephNodes,
    finalOsdCount,
    pools,
    totalCalculatedPgs,
    osdRamRequirementGb: finalOsdCount * 4,
    osdCpuRequirementCores: Math.ceil(finalOsdCount * 1),
    storagegridRawCapacityNeededTb,
    cephIpWarnings
  };
}

// Helper to find the next power of 2 for PG counts
function nextPowerOf2(number) {
  if (number <= 0) return 16;
  let power = 1;
  while (power < number) {
    power *= 2;
  }
  return power;
}

export function calculateNetwork(inputs) {
  const {
    computeNodes,
    cephNodes,
    controllerNodes = 3,
    linkSpeedGbps = 10,
    enableStoragegrid = false
  } = inputs;

  const storageNodesCount = cephNodes + (enableStoragegrid ? 2 : 0);
  const storageFabricBandwidthGbps = storageNodesCount * linkSpeedGbps * 2;
  const overlayFabricBandwidthGbps = computeNodes * linkSpeedGbps;

  return {
    totalPortsRequired: (computeNodes + cephNodes + controllerNodes + (enableStoragegrid ? 2 : 0)) * 4,
    recommendedSwitchPorts: Math.ceil(((computeNodes + cephNodes + controllerNodes + (enableStoragegrid ? 2 : 0)) * 4) * 1.2),
    storageFabricBandwidthGbps,
    overlayFabricBandwidthGbps
  };
}
