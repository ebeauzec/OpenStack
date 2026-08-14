import { calculateCompute, calculateCeph, calculateNetwork } from './calculator.js';
import { 
  generateHLD, 
  generateLLD, 
  generateAnsible, 
  generateCinderConf, 
  generateManilaConf, 
  generateCephConf, 
  generateSIEMConf,
  generateGlanceConf,
  generateNovaConf,
  generateNeutronConf,
  generateKeystoneConf,
  generateJujuBundle,
  generateRhospTemplates,
  generateK8sCsi,
  generateCloudConfig,
  generateDeploymentSteps,
  generateK8sVelero,
  generateProposalDesign,
  generateLiveTopologySVG
} from './templates.js';

// Application State
const state = {
  currentStep: 1,
  inputs: {
    projectName: 'CSP Cloud Production-West',
    openstackDistro: 'kolla',
    openstackVersion: '2026.1',
    cspScale: 'medium',
    industry: 'financial',
    compliance: ['soc2', 'pci-dss'],
    
    // Compute & K8s sizing
    vmCount: 400,
    vmVcpus: 4,
    vmRam: 16,
    vmDisk: 50,
    cpuOvercommit: 3,
    ramOvercommit: 1,
    nodeCores: 64,
    nodeRam: 256,
    nodeDisk: 1000,
    haBuffer: 2,
    novaCpuMode: 'host-model',
    novaInstanceHa: false,
    enableK8s: false,
    k8sMasterCount: 3,
    k8sMasterVcpus: 4,
    k8sMasterRam: 16,
    k8sWorkerCount: 10,
    k8sWorkerVcpus: 8,
    k8sWorkerRam: 32,
    k8sWorkerDisk: 100,
    k8sCni: 'calico',
    k8sCsi: 'cinder',
    enableVelero: false,

    // Cinder
    cinderCapacityTb: 150,
    cinderBackends: ['ceph'],
    netappIp: '10.10.30.50',
    netappSvm: 'svm_cinder_prod',
    netappProto: 'iscsi',
    netappDedup: 'true',
    netappCompression: 'true',
    emcIp: '10.10.30.60',
    emcPool: 'sp_gold_cinder',
    pureIp: '10.10.30.80',
    pureProto: 'iscsi',
    hpeIp: '10.10.30.90',
    hpePlatform: 'primera_alletra',
    hpeProto: 'fc',
    dellpsIp: '10.10.30.95',
    dellpsPlatform: 'powerstore',
    dellpsProto: 'iscsi',
    vastIp: '10.10.30.110',
    vastVippool: 'cinder-vip-pool',
    vastRootExport: 'manila',
    enableCinderBackup: 'false',
    cinderBackupTarget: 'storagegrid',
    enableBarbican: false,
    barbicanBackend: 'vault',
    enableCinderReplication: false,
    cinderReplTarget: '10.20.30.50',
    cinderReplMode: 'async',
    cinderMultiAttach: false,
    cinderQosEnable: false,
    cinderQosMaxIops: 5000,
    cinderQosMaxBps: 104857600,
 
    // Manila
    manilaCapacityTb: 50,
    manilaDhss: 'false',
    manilaBackends: ['cephfs_native'],
    enableManilaReplication: 'false',
 
    // Ceph
    osdSizeTb: 8,
    osdPerNode: 12,
    osdMedia: 'ssd',
    replicaFactor: 3,
    glanceCapacityTb: 5,
    glanceBackend: 'rbd',
    utilizationLimit: 0.75,
    growthBuffer: 1.2,
 
    // Security, Network & Object Storage
    mgmtSubnet: '10.10.10.0/24',
    apiSubnet: '10.10.20.0/24',
    storageFrontSubnet: '10.10.30.0/24',
    storageBackSubnet: '10.10.40.0/24',
    tenantSubnet: '10.10.50.0/24',
    extSubnet: '10.10.100.0/24',
    siemIp: '10.10.99.100',
    siemPort: 514,
    linkSpeedGbps: 10,
    neutronDriver: 'ovn',
    tenantTunnelProto: 'geneve',
    
    // IP Suffixes
    mgmtCtrlStart: 11,
    mgmtCtrlEnd: 20,
    mgmtCompStart: 101,
    mgmtCompEnd: 200,
    mgmtCephStart: 201,
    mgmtCephEnd: 250,

    // StorageGrid
    enableStoragegrid: false,
    storagegridIp: '10.10.30.70',
    storagegridPort: 10443,
    storagegridAccessKey: 'SG_ACCESS_KEY_ID',
    storagegridSecretKey: 'SG_SECRET_ACCESS_KEY',
    storagegridBucket: 'glance-images',
    storagegridIlm: '2_Copies_Dual_Site',
    storagegridCapacityTb: 50
  },
  results: {
    compute: {},
    ceph: {},
    network: {}
  },
  currentTab: 'proposal_design',
  manifest: null,
  manifestSource: 'bundled'
};

// Greenfield Defaults Backup
const defaultInputs = JSON.parse(JSON.stringify(state.inputs));

// Bundled version/compliance reference manifest (baked in for the offline standalone build;
// the modular dev build overwrites this from data/versions.json on load if reachable).
// This is DATA ONLY -- never executed as code, whether loaded locally or fetched from MANIFEST_URL.
const EMBEDDED_MANIFEST = {
  manifestVersion: 1,
  generatedAt: '2026-08-14T00:00:00Z',
  sourceNote: 'Curated snapshot, web-verified as of 2026-08-14.',
  openstack: {
    latest: '2026.1',
    releases: [
      { value: '2026.1', codename: 'Gazpacho', slurp: true, releaseDate: '2026-04-01', status: 'current' },
      { value: '2025.2', codename: 'Flamingo', slurp: false, releaseDate: '2025-10-01', status: 'supported' },
      { value: '2025.1', codename: 'Epoxy', slurp: true, releaseDate: '2025-04-02', status: 'supported' },
      { value: '2024.2', codename: 'Dalmatian', slurp: false, releaseDate: '2024-10-02', status: 'supported' },
      { value: '2024.1', codename: 'Caracal', slurp: true, releaseDate: '2024-04-03', status: 'supported' },
      { value: '2023.2', codename: 'Bobcat', slurp: false, releaseDate: '2023-10-04', status: 'eol-soon' },
      { value: '2023.1', codename: 'Antelope', slurp: true, releaseDate: '2023-03-22', status: 'eol-soon' },
      { value: 'zed', codename: 'Zed', slurp: false, releaseDate: '2022-10-05', status: 'eol' },
      { value: 'yoga', codename: 'Yoga', slurp: false, releaseDate: '2022-03-30', status: 'eol' }
    ]
  },
  redhat: {
    current: '18.0',
    options: [
      { value: '18.0', label: 'RHOSO 18.0', status: 'current' },
      { value: '17.1', label: 'RHOSP 17.1 (Classic)', status: 'deprecated', deprecatedDate: '2027-09-22' },
      { value: '16.2', label: 'RHOSP 16.2 (Classic)', status: 'deprecated', deprecatedDate: '2027-04-30' },
      { value: '13.0', label: 'RHOSP 13.0', status: 'eol', eolDate: '2023-06-27' }
    ]
  },
  adjacentProjects: {
    kollaAnsible: 'Actively maintained, tracks the upstream release train.',
    canonicalCharmedOpenstack: 'Actively maintained (classic charms); Canonical steers new small/edge deployments toward Sunbeam (K8s-native) instead.',
    ceph: 'Current stable: Tentacle (20.2.x). Prior: Squid (19.x), Reef (18.x).',
    neutronSdn: 'ML2/OVN is the recommended default; ML2/OVS is legacy.'
  },
  compliance: {
    pciDss: 'v4.0.1 current. v5.0 in development, no release date.',
    saudiNca: 'Correct framework name is NCA CCC (Cloud Cybersecurity Controls), current CCC-2:2024. "CSCC" is a different, non-cloud-specific framework.',
    dubaiDesc: 'DESC CSP Security Standard, layered on Information Security Regulation (ISR) v3.0.',
    uaeNesa: 'UAE IAR/IAS v2 (Sept 2025), administered by TDRA / Cyber Security Council. "NESA IAS" remains the common colloquial label.',
    hipaa: 'Encryption/MFA mandate is a proposed NPRM, not yet final as of 2026-08.',
    gdpr: 'Core text unchanged; EU Data Act Ch. VII (effective 2025-09-12) adds binding data-sovereignty/egress provisions worth citing alongside GDPR.'
  },
  storageVendors: {
    pure: 'Pure Storage FlashArray -- Cinder: iSCSI/FC/NVMe-RoCE/NVMe-TCP. No official Manila driver (FlashBlade only).',
    hpe: 'HPE Alletra/Primera/3PAR -- Cinder: FC/iSCSI via WSAPI (443 Primera/Alletra, 8080 3PAR). No official Manila driver confirmed.',
    dellps: 'Dell PowerStore/PowerMax -- Cinder: iSCSI/FC/NVMe-TCP. PowerMax managed via Unisphere (8443). No official Manila driver confirmed.',
    vast: 'VAST Data -- Cinder (NVMe-TCP) AND Manila (NFS) both officially supported from one VMS management plane.'
  }
};

// URL the in-app "Check for Updates" button fetches for a fresher manifest. Only ever
// used for an explicit, user-triggered fetch (never automatic/background) -- see btn-fetch-updates.
const MANIFEST_URL = 'https://raw.githubusercontent.com/ebeauzec/OpenStack/main/data/versions.json';

