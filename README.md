# OpenStack Sizing, Compliance & Design Configurator

An interactive web-based wizard designed for system architects and cloud engineers to plan, size, and validate Red Hat OpenStack Platform (RHOSP) environments. It includes real-time sizing calculations, logical topology diagramming, compliance checks, and exports configuration templates for deployment.

---

## 🚀 Key Features

* **Interactive Configuration Wizard**: Step-by-step sizing for compute workloads, Ceph storage backends, virtual networking subnets, Kubernetes (OpenShift) integrations, and security controls.
* **Real-time Capacity Sizing Engine**: 
  - Compute & Hypervisor limits (vCPUs, RAM, Local Disk).
  - Dynamic CPU/RAM overcommit evaluation.
  - Ceph capacity forecasting (OSD count, replication factors, IOPS sizing, storage grid bucketing).
  - HA buffer planning.
* **Live Logical Topology Diagram**: A dynamic, responsive SVG-based topology mapping control path, active data path, and logical network tunnels in real time.
* **Sovereign Cloud Compliance Integration**: Validates configs against Middle East sovereign compliance standards, including:
  - **NCA CSCC** (National Cybersecurity Authority Cybersecurity Controls - Saudi Arabia).
  - **DESC CSP** (Dubai Electronic Security Center Cloud Security Provider Regulation).
* **Save/Load State**: Export current configuration inputs to a `.json` file and reload them instantly to continue sizing.
* **Automated Exporters**: Generates high-level (HLD) and low-level (LLD) parameters for Glance, Nova, Neutron, Cinder, Manila, Ceph, Juju, SIEM, Ansible, and Kubernetes.
* **Offline Compilability**: Packaged into a single, fully-inlined, standalone HTML page for air-gapped secure enterprise zones.

---

## 📁 Project Architecture

* **[index.html](file:///g:/My%20Drive/AntiGravity/Openstack/index.html)**: Modular, modern, responsive interface styled with glassmorphism and an integrated SVG dashboard.
* **[style.css](file:///g:/My%20Drive/AntiGravity/Openstack/style.css)**: Vanilla CSS design system incorporating theme variables, typography, layouts, and responsive queries.
* **[js/app.js](file:///g:/My%20Drive/AntiGravity/Openstack/js/app.js)**: State coordinator, event handlers, Greenfield reset logic, and DOM sync managers.
* **[js/calculator.js](file:///g:/My%20Drive/AntiGravity/Openstack/js/calculator.js)**: Sizing logic for compute nodes, Ceph storage pools, and IP allocations.
* **[js/templates.js](file:///g:/My%20Drive/AntiGravity/Openstack/js/templates.js)**: Generates detailed structural configuration parameters and documentation for deployment tools.
* **[bundle.py](file:///g:/My%20Drive/AntiGravity/Openstack/bundle.py)**: Python compilation script to inline all styles and scripts.

---

## 🛠️ Usage Guidelines

### 1. Run Modular App Locally
Start a local HTTP server in the project root to load modular JS files securely (avoiding CORS blockades on local files):

```bash
# Python
python -m http.server 8000

# Node.js
npx http-server -p 8000
```
Open **[http://localhost:8000/index.html](http://localhost:8000/index.html)** in your browser.

### 2. Standalone Single-File Compilation
To compile the entire app (HTML + CSS + JS) into a single standalone HTML page for air-gapped systems, execute the bundler:

```bash
python bundle.py
```
This builds [openstack_design_tool_standalone.html](file:///g:/My%20Drive/AntiGravity/Openstack/openstack_design_tool_standalone.html) in the root folder, which can be opened directly by double-clicking on any machine.

### 3. Save & Load Configuration
- Click **Save Config** in the header to download a JSON file of your current configuration parameters.
- Click **Load Config** in the header and select your JSON config file to restore the session.
