# Sovereign Cloud Compliance & Validation Engine

This document describes how the OpenStack Sizing, Compliance & Design Configurator enforces security guidelines and architecture limits.

---

## 1. Supported Security Frameworks

The configurator integrates Middle East sovereign cloud validation rules to ensure architectural configurations satisfy public sector and enterprise compliance baselines:

### A. NCA CCC (Saudi Arabia)
Enforces the **National Cybersecurity Authority - Cloud Cybersecurity Controls (CCC-2:2024)**, the Saudi cloud-specific control framework (distinct from the baseline ECC and the critical-infrastructure-focused CSCC extension).
* **Tenant Isolation**: Validates private encapsulation boundaries (Geneve/VXLAN overlay networks) and tenant-dedicated network routing.
* **Control Path Segregation**: Requires isolation of administrative networks from public user API endpoints.
* **Encryption Key Management**: Warns if Barbican KMS (with HashiCorp Vault backend) is disabled when sensitive workloads are declared.

### B. DESC CSP (Dubai)
Enforces the **Dubai Electronic Security Center - Cloud Security Provider Regulation**, layered on the current **Information Security Regulation (ISR) v3.0**.
* **High Availability Baselines**: Requires a minimum HA control plane buffer of `2` nodes for any medium or large enterprise scale profile.
* **Storage Encryption**: Enforces encryption at rest for Cinder storage pools and Ceph cluster OSDs.
* **Audit Trail Integration**: Validates SIEM IP forwarding targets to verify that security logging targets are defined.

> Public documentation for both frameworks generally does not expose granular per-section control IDs, so this tool cites control **domains** (e.g. "resource governance," "cryptography") rather than fabricating specific section numbers.

---

## 2. Validation & Alert Pipeline

The validation engine processes sizing parameters dynamically via `runLiveValidation()` inside [js/app.js](file:///g:/My%20Drive/AntiGravity/Openstack/js/app.js). 

### A. Evaluated Constraints
The validator checks the following thresholds in real time:
1. **CPU Overcommit Bounds**: Triggers an alert if the virtual-to-physical core overcommit ratio exceeds the active compliance profile's threshold: `2.0` (NCA CCC), `3.0` (DESC CSP), or `4.0` (NESA IAS).
2. **RAM Overcommit Bounds**: Triggers an alert if memory overcommit is set greater than `1.0` (no overcommit) under the NCA CCC or DESC CSP profiles.
3. **Controller Scale Limits**: Warns if controller replication is insufficient to satisfy the planned deployment scale.
4. **Compliance Violations**: Verifies that required regulatory checklists are checked for sovereign deployment vertical profiles.

### B. UI Alert States
* **Compliant State**: If all constraints are satisfied, the bottom warnings panel turns **emerald green** (`.compliant`) and displays `✓ Configuration Compliant`.
* **Warning State**: If any limits are breached, the panel instantly switches to a **warning red** border (`.has-warnings`), displays `⚠ Validation Alerts`, and renders a scrollable list of the detailed architectural warnings.