// DOM Elements
const elements = {
  stepperItems: document.querySelectorAll('.step-item'),
  panels: document.querySelectorAll('.step-panel'),
  btnPrev: document.getElementById('btn-prev'),
  btnNext: document.getElementById('btn-next'),
  btnReset: document.getElementById('btn-reset'),
  toastContainer: document.getElementById('toast-container'),
  toastText: document.getElementById('toast-text'),
  btnCheckUpdates: document.getElementById('btn-check-updates'),
  updateModalOverlay: document.getElementById('update-modal-overlay'),
  updateModalClose: document.getElementById('update-modal-close'),
  updateModalBody: document.getElementById('update-modal-body'),
  updateModalStatus: document.getElementById('update-modal-status'),
  btnFetchUpdates: document.getElementById('btn-fetch-updates'),

  // Results Tab Buttons & Outputs
  tabButtons: document.querySelectorAll('.tab-btn'),
  displayFilename: document.getElementById('display-filename'),
  displayContent: document.getElementById('display-content'),
  btnCopy: document.getElementById('btn-copy'),
  btnDownload: document.getElementById('btn-download')
};
 
// Initialize Application
document.addEventListener('DOMContentLoaded', () => {
  setupEventListeners();
  toggleDynamicViews();
  updateComplianceText();
  updateCinderDiagram();
  updateManilaDiagram();
  runCalculations();
  updateUI();
  loadLocalManifest();
});

function toggleDynamicViews() {
  // 1. Dynamic OpenStack version dropdown options update
  updateVersionOptions();

  // 2. Kubernetes options panel visibility
  const k8sOpts = document.getElementById('k8s-opts-group');
  if (k8sOpts) {
    k8sOpts.style.display = state.inputs.enableK8s ? 'flex' : 'none';
  }

  // 3. Cinder Backup options panel visibility
  const backupOpts = document.getElementById('cinder-backup-opts-group');
  if (backupOpts) {
    backupOpts.style.display = state.inputs.enableCinderBackup === 'true' ? 'flex' : 'none';
  }

  // 4. Cinder Replication options panel visibility
  const replOpts = document.getElementById('cinder-replication-opts-group');
  if (replOpts) {
    replOpts.style.display = state.inputs.enableCinderReplication ? 'flex' : 'none';
  }

  // 4a. Barbican Options visibility
  const barbicanOpts = document.getElementById('barbican-opts-group');
  if (barbicanOpts) {
    barbicanOpts.style.display = state.inputs.enableBarbican ? 'flex' : 'none';
  }

  // 4b. Cinder QoS Options visibility
  const qosOpts = document.getElementById('cinder-qos-opts');
  if (qosOpts) {
    qosOpts.style.display = state.inputs.cinderQosEnable ? 'flex' : 'none';
  }

  // 4c. Auto-compute NetApp StorageGrid Status
  const sgActive = state.inputs.glanceBackend === 's3' || 
                   (state.inputs.enableCinderBackup === 'true' && state.inputs.cinderBackupTarget === 'storagegrid') ||
                   (state.inputs.enableK8s && state.inputs.enableVelero);

  state.inputs.enableStoragegrid = sgActive;
  
  const sgCard = document.getElementById('card-enable-storagegrid');
  const sgStatusDesc = document.getElementById('storagegrid-status-desc');
  const sgDot = sgCard ? sgCard.querySelector('.backend-dot') : null;
  const sgOpts = document.getElementById('storagegrid-opts-group');

  if (sgCard) {
    sgCard.classList.toggle('selected', sgActive);
    if (sgStatusDesc) {
      sgStatusDesc.innerText = sgActive 
        ? 'Active. Configured dynamically as S3 backend storage for Glance/Cinder/Kubernetes.'
        : 'Inactive. (Automatically activated when selecting NetApp StorageGrid S3 as Glance store, Cinder backup target, or Kubernetes Velero target).';
    }
    if (sgDot) {
      sgDot.style.backgroundColor = sgActive ? 'var(--openstack-red)' : 'var(--openstack-grey)';
    }
  }

  if (sgOpts) {
    sgOpts.style.display = sgActive ? 'flex' : 'none';
  }

  // 5. Tab buttons visibility in Step 7
  const btnAnsible = document.getElementById('tab-btn-ansible');
  const btnJuju = document.getElementById('tab-btn-juju');
  const btnRhosp = document.getElementById('tab-btn-rhosp');
  const btnK8sCsi = document.getElementById('tab-btn-k8s-csi');
  const btnCloudConfig = document.getElementById('tab-btn-cloud-config');
  const btnK8sVelero = document.getElementById('tab-btn-k8s-velero');

  if (btnAnsible) btnAnsible.style.display = state.inputs.openstackDistro === 'kolla' ? 'block' : 'none';
  if (btnJuju) btnJuju.style.display = state.inputs.openstackDistro === 'juju' ? 'block' : 'none';
  if (btnRhosp) btnRhosp.style.display = state.inputs.openstackDistro === 'rhosp' ? 'block' : 'none';

  const showK8sTabs = state.inputs.enableK8s;
  if (btnK8sCsi) btnK8sCsi.style.display = showK8sTabs ? 'block' : 'none';
  if (btnCloudConfig) btnCloudConfig.style.display = showK8sTabs ? 'block' : 'none';

  const showVeleroTab = showK8sTabs && state.inputs.enableVelero;
  if (btnK8sVelero) btnK8sVelero.style.display = showVeleroTab ? 'block' : 'none';

  // If the active tab was hidden, reset to HLD
  const distro = state.inputs.openstackDistro;
  if (state.currentTab === 'ansible' && distro !== 'kolla') state.currentTab = 'proposal_design';
  if (state.currentTab === 'juju_bundle' && distro !== 'juju') state.currentTab = 'proposal_design';
  if (state.currentTab === 'rhosp_templates' && distro !== 'rhosp') state.currentTab = 'proposal_design';
  if ((state.currentTab === 'kubernetes_csi' || state.currentTab === 'cloud_config') && !showK8sTabs) state.currentTab = 'proposal_design';
  if (state.currentTab === 'k8s_velero' && !showVeleroTab) state.currentTab = 'proposal_design';

  // Reset tab button highlight
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === state.currentTab);
  });
}

function updateVersionOptions() {
  const distro = state.inputs.openstackDistro;
  const versionSelect = document.getElementById('openstackVersion');
  if (!versionSelect) return;

  const versionsMap = {
    kolla: [
      { value: '2026.1', label: '2026.1 (Gazpacho - SLURP, Current)' },
      { value: '2025.2', label: '2025.2 (Flamingo)' },
      { value: '2025.1', label: '2025.1 (Epoxy - SLURP)' },
      { value: '2024.2', label: '2024.2 (Dalmatian)' },
      { value: '2024.1', label: '2024.1 (Caracal - SLURP)' },
      { value: '2023.2', label: '2023.2 (Bobcat)' },
      { value: '2023.1', label: '2023.1 (Antelope - SLURP)' },
      { value: 'zed', label: 'Zed (EOL)' },
      { value: 'yoga', label: 'Yoga (EOL)' }
    ],
    juju: [
      { value: '2026.1', label: '2026.1 (Gazpacho - SLURP, Current)' },
      { value: '2025.2', label: '2025.2 (Flamingo)' },
      { value: '2025.1', label: '2025.1 (Epoxy - SLURP)' },
      { value: '2024.2', label: '2024.2 (Dalmatian)' },
      { value: '2024.1', label: '2024.1 (Caracal - SLURP)' },
      { value: '2023.2', label: '2023.2 (Bobcat)' },
      { value: '2023.1', label: '2023.1 (Antelope - SLURP)' },
      { value: 'zed', label: 'Zed (EOL)' },
      { value: 'yoga', label: 'Yoga (EOL)' }
    ],
    rhosp: [
      { value: '18.0', label: 'RHOSO 18.0 (OpenStack Services on OpenShift - Current)' },
      { value: '17.1', label: 'RHOSP 17.1 (Classic Director-based, deprecated 2027-09-22)' },
      { value: '16.2', label: 'RHOSP 16.2 (Classic, deprecated 2027-04-30)' },
      { value: '13.0', label: 'RHOSP 13.0 (EOL - unsupported since 2023-06-27)' }
    ]
  };

  const currentOptions = versionsMap[distro] || [];
  const oldVal = state.inputs.openstackVersion;

  // Render options only if they differ to avoid resets
  const existingOptions = Array.from(versionSelect.options).map(o => o.value);
  const newOptions = currentOptions.map(o => o.value);
  if (JSON.stringify(existingOptions) === JSON.stringify(newOptions)) {
    return;
  }

  versionSelect.innerHTML = '';
  currentOptions.forEach(opt => {
    const option = document.createElement('option');
    option.value = opt.value;
    option.text = opt.label;
    if (opt.value === oldVal) {
      option.selected = true;
    }
    versionSelect.appendChild(option);
  });

  if (!newOptions.includes(oldVal) && currentOptions.length > 0) {
    versionSelect.value = currentOptions[0].value;
    state.inputs.openstackVersion = currentOptions[0].value;
  }
}

function resetGreenfield() {
  if (!confirm("Are you sure you want to reset all configurations to greenfield defaults and start over?")) {
    return;
  }
  
  // 1. Reset inputs state to deep clone of defaultInputs
  state.inputs = JSON.parse(JSON.stringify(defaultInputs));
  state.currentStep = 1;
  state.currentTab = 'proposal_design';

  // 2. Sync all DOM inputs to the new state
  syncDOMFromState();

  // 3. Navigate back to step 1
  goToStep(1);

  // 4. Re-calculate and update UI
  toggleDynamicViews();
  updateCinderDiagram();
  updateManilaDiagram();
  runCalculations();
  updateUI();
  
  showToast("Configuration reset to Greenfield default parameters.");
}

const CINDER_BACKEND_OPTS_IDS = {
  ceph: 'cinder-opts-ceph',
  netapp: 'cinder-opts-netapp',
  emc: 'cinder-opts-emc',
  pure: 'cinder-opts-pure',
  hpe: 'cinder-opts-hpe',
  dellps: 'cinder-opts-dellps',
  vast: 'cinder-opts-vast'
};

function updateCinderBackendOptsVisibility(activeBackends) {
  Object.entries(CINDER_BACKEND_OPTS_IDS).forEach(([backend, elId]) => {
    const el = document.getElementById(elId);
    if (el) el.style.display = activeBackends.includes(backend) ? 'block' : 'none';
  });
}

