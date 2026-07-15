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

## 📖 Detailed Documentation

To explore specific architecture and calculation topics in detail, see the structured guides in the `docs/` directory:
* 🧮 **[Sizing & Capacity Engine](file:///g:/My%20Drive/AntiGravity/Openstack/docs/sizing_engine.md)**: Deep dive into virtual resource demands, overcommit node capacity equations, Ceph OSD count math, and network bandwidth calculations.
* 🏗️ **[Software Architecture & SVG Pipeline](file:///g:/My%20Drive/AntiGravity/Openstack/docs/architecture.md)**: Details on the glassmorphic design system (CSS), state synchronization flow (JS), and dynamic vector rendering of logical network tunnels.
* 🛡️ **[Sovereign Compliance & Validation Engine](file:///g:/My%20Drive/AntiGravity/Openstack/docs/compliance.md)**: In-depth criteria for NCA CSCC (Saudi Arabia) and DESC CSP (Dubai) checklists, and real-time overcommit warning bounds.
* 🚀 **[Production Deployment & Setup Guides](file:///g:/My%20Drive/AntiGravity/Openstack/docs/deployment.md)**: Step-by-step installation guidelines for Kolla-Ansible, Canonical Charmed OpenStack, and Red Hat OpenStack Services on OpenShift (RHOSO) 18.0.

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
Open **index.html(http://index.html)** in your browser.

### 2. Standalone Single-File Compilation
To compile the entire app (HTML + CSS + JS) into a single standalone HTML page for air-gapped systems, execute the bundler:

```bash
python bundle.py
```
This builds [openstack_design_tool_standalone.html](file:///g:/My%20Drive/AntiGravity/Openstack/openstack_design_tool_standalone.html) in the root folder, which can be opened directly by double-clicking on any machine.

### 3. Save & Load Configuration
- Click **Save Config** in the header to download a JSON file of your current configuration parameters.
- Click **Load Config** in the header and select your JSON config file to restore the session.

---

## ⚖️ Ownership, Intellectual Property & Legal Terms

Copyright © 2026 Eugene Beauzec. All Rights Reserved.

### 1. Ownership & Intellectual Property Rights
This software application (the "OpenStack Sizing, Compliance & Design Configurator", hereinafter "Software"), including without limitation its source code, object code, HTML, CSS, JavaScript modules, calculators, templates, documentation, technical specifications, architecture, designs, workflows, configurations, prompts, scripts, build materials, databases, user interfaces, and all related materials, content and developments, whether existing now or created in the future, is the sole and exclusive intellectual property of Eugene Beauzec.

All rights, title and interest in and to the Software, including all copyright, economic rights, moral rights to the extent applicable, neighbouring rights, database rights, know-how, trade secrets, inventions, improvements, derivative works, updates, enhancements and all other intellectual property rights, are and shall remain exclusively vested in Eugene Beauzec, unless expressly transferred by him under a separate written agreement signed by him. All rights not expressly granted in writing by Eugene Beauzec are strictly reserved.

### 2. Independent Development Statement
The Software was independently conceived, authored, developed, tested and assembled by Eugene Beauzec on his own time and using independent tools, resources and development environments. The Software was not created as a work-for-hire, commissioned work, employment deliverable, client assignment, internal project, sponsored project, or contractual obligation for any employer, former employer, client, sponsor, platform provider, user, contributor or third party.

No employer, former employer, client, sponsor, platform provider, user, contributor or third party shall acquire any ownership interest, licence, royalty, profit-share, assignment right, benefit, claim, control, or other right in or to the Software by reason of Eugene Beauzec’s past or present employment, sponsorship, administrative status, visa status, immigration status, professional relationship, access to the Software, use of the Software, feedback, contribution, or use of independent development tools.

The Software does not contain, incorporate, derive from, or rely upon any confidential information, proprietary material, customer data, trade secrets, private repositories, internal systems, credentials, unpublished documentation, business plans, source code, technical materials, employer-provided resources, or non-public information belonging to any employer, former employer, client, sponsor, platform provider, user, contributor or third party.

Any use of third-party tools, including generative-AI assisted development tools, was carried out solely as an independent development aid under Eugene Beauzec’s personal direction, review, testing, selection and control. No confidential, proprietary, customer, internal, employer-owned, client-owned, or trade-secret information of any employer, former employer, client, sponsor, platform provider, user, contributor or third party was submitted to, uploaded into, disclosed to, or used with such tools in connection with the development of the Software.

### 3. Usage & Restriction Terms
No person or entity may copy, reproduce, modify, adapt, translate, publish, distribute, commercialise, sublicense, sell, assign, transfer, pledge, reverse engineer, remove attribution from, or claim authorship or ownership of the Software, in whole or in part, except as expressly authorised in writing by Eugene Beauzec.

Any permitted use of the Software is subject to the licence terms expressly stated by Eugene Beauzec in the `LICENSE` file. Nothing in this notice shall be interpreted as granting any implied licence, ownership right, commercial right, assignment, waiver, consent, or permission beyond what is expressly granted in writing.

If any third-party proprietary material is credibly identified as having been inadvertently included in the Software, Eugene Beauzec reserves the right to remove, replace or remediate such material promptly, without admission of liability and without prejudice to his ownership of the remaining Software.

### 4. Compatibility & Interoperability Disclaimers
Any references to third-party products, services, companies, platforms, trademarks, technologies or tools (such as Red Hat, OpenStack, RHOSP, Ceph, Kubernetes, Calico, Cinder, NetApp, EMC, Vault, and others) are made solely for identification, compatibility, interoperability, technical, or documentation purposes. Such references do not imply any affiliation, sponsorship, endorsement, approval, authorisation, partnership, licence, or commercial relationship with the relevant third-party owner. All third-party trademarks, product names, company names and service names remain the property of their respective owners.

### 5. Sizing & Sizing Outputs Disclaimer
This Software is an architectural planning and sizing tool. Sizing calculations, capacity projections, and compliance checklists generated by this tool are estimates for planning purposes only and must be independently verified in a staging environment before any production deployment. The user assumes all risk and responsibility for the design, deployment, configuration, security, and operation of any infrastructure sized or configured using this Software.

### 6. Warranty & Liability Limitation (Indemnification)
THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHOR (EUGENE BEAUZEC), COPYRIGHT HOLDERS, OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE, MISUSE, OR INABILITY TO USE THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.