function updateManilaBackendOptsVisibility(activeBackends) {
  const vastOpts = document.getElementById('manila-opts-vast');
  if (vastOpts) vastOpts.style.display = activeBackends.includes('vast') ? 'block' : 'none';
}

function syncDOMFromState() {
  // 1. Standard inputs (text, number, selects, checkboxes)
  for (const [key, val] of Object.entries(state.inputs)) {
    let domId = key;
    if (key === 'netappIp') domId = 'cinderNetAppIp';
    else if (key === 'netappSvm') domId = 'cinderNetAppSvm';
    else if (key === 'netappProto') domId = 'cinderNetAppProto';
    else if (key === 'emcIp') domId = 'cinderEmcIp';
    else if (key === 'emcPool') domId = 'cinderEmcPool';

    const el = document.getElementById(domId);
    if (el) {
      if (el.type === 'checkbox') {
        if (domId === 'enableCinderBackup' || domId === 'enableManilaReplication') {
          el.checked = (val === 'true');
        } else {
          el.checked = !!val;
        }
      } else {
        el.value = val;
      }
    }
  }

  // 2. Compliance checkbox group
  const complianceList = state.inputs.compliance || [];
  document.querySelectorAll('input[name="compliance"]').forEach(cb => {
    cb.checked = complianceList.includes(cb.value);
  });
  updateComplianceText();

  // 3. Multi-select Cinder Backend cards
  const cinderBackends = state.inputs.cinderBackends || [];
  document.querySelectorAll('[data-backend]').forEach(card => {
    const isSelected = cinderBackends.includes(card.dataset.backend);
    card.classList.toggle('selected', isSelected);
  });
  // Toggle option groups
  updateCinderBackendOptsVisibility(cinderBackends);

  // 4. Multi-select Manila Backend cards
  const manilaBackends = state.inputs.manilaBackends || [];
  document.querySelectorAll('[data-manila-backend]').forEach(card => {
    const isSelected = manilaBackends.includes(card.getAttribute('data-manila-backend') || card.dataset.manilaBackend);
    card.classList.toggle('selected', isSelected);
  });
  updateManilaBackendOptsVisibility(manilaBackends);

  // 5. Manila DHSS cards
  const manilaDhss = state.inputs.manilaDhss;
  document.querySelectorAll('[data-dhss]').forEach(card => {
    card.classList.toggle('selected', card.dataset.dhss === manilaDhss);
  });

  // Sync version options
  updateVersionOptions();
}
 
// Setup Form and Navigation Event Listeners
function setupEventListeners() {
  // Stepper Click Navigation
  elements.stepperItems.forEach(item => {
    item.addEventListener('click', () => {
      const targetStep = parseInt(item.dataset.step);
      if (targetStep < state.currentStep || validateStep(state.currentStep)) {
        goToStep(targetStep);
      }
    });
  });
 
  // Next / Back Buttons
  elements.btnNext.addEventListener('click', () => {
    if (state.currentStep < 7) {
      if (validateStep(state.currentStep)) {
        goToStep(state.currentStep + 1);
      }
    } else {
      showToast('Architecture design package generated and verified!');
    }
  });
 
  elements.btnPrev.addEventListener('click', () => {
    if (state.currentStep > 1) {
      goToStep(state.currentStep - 1);
    }
  });

  if (elements.btnReset) {
    elements.btnReset.addEventListener('click', () => {
      resetGreenfield();
    });
  }

  // Version & Compliance Reference / Check for Updates
  if (elements.btnCheckUpdates) {
    elements.btnCheckUpdates.addEventListener('click', openUpdateModal);
  }
  if (elements.updateModalClose) {
    elements.updateModalClose.addEventListener('click', closeUpdateModal);
  }
  if (elements.updateModalOverlay) {
    elements.updateModalOverlay.addEventListener('click', (e) => {
      if (e.target === elements.updateModalOverlay) closeUpdateModal();
    });
  }
  if (elements.btnFetchUpdates) {
    elements.btnFetchUpdates.addEventListener('click', checkForUpdatesOnline);
  }

  // Dynamic Inputs Watcher
  const inputsToWatch = [
    'projectName', 'openstackDistro', 'openstackVersion', 'cspScale', 'industry', 'vmCount', 'vmVcpus', 'vmRam', 'vmDisk',
    'cpuOvercommit', 'ramOvercommit', 'nodeCores', 'nodeRam', 'nodeDisk', 'haBuffer',
    'novaCpuMode', 'novaInstanceHa',
    'enableK8s', 'k8sMasterCount', 'k8sWorkerCount', 'k8sMasterVcpus', 'k8sMasterRam',
    'k8sWorkerVcpus', 'k8sWorkerRam', 'k8sWorkerDisk', 'k8sCni', 'k8sCsi', 'enableVelero',
    'cinderCapacityTb', 'cinderNetAppIp', 'cinderNetAppSvm', 'cinderNetAppProto', 'netappDedup',
    'cinderEmcIp', 'cinderEmcPool',
    'pureIp', 'pureProto', 'hpeIp', 'hpePlatform', 'hpeProto', 'dellpsIp', 'dellpsPlatform', 'dellpsProto',
    'vastIp', 'vastVippool', 'vastRootExport',
    'enableCinderBackup', 'cinderBackupTarget',
    'enableBarbican', 'barbicanBackend', 'enableCinderReplication', 'cinderReplTarget', 'cinderReplMode',
    'cinderMultiAttach', 'cinderQosEnable', 'cinderQosMaxIops', 'cinderQosMaxBps', 'manilaCapacityTb',
    'enableManilaReplication', 'osdSizeTb', 'osdPerNode',
    'osdMedia', 'replicaFactor', 'glanceCapacityTb', 'glanceBackend', 'utilizationLimit', 'growthBuffer',
    'mgmtSubnet', 'apiSubnet', 'storageFrontSubnet', 'storageBackSubnet', 'tenantSubnet', 'extSubnet',
    'siemIp', 'siemPort', 'linkSpeedGbps',
    'mgmtCtrlStart', 'mgmtCtrlEnd', 'mgmtCompStart', 'mgmtCompEnd', 'mgmtCephStart', 'mgmtCephEnd',
    'storagegridIp', 'storagegridPort', 'storagegridAccessKey', 'storagegridSecretKey',
    'storagegridBucket', 'storagegridIlm', 'storagegridCapacityTb',
    'neutronDriver', 'tenantTunnelProto'
  ];
 
  inputsToWatch.forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      const updateValue = (e) => {
        let val = e.target.value;
        if (e.target.type === 'checkbox') {
          if (id === 'enableCinderBackup' || id === 'enableManilaReplication') {
            val = e.target.checked ? 'true' : 'false';
          } else {
            val = e.target.checked;
          }
        } else if (e.target.type === 'number') {
          val = parseFloat(val) || 0;
        }
        
        let key = id;
        if (id === 'cinderNetAppIp') key = 'netappIp';
        else if (id === 'cinderNetAppSvm') key = 'netappSvm';
        else if (id === 'cinderNetAppProto') key = 'netappProto';
        else if (id === 'cinderEmcIp') key = 'emcIp';
        else if (id === 'cinderEmcPool') key = 'emcPool';
        
        state.inputs[key] = val;

        // Custom Driver-to-Tunnel mapping defaults sync
        if (id === 'neutronDriver') {
          const protoSelect = document.getElementById('tenantTunnelProto');
          if (protoSelect) {
            if (val === 'ovn') {
              state.inputs.tenantTunnelProto = 'geneve';
              protoSelect.value = 'geneve';
            } else if (val === 'ml2ovs') {
              state.inputs.tenantTunnelProto = 'vxlan';
              protoSelect.value = 'vxlan';
            }
          }
        }
        
        toggleDynamicViews();
        runCalculations();
        updateUI();
      };
      
      el.addEventListener('input', updateValue);
      el.addEventListener('change', updateValue);
    }
  });
 
  // Compliance checkboxes
  document.querySelectorAll('input[name="compliance"]').forEach(cb => {
    cb.addEventListener('change', () => {
      const activeCompliance = [];
      document.querySelectorAll('input[name="compliance"]:checked').forEach(c => {
        activeCompliance.push(c.value);
      });
      state.inputs.compliance = activeCompliance;
      updateComplianceText();
      runCalculations();
      updateUI();
    });
  });

  // Vertical dropdown changes: auto-set defaults
  const industryEl = document.getElementById('industry');
  if (industryEl) {
    industryEl.addEventListener('change', (e) => {
      const selected = e.target.value;
      state.inputs.industry = selected;
      
      const compCheckboxes = document.querySelectorAll('input[name="compliance"]');
      compCheckboxes.forEach(cb => cb.checked = false);

      if (selected === 'financial') {
        setComplianceCheckbox('soc2', true);
        setComplianceCheckbox('pci-dss', true);
        state.inputs.cpuOvercommit = 3;
        state.inputs.ramOvercommit = 1;
      } else if (selected === 'healthcare') {
        setComplianceCheckbox('gdpr', true);
        setComplianceCheckbox('hipaa', true);
        state.inputs.cpuOvercommit = 4;
        state.inputs.ramOvercommit = 1;
      } else if (selected === 'telecom') {
        setComplianceCheckbox('nesa_ias', true);
        state.inputs.cpuOvercommit = 4;
        state.inputs.ramOvercommit = 1;
      } else if (selected === 'sovereign') {
        setComplianceCheckbox('nca_cscc', true);
        setComplianceCheckbox('desc_csp', true);
        state.inputs.cpuOvercommit = 2; // NCA CCC-2:2024 default
        state.inputs.ramOvercommit = 1; // Strict
        state.inputs.manilaDhss = 'true'; // DESC mandated
        
        // Update Manila DHSS Cards UI
        document.querySelectorAll('[data-dhss]').forEach(card => {
          card.classList.toggle('selected', card.dataset.dhss === 'true');
        });
      }

      // Sync inputs back to fields
      document.getElementById('cpuOvercommit').value = state.inputs.cpuOvercommit;
      document.getElementById('ramOvercommit').value = state.inputs.ramOvercommit;

      const activeCompliance = [];
      document.querySelectorAll('input[name="compliance"]:checked').forEach(c => {
        activeCompliance.push(c.value);
      });
      state.inputs.compliance = activeCompliance;

      updateComplianceText();
      runCalculations();
      updateUI();
    });
  }
 
  // Cinder Backend Selector (Multi-select)
  document.querySelectorAll('[data-backend]').forEach(card => {
    card.addEventListener('click', () => {
      const backend = card.dataset.backend;
      
      // Toggle selection
      if (card.classList.contains('selected')) {
        const selectedCards = document.querySelectorAll('[data-backend].selected');
        if (selectedCards.length > 1) {
          card.classList.remove('selected');
        }
      } else {
        card.classList.add('selected');
      }
      
      // Collect selected backends
      const activeBackends = [];
      document.querySelectorAll('[data-backend].selected').forEach(c => {
        activeBackends.push(c.dataset.backend);
      });
      state.inputs.cinderBackends = activeBackends;

      // Hide/show option groups
      updateCinderBackendOptsVisibility(activeBackends);

      runCalculations();
      updateCinderDiagram();
      updateUI();
    });
  });

  // Manila Backend Selector (Multi-select)
  document.querySelectorAll('[data-manila-backend]').forEach(card => {
    card.addEventListener('click', () => {
      const backend = card.dataset.manilaBackend || card.getAttribute('data-manila-backend');
      
      // Toggle selection (allow multi-select)
      if (card.classList.contains('selected')) {
        const selectedCards = document.querySelectorAll('[data-manila-backend].selected');
        if (selectedCards.length > 1) {
          card.classList.remove('selected');
        }
      } else {
        card.classList.add('selected');
      }
      
      const activeBackends = [];
      document.querySelectorAll('[data-manila-backend].selected').forEach(c => {
        activeBackends.push(c.getAttribute('data-manila-backend'));
      });
      state.inputs.manilaBackends = activeBackends;
      updateManilaBackendOptsVisibility(activeBackends);

      validateManilaCompat();
      runCalculations();
      updateManilaDiagram();
      updateUI();
    });
  });

  // Manila DHSS Selector
  document.querySelectorAll('[data-dhss]').forEach(card => {
    card.addEventListener('click', () => {
      document.querySelectorAll('[data-dhss]').forEach(c => c.classList.remove('selected'));
      card.classList.add('selected');
      state.inputs.manilaDhss = card.dataset.dhss;

      validateManilaCompat();
      runCalculations();
      updateManilaDiagram();
      updateUI();
    });
  });

  // StorageGrid Toggle card
  const storagegridCard = document.getElementById('card-enable-storagegrid');
  if (storagegridCard) {
    storagegridCard.addEventListener('click', () => {
      storagegridCard.classList.toggle('selected');
      const isEnabled = storagegridCard.classList.contains('selected');
      state.inputs.enableStoragegrid = isEnabled;
      
      document.getElementById('storagegrid-opts-group').style.display = isEnabled ? 'flex' : 'none';
      
      runCalculations();
      updateUI();
    });
  }
 
  // Results Tab Buttons
  elements.tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      elements.tabButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.currentTab = btn.dataset.tab;
      renderActiveTab();
    });
  });
 
  // Copy to Clipboard
  elements.btnCopy.addEventListener('click', () => {
    const rawContent = getRawContentForTab(state.currentTab);
    navigator.clipboard.writeText(rawContent).then(() => {
      showToast('Content copied to clipboard!');
    }).catch(err => {
      console.error('Failed to copy: ', err);
    });
  });
 
  // Download File
  elements.btnDownload.addEventListener('click', () => {
    const rawContent = getRawContentForTab(state.currentTab);
    const filename = getFilenameForTab(state.currentTab);
    const blob = new Blob([rawContent], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast(`Downloading file: ${filename}`);
  });

  // Save Sizing Configuration
  const btnSave = document.getElementById('btn-save');
  if (btnSave) {
    btnSave.addEventListener('click', () => {
      const jsonContent = JSON.stringify(state.inputs, null, 2);
      const blob = new Blob([jsonContent], { type: 'application/json;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const safeProjectName = (state.inputs.projectName || 'openstack').toLowerCase().replace(/[^a-z0-9_-]/g, '_');
      a.download = `${safeProjectName}_config.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showToast("Configuration exported successfully.");
    });
  }

  // Load Sizing Configuration
  const btnLoad = document.getElementById('btn-load');
  const loadInput = document.getElementById('load-config-input');
  if (btnLoad && loadInput) {
    btnLoad.addEventListener('click', () => {
      loadInput.click();
    });

    loadInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const parsed = JSON.parse(event.target.result);
          
          // Basic validation to confirm it is an OpenStack configuration
          if (!parsed || typeof parsed !== 'object' || !parsed.projectName) {
            throw new Error("Invalid configuration file format.");
          }
          
          // Merge parsed configuration into state.inputs
          state.inputs = Object.assign({}, defaultInputs, parsed);
          
          // Sync all UI inputs and refresh state/calculations/diagrams
          syncDOMFromState();
          toggleDynamicViews();
          updateCinderDiagram();
          updateManilaDiagram();
          runCalculations();
          updateUI();
          
          showToast("Configuration loaded successfully!");
        } catch (err) {
          showToast("Error loading configuration: " + err.message);
        }
        // Clear input to allow uploading the same file again
        loadInput.value = '';
      };
      reader.readAsText(file);
    });
  }
}

function setComplianceCheckbox(val, stateBool) {
  const cb = document.querySelector(`input[name="compliance"][value="${val}"]`);
  if (cb) {
    cb.checked = stateBool;
  }
}
 
// Perform Architecture Sizing Calculations
function runCalculations() {
  // 1. Initial calculations
  let compResult = calculateCompute(state.inputs);
  
  const glanceCap = state.inputs.glanceCapacityTb;
  const cinderCap = state.inputs.cinderBackends.includes('ceph') ? state.inputs.cinderCapacityTb : 0;
  const hasCephFs = state.inputs.manilaBackends.some(b => b.startsWith('cephfs'));
  const manilaCap = hasCephFs ? state.inputs.manilaCapacityTb : 0;
  
  let cephResult = calculateCeph({
    cinderCapacityTb: cinderCap,
    manilaCapacityTb: manilaCap,
    glanceCapacityTb: glanceCap,
    replicaFactor: state.inputs.replicaFactor,
    osdSizeTb: state.inputs.osdSizeTb,
    osdPerNode: state.inputs.osdPerNode,
    utilizationLimit: state.inputs.utilizationLimit,
    growthBuffer: state.inputs.growthBuffer,
    enableStoragegrid: state.inputs.enableStoragegrid,
    storagegridCapacityTb: state.inputs.storagegridCapacityTb
  });

  // 2. Subnet auto-accommodation check
  const finalComputeNodes = compResult.finalComputeNodes;
  const cephNodes = cephResult.cephNodes;

  const ctrlSize = 10;
  const compSize = Math.max(100, finalComputeNodes + 10);
  const cephSize = Math.max(50, cephNodes + 10);

  const ctrlStart = parseInt(state.inputs.mgmtCtrlStart) || 11;
  const ctrlEnd = parseInt(state.inputs.mgmtCtrlEnd) || 20;
  const compStart = parseInt(state.inputs.mgmtCompStart) || 101;
  const compEnd = parseInt(state.inputs.mgmtCompEnd) || 200;
  const cephStart = parseInt(state.inputs.mgmtCephStart) || 201;
  const cephEnd = parseInt(state.inputs.mgmtCephEnd) || 250;

  const currentCtrlSize = ctrlEnd - ctrlStart + 1;
  const currentCompSize = compEnd - compStart + 1;
  const currentCephSize = cephEnd - cephStart + 1;

  const hasOverlap = (s1, e1, s2, e2) => s1 <= e2 && s2 <= e1;
  const overlaps = hasOverlap(ctrlStart, ctrlEnd, compStart, compEnd) ||
                   hasOverlap(compStart, compEnd, cephStart, cephEnd) ||
                   hasOverlap(ctrlStart, ctrlEnd, cephStart, cephEnd);

  const needAdjustment = overlaps || (finalComputeNodes > currentCompSize) || (cephNodes > currentCephSize);

  if (needAdjustment) {
    const newCtrlStart = 11;
    const newCtrlEnd = 20;
    const newCompStart = 31;
    const newCompEnd = newCompStart + compSize - 1;
    const newCephStart = newCompEnd + 11;
    const newCephEnd = newCephStart + cephSize - 1;

    state.inputs.mgmtCtrlStart = newCtrlStart;
    state.inputs.mgmtCtrlEnd = newCtrlEnd;
    state.inputs.mgmtCompStart = newCompStart;
    state.inputs.mgmtCompEnd = newCompEnd;
    state.inputs.mgmtCephStart = newCephStart;
    state.inputs.mgmtCephEnd = newCephEnd;

    // Subnet mask calculation
    const maxIndex = newCephEnd;
    let newMask = 24;
    if (maxIndex > 254) {
      const requiredSize = maxIndex + 2;
      const powerOf2 = Math.pow(2, Math.ceil(Math.log2(requiredSize)));
      newMask = 32 - Math.log2(powerOf2);
    }

    const updateCidr = (cidr, mask) => {
      if (!cidr) return cidr;
      if (cidr.includes('/')) return cidr.replace(/\/\d+$/, '/' + mask);
      return cidr + '/' + mask;
    };

    state.inputs.mgmtSubnet = updateCidr(state.inputs.mgmtSubnet, newMask);
    state.inputs.apiSubnet = updateCidr(state.inputs.apiSubnet, newMask);
    state.inputs.storageFrontSubnet = updateCidr(state.inputs.storageFrontSubnet, newMask);
    state.inputs.storageBackSubnet = updateCidr(state.inputs.storageBackSubnet, newMask);
    state.inputs.tenantSubnet = updateCidr(state.inputs.tenantSubnet, newMask);
    if (state.inputs.extSubnet) {
      state.inputs.extSubnet = updateCidr(state.inputs.extSubnet, newMask);
    }

    // Sync state values back to HTML inputs in Step 6
    const syncDOM = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.value = val;
    };

    syncDOM('mgmtCtrlStart', newCtrlStart);
    syncDOM('mgmtCtrlEnd', newCtrlEnd);
    syncDOM('mgmtCompStart', newCompStart);
    syncDOM('mgmtCompEnd', newCompEnd);
    syncDOM('mgmtCephStart', newCephStart);
    syncDOM('mgmtCephEnd', newCephEnd);

    syncDOM('mgmtSubnet', state.inputs.mgmtSubnet);
    syncDOM('apiSubnet', state.inputs.apiSubnet);
    syncDOM('storageFrontSubnet', state.inputs.storageFrontSubnet);
    syncDOM('storageBackSubnet', state.inputs.storageBackSubnet);
    syncDOM('tenantSubnet', state.inputs.tenantSubnet);
    if (document.getElementById('extSubnet')) {
      syncDOM('extSubnet', state.inputs.extSubnet);
    }

    showToast(`IP ranges & subnets expanded to /${newMask} to accommodate sized hosts.`);

    // Re-run calculations with expanded inputs
    compResult = calculateCompute(state.inputs);
    cephResult = calculateCeph({
      cinderCapacityTb: cinderCap,
      manilaCapacityTb: manilaCap,
      glanceCapacityTb: glanceCap,
      replicaFactor: state.inputs.replicaFactor,
      osdSizeTb: state.inputs.osdSizeTb,
      osdPerNode: state.inputs.osdPerNode,
      utilizationLimit: state.inputs.utilizationLimit,
      growthBuffer: state.inputs.growthBuffer,
      enableStoragegrid: state.inputs.enableStoragegrid,
      storagegridCapacityTb: state.inputs.storagegridCapacityTb
    });
  }

  state.results.compute = compResult;
  state.results.ceph = cephResult;

  state.results.network = calculateNetwork({
    computeNodes: state.results.compute.finalComputeNodes,
    cephNodes: state.results.ceph.cephNodes,
    linkSpeedGbps: state.inputs.linkSpeedGbps,
    enableStoragegrid: state.inputs.enableStoragegrid
  });

  // Keep the Step 4 compat gate (banner + Next button) in sync with state even when
  // step 4 was never visited sequentially (e.g. jumping via the stepper, or an industry
  // preset changing manilaDhss) — validateStep() only re-checks the step being left.
  validateManilaCompat();

  runLiveValidation();
}

function runLiveValidation() {
  const banner = document.getElementById('topology-warnings-panel');
  const list = document.getElementById('live-validation-list');
  const statusIcon = document.getElementById('warnings-status-icon');
  const warningsTitle = document.getElementById('warnings-title');
  if (!banner || !list) return;

  list.innerHTML = '';
  const warnings = [];

  // 1. VM Sizing Boundaries
  const vmVcpus = parseFloat(state.inputs.vmVcpus) || 0;
  const nodeCores = parseFloat(state.inputs.nodeCores) || 0;
  const vmRam = parseFloat(state.inputs.vmRam) || 0;
  const nodeRam = parseFloat(state.inputs.nodeRam) || 0;

  if (vmVcpus > nodeCores) {
    warnings.push(`<strong>Hypervisor Core Overrun:</strong> Sized VM requests ${vmVcpus} vCPUs, which exceeds the physical core count of a single hypervisor node (${nodeCores} Cores). An individual VM cannot span multiple physical hosts.`);
  }
  if (vmRam > nodeRam) {
    warnings.push(`<strong>Hypervisor RAM Overrun:</strong> Sized VM requests ${vmRam} GB RAM, which exceeds the physical memory capacity of a single hypervisor node (${nodeRam} GB). A single instance must reside within NUMA nodes of a single host.`);
  }

  // 1b. Overcommit & Sizing Warnings from Compute results
  const comp = state.results.compute;
  if (comp) {
    const cpuOvercommit = parseFloat(state.inputs.cpuOvercommit) || 0;
    const ramOvercommit = parseFloat(state.inputs.ramOvercommit) || 0;
    if (comp.realCpuRatio > cpuOvercommit) {
      warnings.push(`<strong>CPU Overcommit Exceeded:</strong> Target CPU overcommit is ${cpuOvercommit}:1, but currently calculating ${comp.realCpuRatio.toFixed(1)}:1 based on VM sizing.`);
    }
    if (comp.realRamRatio > ramOvercommit) {
      warnings.push(`<strong>RAM Overcommit Exceeded:</strong> Target RAM overcommit is ${ramOvercommit}:1, but currently calculating ${comp.realRamRatio.toFixed(1)}:1 based on VM sizing.`);
    }
    if (comp.complianceWarnings && comp.complianceWarnings.length > 0) {
      comp.complianceWarnings.forEach(warn => {
        warnings.push(`<strong>Sizing/Compliance Warning:</strong> ${warn}`);
      });
    }
  }

  // 1c. Storage Node Warning from Ceph results
  const ceph = state.results.ceph;
  if (ceph && ceph.cephNodes < 3) {
    warnings.push(`<strong>Storage Quorum Danger:</strong> Ceph requires a minimum of 3 physical storage nodes to guarantee quorum and data replication integrity.`);
  }

  // 2. Glance Registry Pool Discrepancy
  const glanceBackend = state.inputs.glanceBackend;
  const glanceCapacityTb = parseFloat(state.inputs.glanceCapacityTb) || 0;
  if (glanceBackend !== 'rbd' && glanceCapacityTb > 0) {
    const backendLabel = glanceBackend === 's3' ? 'S3/StorageGrid' : 'Swift Object';
    warnings.push(`<strong>Glance Pool Mismatch:</strong> Glance registry is configured for <strong>${backendLabel}</strong>, but Ceph RBD capacity of ${glanceCapacityTb} TB is allocated. Set Glance capacity to 0 TB or change backend to Ceph (RBD).`);
  }

  // 3. Manila Backend CephFS DHSS Incompatibility
  const manilaBackends = state.inputs.manilaBackends || [];
  const manilaDhss = state.inputs.manilaDhss;
  if (manilaBackends.includes('cephfs_native') && manilaDhss === 'true') {
    warnings.push(`<strong>Manila CephFS DHSS Incompatibility:</strong> The native CephFS share driver does not support DHSS enabled. Change DHSS to 'false' (DHSS = False) in Step 4.`);
  }

  // 4. Barbican KMS Backend Warnings
  if (state.inputs.enableBarbican) {
    const backend = state.inputs.barbicanBackend;
    if (backend === 'softhsm') {
      warnings.push(`<strong>Insecure Barbican Backend:</strong> Barbican is configured with SoftHSM. SoftHSM stores keys in a local software database and is strictly for dev/PoC, not production.`);
    } else if (backend === 'pkcs11') {
      warnings.push(`<strong>Hardware HSM Integration Required:</strong> Barbican PKCS#11 requires a physical HSM. Ensure proper network routing and slot configuration.`);
    }
  }

  // 5. Cinder NetApp iSCSI vs Manila CephFS
  const cinderBackends = state.inputs.cinderBackends || [];
  const netappProto = state.inputs.netappProto;
  if (cinderBackends.includes('netapp') && netappProto === 'iscsi' && manilaBackends.includes('cephfs_native')) {
    warnings.push(`<strong>Storage Fabric Conflict:</strong> NetApp iSCSI SAN runs over separate block network fabrics, while CephFS native mounts communicate over Ceph public/cluster Ethernet fabrics. Ensure distinct fabrics.`);
  }

  // 6. Regulatory Compliance Gaps
  const complianceList = state.inputs.compliance || [];
  if (complianceList.length > 0) {
    const compText = complianceList.map(c => c.toUpperCase()).join(', ');
    if (!state.inputs.enableBarbican) {
      warnings.push(`<strong>Compliance Gap (Encryption):</strong> Standards (<strong>${compText}</strong>) require active encryption-at-rest. Enable Barbican in Step 3 to encrypt volumes, images, and ephemeral disks.`);
    }
    if (state.inputs.enableCinderBackup === 'false') {
      warnings.push(`<strong>Compliance Gap (Disaster Recovery):</strong> Standards (<strong>${compText}</strong>) mandate backup repositories. Enable Cinder Backup in Step 3.`);
    }
    const replicaFactor = parseInt(state.inputs.replicaFactor) || 0;
    if (replicaFactor < 3) {
      warnings.push(`<strong>Compliance Gap (Redundancy):</strong> Ceph replica factor is ${replicaFactor}, violating the minimum floor of 3 required by <strong>${compText}</strong>.`);
    }
  }

  if (warnings.length > 0) {
    warnings.forEach(warn => {
      const li = document.createElement('li');
      li.innerHTML = warn;
      list.appendChild(li);
    });
    banner.className = 'topology-warnings-panel has-warnings';
    if (statusIcon) statusIcon.innerText = '⚠';
    if (warningsTitle) warningsTitle.innerText = `Validation Alerts (${warnings.length})`;
  } else {
    const li = document.createElement('li');
    li.className = 'compliant-msg';
    li.innerText = 'Sizing baseline satisfies target security controls and hypervisor limits.';
    list.appendChild(li);
    banner.className = 'topology-warnings-panel compliant';
    if (statusIcon) statusIcon.innerText = '✓';
    if (warningsTitle) warningsTitle.innerText = 'Configuration Compliant';
  }
}

// Protocol/port label helpers for the newer Cinder array backends (Pure, HPE, Dell PowerStore/PowerMax, VAST)
function getPureProtoLabel() {
  const map = { iscsi: 'iSCSI', fc: 'Fibre Channel', 'nvme-roce': 'NVMe-oF/RoCE', 'nvme-tcp': 'NVMe-oF/TCP' };
  return map[state.inputs.pureProto] || 'iSCSI';
}
function getPurePorts() {
  const proto = state.inputs.pureProto;
  const dataPort = proto === 'fc' ? 'FC Fabric (zoned)' : (proto.startsWith('nvme') ? '4420 (NVMe/TCP)' : '3260 (iSCSI)');
  return `${dataPort}, 443 (REST)`;
}
function getHpeWsapiPort() {
  return state.inputs.hpePlatform === '3par' ? 8080 : 443;
}
function getHpeProtoLabel() {
  return state.inputs.hpeProto === 'iscsi' ? 'iSCSI' : 'Fibre Channel';
}
function getHpePorts() {
  const dataPort = state.inputs.hpeProto === 'iscsi' ? '3260 (iSCSI)' : 'FC Fabric (zoned)';
  return `${dataPort}, ${getHpeWsapiPort()} (WSAPI)`;
}
function getDellpsProtoLabel() {
  const map = { iscsi: 'iSCSI', fc: 'Fibre Channel', 'nvme-tcp': 'NVMe-TCP' };
  return map[state.inputs.dellpsProto] || 'iSCSI';
}
function getDellpsMgmtPort() {
  return state.inputs.dellpsPlatform === 'powermax' ? { port: 8443, label: 'Unisphere' } : { port: 443, label: 'REST' };
}
function getDellpsPorts() {
  const proto = state.inputs.dellpsProto;
  const dataPort = proto === 'fc' ? 'FC Fabric (zoned)' : (proto === 'nvme-tcp' ? '4420 (NVMe/TCP)' : '3260 (iSCSI)');
  const mgmt = getDellpsMgmtPort();
  return `${dataPort}, ${mgmt.port} (${mgmt.label})`;
}

// Update UI fields and components based on calculations
function updateUI() {
  // Step 2 (Compute) Outputs
  const comp = state.results.compute;
  document.getElementById('calc-total-vcpus').innerText = comp.totalVcpusNeeded;
  document.getElementById('calc-total-ram').innerText = `${comp.totalRamNeeded} GB`;
  document.getElementById('calc-nodes-cpu').innerText = comp.nodesForCpu;
  document.getElementById('calc-nodes-ram').innerText = comp.nodesForRam;
  const rowNodesStorage = document.getElementById('row-nodes-storage');
  if (rowNodesStorage) {
    rowNodesStorage.style.display = comp.nodesForStorage > 0 ? 'flex' : 'none';
    document.getElementById('calc-nodes-storage').innerText = comp.nodesForStorage;
  }
  document.getElementById('calc-raw-nodes').innerText = comp.rawComputeNodes;
  document.getElementById('calc-final-nodes').innerText = `${comp.finalComputeNodes} Nodes`;
 
  // Step 3 (Cinder) Summary
  document.getElementById('calc-cinder-cap').innerText = `${state.inputs.cinderCapacityTb} TB`;
  const cinderBackendNames = {
    ceph: 'Ceph RBD',
    netapp: 'NetApp ONTAP',
    emc: 'Dell EMC PowerFlex',
    pure: 'Pure Storage FlashArray',
    hpe: state.inputs.hpePlatform === '3par' ? 'HPE 3PAR' : 'HPE Primera/Alletra',
    dellps: state.inputs.dellpsPlatform === 'powermax' ? 'Dell PowerMax' : 'Dell PowerStore',
    vast: 'VAST Data'
  };
  const cinderProtocols = {
    ceph: 'librbd (RADOS)',
    netapp: state.inputs.netappProto.toUpperCase(),
    emc: 'SDC driver',
    pure: getPureProtoLabel(),
    hpe: getHpeProtoLabel(),
    dellps: getDellpsProtoLabel(),
    vast: 'NVMe-oF/TCP'
  };
  const cinderPorts = {
    ceph: '6789 (MON), 6800-7300 (OSDs)',
    netapp: state.inputs.netappProto === 'iscsi' ? '3260 (iSCSI), 443 (ONTAPI)' : '2049 (NFS), 443 (ONTAPI)',
    emc: '7011 (SDC API), 443 (Gateway)',
    pure: getPurePorts(),
    hpe: getHpePorts(),
    dellps: getDellpsPorts(),
    vast: '4420 (NVMe/TCP data VIP), 443 (VMS REST)'
  };
  
  const selectedBackends = state.inputs.cinderBackends || ['ceph'];
  document.getElementById('calc-cinder-backend').innerText = selectedBackends.map(b => cinderBackendNames[b]).join(' + ');
  document.getElementById('calc-cinder-proto').innerText = selectedBackends.map(b => cinderProtocols[b]).join(' | ');
  document.getElementById('calc-cinder-ports').innerText = selectedBackends.map(b => cinderPorts[b]).join(' / ');
 
  const replBwRow = document.getElementById('cinder-dr-bw-row');
  const replLatRow = document.getElementById('cinder-dr-lat-row');
  if (state.inputs.enableCinderReplication) {
    if (replBwRow) replBwRow.style.display = 'flex';
    if (replLatRow) replLatRow.style.display = 'flex';
    document.getElementById('calc-cinder-dr-bw').innerText = `${comp.drBandwidthMbps} Mbps (daily change: ~${Math.round(comp.drDailyChangeGb)} GB)`;
    document.getElementById('calc-cinder-dr-lat').innerText = `<= ${comp.drLatencyMsLimit} ms RTT`;
  } else {
    if (replBwRow) replBwRow.style.display = 'none';
    if (replLatRow) replLatRow.style.display = 'none';
  }
 
  // Step 4 (Manila) Summary
  document.getElementById('calc-manila-cap').innerText = `${state.inputs.manilaCapacityTb} TB`;
  document.getElementById('calc-manila-dhss').innerText = `DHSS = ${state.inputs.manilaDhss === 'true' ? 'True' : 'False'}`;
  const manilaBackendNames = {
    cephfs_native: 'CephFS Native',
    cephfs_ganesha: 'CephFS NFS-Ganesha',
    netapp: 'NetApp ONTAP',
    vast: 'VAST Data'
  };
  const manilaPorts = {
    cephfs_native: '6789 (MDS & OSDs)',
    cephfs_ganesha: '2049 (NFS)',
    netapp: '2049 (NFS), 445 (CIFS)',
    vast: '2049 (NFS), 443 (VMS REST)'
  };
  const selectedManila = state.inputs.manilaBackends || ['cephfs_native'];
  document.getElementById('calc-manila-backend').innerText = selectedManila.map(b => manilaBackendNames[b]).join(' + ');
  document.getElementById('calc-manila-ports').innerText = selectedManila.map(b => manilaPorts[b]).join(' / ');
 
  // Step 5 (Ceph) Outputs
  const ceph = state.results.ceph;
  document.getElementById('calc-ceph-usable').innerText = `${ceph.totalUsableCapacityTb.toFixed(1)} TB`;
  document.getElementById('calc-ceph-raw').innerText = `${ceph.rawCapacityNeededTb.toFixed(1)} TB`;
  document.getElementById('calc-ceph-osds').innerText = `${ceph.finalOsdCount} OSDs`;
  document.getElementById('calc-ceph-nodes').innerText = `${ceph.cephNodes} Nodes`;
  
  // Find Volumes pool PG count
  const volumesPool = ceph.pools.find(p => p.key === 'cinder');
  document.getElementById('calc-ceph-pool-pgs').innerText = volumesPool ? volumesPool.pgCount : '1024';
 
  // Toggle dynamic warning/message based on calculations
  const bufferDesc = document.getElementById('ceph-calculation-details');
  if (ceph.cephNodes < 3) {
    bufferDesc.innerHTML = `<span style="color:var(--accent-red)"><strong>CRITICAL SIZING ERROR:</strong> A production HA Ceph cluster requires a minimum of 3 physical storage nodes to guarantee quorum and data replication integrity. Sizing is overriding minimum nodes to 3.</span>`;
  } else {
    bufferDesc.innerHTML = `<strong>Ceph Sizing Matrix:</strong> Calculated <code>${ceph.finalOsdCount}</code> OSDs distributed across <code>${ceph.cephNodes}</code> nodes. Estimated hardware requirements: <strong>${ceph.osdCpuRequirementCores} CPU Cores</strong> and <strong>${ceph.osdRamRequirementGb} GB Memory</strong> for storage daemons.`;
  }

  // Render Live Logical Topology Diagram
  const wrapper = document.getElementById('topology-diagram-wrapper');
  if (wrapper) {
    wrapper.innerHTML = generateLiveTopologySVG(state.inputs, state.results.compute, state.results.ceph);
  }
}
 
// Step Verification & Routing
function validateStep(step) {
  if (step === 2) {
    if (state.inputs.vmCount <= 0 || state.inputs.nodeCores <= 0) {
      alert('Total active VMs and hardware core counts must be greater than zero.');
      return false;
    }
  }
  if (step === 4) {
    return validateManilaCompat();
  }
  return true;
}
 
function validateManilaCompat() {
  const warning = document.getElementById('manila-compat-warning');
  const selectedManila = state.inputs.manilaBackends || ['cephfs_native'];
  const hasCeph = selectedManila.some(b => b.startsWith('cephfs'));
  const hasVast = selectedManila.includes('vast');
  const dhss = state.inputs.manilaDhss;

  // CephFS and VAST's Manila driver (driver_handles_share_servers=False) do NOT support DHSS = True
  if ((hasCeph || hasVast) && dhss === 'true') {
    warning.style.display = 'flex';
    const offender = hasCeph && hasVast ? 'CephFS and VAST Data backends do' : (hasCeph ? 'CephFS backend does' : 'VAST Data backend does');
    warning.querySelector('#manila-compat-warning-text').innerText = `Warning: the ${offender} not support DHSS=True. You must configure DHSS to False for these shares, or switch to NetApp ONTAP.`;
    elements.btnNext.disabled = true;
    return false;
  }

  warning.style.display = 'none';
  elements.btnNext.disabled = false;
  return true;
}
 
// Step Navigation Handler
function goToStep(stepNumber) {
  state.currentStep = stepNumber;
 
  // Update Stepper HTML classes
  elements.stepperItems.forEach(item => {
    const itemStep = parseInt(item.dataset.step);
    item.classList.remove('active');
    item.classList.remove('completed');
    
    if (itemStep === stepNumber) {
      item.classList.add('active');
    } else if (itemStep < stepNumber) {
      item.classList.add('completed');
    }
  });
 
  // Update panels visibility
  elements.panels.forEach(panel => {
    panel.classList.remove('active');
  });
  document.getElementById(`step-panel-${stepNumber}`).classList.add('active');
 
  // Disable/Enable Back and Next
  elements.btnPrev.disabled = stepNumber === 1;
  
  if (stepNumber === 7) {
    elements.btnNext.innerHTML = `Verify Design <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>`;
    renderActiveTab();
  } else {
    elements.btnNext.innerHTML = `Next Step <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>`;
  }
}
 
// Compliance Text changes based on profile
function updateComplianceText() {
  const infoBlock = document.getElementById('compliance-info');
  const ind = state.inputs.industry;
  const list = state.inputs.compliance;
  
  let text = '<strong>Selected Profile Impact:</strong> ';
  if (ind === 'financial') {
    text += 'Financial services dictates strict core allocations (no overcommit), dedicated storage networking (jumbo frames required), and TLS 1.3.';
  } else if (ind === 'healthcare') {
    text += 'Healthcare mandates strict project networking isolation, encryption-at-rest for Cinder and Manila shares, and syslog forwarding of admin tokens.';
  } else if (ind === 'telecom') {
    text += 'Telecom NFV dictates NESA/UAE IAR-IAS v2 High-Availability controls with link protection, separate data routing planes, and zero packet-drop tuning.';
  } else if (ind === 'sovereign') {
    text += 'Sovereign Government Cloud enforces Dubai DESC CSP (ISR v3.0) and Saudi NCA CCC-2:2024 directives. Data residency must remain local, 1:1 resource sizing is enforced, and encryption keys must be handled in-country.';
  } else {
    text += 'Standard general purpose configurations apply.';
  }
 
  if (list.includes('nca_cscc') || list.includes('desc_csp') || list.includes('soc2') || list.includes('pci-dss')) {
    text += ' Rsyslog SIEM forwarding must capture Keystone token modifications, root CLI access executions, and storage access log payloads.';
  }
 
  infoBlock.innerHTML = text;
}
 
// Interactive Cinder Diagram state management
function updateCinderDiagram() {
  const backendNodeTitle = document.getElementById('lbl-cinder-backend-node');
  const backendNodeProto = document.getElementById('lbl-cinder-backend-proto');
  const desc = document.getElementById('cinder-diagram-desc');
 
  const backends = state.inputs.cinderBackends || ['ceph'];
 
  const names = [];
  const protos = [];
  const descs = [];
 
  if (backends.includes('ceph')) {
    names.push('Ceph OSDs');
    protos.push('librbd (6800-7300)');
    descs.push('Direct RADOS traffic to Ceph OSDs over VLAN 30.');
  }
  if (backends.includes('netapp')) {
    names.push('NetApp SVM');
    protos.push(state.inputs.netappProto.toUpperCase() + ' (3260/2049)');
    descs.push(`Multipath I/O to NetApp controller (${state.inputs.netappIp}).`);
  }
  if (backends.includes('emc')) {
    names.push('PowerFlex SDS');
    protos.push('SDC (7011)');
    descs.push(`Parallel I/O lines to PowerFlex cluster (${state.inputs.emcIp}).`);
  }
  if (backends.includes('pure')) {
    names.push('FlashArray');
    protos.push(getPureProtoLabel() + ' (' + getPurePorts() + ')');
    descs.push(`${getPureProtoLabel()} I/O to Pure Storage FlashArray (${state.inputs.pureIp}).`);
  }
  if (backends.includes('hpe')) {
    names.push('HPE SAN Array');
    protos.push(getHpeProtoLabel() + ' (' + getHpePorts() + ')');
    descs.push(`${getHpeProtoLabel()} I/O to HPE array WSAPI (${state.inputs.hpeIp}).`);
  }
  if (backends.includes('dellps')) {
    names.push(state.inputs.dellpsPlatform === 'powermax' ? 'PowerMax' : 'PowerStore');
    protos.push(getDellpsProtoLabel() + ' (' + getDellpsPorts() + ')');
    descs.push(`${getDellpsProtoLabel()} I/O to Dell ${state.inputs.dellpsPlatform === 'powermax' ? 'PowerMax (via Unisphere)' : 'PowerStore'} (${state.inputs.dellpsIp}).`);
  }
  if (backends.includes('vast')) {
    names.push('VAST Cluster');
    protos.push('NVMe-oF/TCP (VIP Pool)');
    descs.push(`NVMe-oF/TCP to VAST VIP pool "${state.inputs.vastVippool}" (VMS: ${state.inputs.vastIp}).`);
  }

  backendNodeTitle.innerText = names.join(' + ');
  backendNodeProto.innerText = protos.join(' | ');
  desc.innerHTML = '<strong>Data Flow:</strong> ' + descs.join(' ');
}
 
// Interactive Manila Diagram state management
function updateManilaDiagram() {
  const netNodeDetail = document.getElementById('lbl-manila-net-type');
  const gwNodeTitle = document.getElementById('lbl-manila-gw-title');
  const gwNodeDesc = document.getElementById('lbl-manila-gw-desc');
  const storageNodeTitle = document.getElementById('lbl-manila-storage-title');
  const storageNodeProto = document.getElementById('lbl-manila-storage-proto');
  const desc = document.getElementById('manila-diagram-desc');
 
  const backends = state.inputs.manilaBackends || ['cephfs_native'];
  const dhss = state.inputs.manilaDhss;
 
  if (dhss === 'true') {
    netNodeDetail.innerText = 'Tenant VXLAN/VLAN';
    gwNodeTitle.innerText = 'Dynamic Share Server';
    gwNodeDesc.innerText = 'Provisioned in Tenant Network';
    
    if (backends.includes('netapp')) {
      storageNodeTitle.innerText = 'NetApp Controller';
      storageNodeProto.innerText = 'ONTAP API (SVM per tenant)';
      desc.innerHTML = '<strong>Data Isolation:</strong> High (DESC Compliant). Each tenant gets a separate dedicated interface or SVM routed inside their Neutron overlay fabric. Manila controls the SVM life cycle.';
    }
  } else {
    netNodeDetail.innerText = 'Flat Storage Network';
    gwNodeTitle.innerText = 'Static Mount gateway';
    
    const names = [];
    const protos = [];
    const flows = [];

    if (backends.includes('cephfs_native')) {
      gwNodeDesc.innerText = 'CephFS FUSE Client';
      names.push('Ceph MDS / OSDs');
      protos.push('CephFS (Port 6789)');
      flows.push('Tenant mounts CephFS metadata server directly. Auth keys (cephx) isolate pools.');
    }
    if (backends.includes('cephfs_ganesha')) {
      gwNodeDesc.innerText = 'NFS-Ganesha Server';
      names.push('Ceph MDS / Ganesha');
      protos.push('NFSv4 (Port 2049)');
      flows.push('NFS-Ganesha serves as a proxy gateway. VM mounts NFS directly.');
    }
    if (backends.includes('netapp')) {
      gwNodeDesc.innerText = 'Static NFS SVM Mount';
      names.push('NetApp ONTAP Cluster');
      protos.push('NFS/CIFS (Shared SVM)');
      flows.push('Manila creates separate export paths on a single pre-existing ONTAP SVM.');
    }
    if (backends.includes('vast')) {
      gwNodeDesc.innerText = 'Static NFS VIP Mount';
      names.push('VAST Cluster');
      protos.push('NFS (Port 2049)');
      flows.push(`Manila exports "${state.inputs.vastRootExport}" from the VAST cluster's Element Store via NFS. DHSS=False only (no share-server VMs).`);
    }

    storageNodeTitle.innerText = names.join(' + ');
    storageNodeProto.innerText = protos.join(' | ');
    desc.innerHTML = '<strong>Data Isolation:</strong> ' + flows.join(' ');
  }
}
 
// Generate tab contents and render in Step 7
function renderActiveTab() {
  const contentEl = elements.displayContent;
  const tab = state.currentTab;
 
  elements.displayFilename.innerText = getFilenameForTab(tab);
  
  const rawContent = getRawContentForTab(tab);
  
  const markdownTabs = ['proposal_design', 'hld', 'lld', 'deployment_steps'];
  if (markdownTabs.includes(tab)) {
    contentEl.innerHTML = parseMarkdown(rawContent);
  } else {
    // Escape HTML tags to prevent rendering issues in config files
    const escaped = rawContent
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    contentEl.innerHTML = `<pre><code class="config-code">${escaped}</code></pre>`;
  }
}
 
function getFilenameForTab(tab) {
  const files = {
    proposal_design: 'proposal_architecture_design.md',
    hld: 'high_level_design.md',
    lld: 'low_level_design.md',
    ansible: 'kolla_ansible_playbook.yml',
    juju_bundle: 'bundle.yaml',
    rhosp_templates: 'network-environment.yaml',
    kubernetes_csi: 'cinder-csi.yaml',
    cloud_config: 'cloud-config',
    k8s_velero: 'velero-backup.yaml',
    deployment_steps: 'deployment_steps.md',
    nova_conf: 'nova.conf',
    neutron_conf: 'neutron.conf',
    keystone_conf: 'keystone.conf',
    glance_conf: 'glance.conf',
    cinder_conf: 'cinder.conf',
    manila_conf: 'manila.conf',
    ceph_conf: 'ceph.conf',
    siem_conf: 'rsyslog_siem.conf'
  };
  return files[tab];
}
 
function getRawContentForTab(tab) {
  switch(tab) {
    case 'proposal_design':
      return generateProposalDesign(state.inputs, state.results.compute, state.results.ceph);
    case 'hld':
      return generateHLD(state.inputs, state.results.compute, state.results.ceph);
    case 'lld':
      return generateLLD(state.inputs, state.results.compute, state.results.ceph);
    case 'ansible':
      return generateAnsible(state.inputs, state.results.compute, state.results.ceph);
    case 'juju_bundle':
      return generateJujuBundle(state.inputs);
    case 'rhosp_templates':
      return generateRhospTemplates(state.inputs);
    case 'kubernetes_csi':
      return generateK8sCsi(state.inputs);
    case 'cloud_config':
      return generateCloudConfig(state.inputs);
    case 'k8s_velero':
      return generateK8sVelero(state.inputs);
    case 'deployment_steps':
      return generateDeploymentSteps(state.inputs);
    case 'nova_conf':
      return generateNovaConf(state.inputs, state.results.compute);
    case 'neutron_conf':
      return generateNeutronConf(state.inputs);
    case 'keystone_conf':
      return generateKeystoneConf(state.inputs);
    case 'glance_conf':
      return generateGlanceConf(state.inputs);
    case 'cinder_conf':
      return generateCinderConf(state.inputs);
    case 'manila_conf':
      return generateManilaConf(state.inputs);
    case 'ceph_conf':
      return generateCephConf(state.inputs, state.results.ceph);
    case 'siem_conf':
      return generateSIEMConf(state.inputs);
    default:
      return '';
  }
}
 
// Client-side markdown renderer parser (regex based)
function parseMarkdown(md) {
  let html = md;
 
  // Escape HTML characters
  html = html
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
 
  // Code blocks
  html = html.replace(/```(yaml|bash|ini|sh|diff|json|mermaid|)?\n([\s\S]*?)```/g, (match, lang, code) => {
    return `<pre><code class="config-code">${code.trim()}</code></pre>`;
  });
 
  // Inline code blocks
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
 
  // Headers
  html = html.replace(/^# (.*$)/gim, '<h1>$1</h1>');
  html = html.replace(/^## (.*$)/gim, '<h2>$1</h2>');
  html = html.replace(/^### (.*$)/gim, '<h3>$1</h3>');
 
  // Tables
  const lines = html.split('\n');
  let inTable = false;
  let tableRows = [];
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.startsWith('|')) {
      if (!inTable) {
        inTable = true;
        tableRows = [];
      }
      tableRows.push(line);
      lines[i] = '';
    } else {
      if (inTable) {
        const tableHtml = buildTableHtml(tableRows);
        lines[i - 1] = tableHtml;
        inTable = false;
      }
    }
  }
  
  if (inTable) {
    lines[lines.length - 1] = buildTableHtml(tableRows);
  }
  
  html = lines.join('\n');
 
  // Unordered Lists
  html = html.replace(/^\-\s(.*$)/gim, '<li>$1</li>');
  
  // Horizontal Rule
  html = html.replace(/^---$/gim, '<hr style="border:0; border-top:1px solid var(--glass-border); margin:1.5rem 0;">');
 
  return html;
}
 
// Convert table rows arrays to HTML table string
function buildTableHtml(rows) {
  let table = '<table>';
  let isHeaderRow = true;
 
  rows.forEach(row => {
    const cells = row.split('|').map(c => c.trim()).filter((c, idx, arr) => idx > 0 && idx < arr.length - 1);
    
    if (cells.every(cell => cell.match(/^[:\-\s]+$/))) {
      return;
    }
 
    table += '<tr>';
    cells.forEach(cell => {
      const cleanCell = cell.replace(/&lt;code&gt;/g, '<code>').replace(/&lt;\/code&gt;/g, '</code>');
      if (isHeaderRow) {
        table += `<th>${cleanCell}</th>`;
      } else {
        table += `<td>${cleanCell}</td>`;
      }
    });
    table += '</tr>';
    isHeaderRow = false;
  });
 
  table += '</table>';
  return table;
}
 
// Toast notification helper
function showToast(message) {
  elements.toastText.innerText = message;
  elements.toastContainer.style.display = 'block';

  setTimeout(() => {
    elements.toastContainer.style.display = 'none';
  }, 3000);
}

// ---------------------------------------------------------------------------
// Version & Compliance Reference Manifest (Check for Updates)
// ---------------------------------------------------------------------------
// Best-effort local refresh, in priority order:
//   1. An embedded <script id="version-manifest"> tag -- present in the standalone build
//      whenever bundle.py was last run with a data/versions.json on disk (see bundle.py).
//   2. A same-origin fetch of data/versions.json -- works for the modular dev build served
//      over http://, but fails closed under file:// (the standalone build), which is expected.
//   3. EMBEDDED_MANIFEST -- the final hardcoded fallback baked into this file.
async function loadLocalManifest() {
  state.manifest = EMBEDDED_MANIFEST;
  state.manifestSource = 'bundled';

  const embeddedTag = document.getElementById('version-manifest');
  if (embeddedTag) {
    try {
      const data = JSON.parse(embeddedTag.textContent);
      if (data && data.manifestVersion) {
        state.manifest = data;
        state.manifestSource = 'bundled (data/versions.json at build time)';
        return;
      }
    } catch (err) {
      // Malformed embedded manifest; fall through to the fetch/hardcoded fallback below.
    }
  }

  try {
    const res = await fetch('./data/versions.json', { cache: 'no-store' });
    if (res.ok) {
      const data = await res.json();
      if (data && data.manifestVersion) {
        state.manifest = data;
        state.manifestSource = 'local file';
      }
    }
  } catch (err) {
    // Expected under file:// (standalone build) or when data/versions.json isn't served. Silent.
  }
}

function statusClass(status) {
  if (status === 'current' || status === 'supported') return 'status-current';
  if (status === 'eol' || status === 'eol-soon' || status === 'deprecated') return 'status-eol';
  return '';
}

// The richer data/versions.json manifest nests fields like {status, notes, source} per entry,
// while the hardcoded EMBEDDED_MANIFEST fallback (and a freshly fetched online manifest) may use
// plain strings instead. Handle both shapes rather than assuming one.
function formatManifestEntry(v) {
  if (v == null) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'object') {
    return Object.entries(v)
      .filter(([k]) => k !== 'source')
      .map(([, val]) => val)
      .join(' — ');
  }
  return String(v);
}

function renderManifestModal() {
  const m = state.manifest || EMBEDDED_MANIFEST;
  const body = elements.updateModalBody;
  if (!body) return;

  const osRows = (m.openstack.releases || []).map(r =>
    `<tr><td>${r.value}</td><td>${r.codename || ''}</td><td>${r.slurp ? 'Yes' : 'No'}</td><td>${r.releaseDate || ''}</td><td class="${statusClass(r.status)}">${r.status || ''}</td></tr>`
  ).join('');

  const rhosoRows = (m.redhat.options || []).map(r =>
    `<tr><td>${r.label}</td><td class="${statusClass(r.status)}">${r.status}${r.deprecatedDate ? ' (' + r.deprecatedDate + ')' : ''}${r.eolDate ? ' (' + r.eolDate + ')' : ''}</td></tr>`
  ).join('');

  const compliance = m.compliance || {};
  const adjacent = m.adjacentProjects || {};
  const vendors = m.storageVendors || {};

  body.innerHTML = `
    <h4>OpenStack Release Train</h4>
    <table>
      <tr><th>Version</th><th>Codename</th><th>SLURP</th><th>Released</th><th>Status</th></tr>
      ${osRows}
    </table>

    <h4>Red Hat OpenStack</h4>
    <table>
      <tr><th>Option</th><th>Status</th></tr>
      ${rhosoRows}
    </table>

    <h4>Adjacent Projects</h4>
    <ul style="padding-left:1.1rem;">
      ${Object.values(adjacent).map(v => `<li>${formatManifestEntry(v)}</li>`).join('')}
    </ul>

    <h4>Compliance Standards</h4>
    <ul style="padding-left:1.1rem;">
      ${Object.values(compliance).map(v => `<li>${formatManifestEntry(v)}</li>`).join('')}
    </ul>

    <h4>Storage Vendor Drivers</h4>
    <ul style="padding-left:1.1rem;">
      ${Object.values(vendors).map(v => `<li>${formatManifestEntry(v)}</li>`).join('')}
    </ul>
  `;

  const genDate = m.generatedAt ? new Date(m.generatedAt).toISOString().slice(0, 10) : 'unknown';
  elements.updateModalStatus.innerText = `Showing ${state.manifestSource} data, generated ${genDate}.`;
}

function openUpdateModal() {
  renderManifestModal();
  elements.updateModalOverlay.style.display = 'flex';
}

function closeUpdateModal() {
  elements.updateModalOverlay.style.display = 'none';
}

// Explicit, user-triggered online check -- never runs automatically or on a schedule.
// For a truly air-gapped environment, this fetch will simply fail closed (see catch below);
// use check_for_updates.py from a machine with internet access to refresh data/versions.json instead.
async function checkForUpdatesOnline() {
  elements.updateModalStatus.innerText = 'Checking online for updates...';
  elements.btnFetchUpdates.disabled = true;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const res = await fetch(MANIFEST_URL, { cache: 'no-store', signal: controller.signal });
    clearTimeout(timeout);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (!data || !data.manifestVersion) throw new Error('Unrecognized manifest format');

    const wasLatest = (state.manifest || EMBEDDED_MANIFEST).openstack.latest;
    state.manifest = data;
    state.manifestSource = 'online';
    renderManifestModal();

    if (data.openstack && data.openstack.latest && data.openstack.latest !== wasLatest) {
      showToast(`Updated: latest OpenStack release is now ${data.openstack.latest}.`);
    } else {
      showToast('Reference data refreshed from online source.');
    }
  } catch (err) {
    clearTimeout(timeout);
    const genDate = (state.manifest || EMBEDDED_MANIFEST).generatedAt;
    const dateStr = genDate ? new Date(genDate).toISOString().slice(0, 10) : 'unknown';
    elements.updateModalStatus.innerText = `Could not reach update source (offline, or ${MANIFEST_URL} not yet published) -- showing ${state.manifestSource} data from ${dateStr}. Run check_for_updates.py from a machine with internet access to refresh this offline.`;
  } finally {
    elements.btnFetchUpdates.disabled = false;
  }
}
