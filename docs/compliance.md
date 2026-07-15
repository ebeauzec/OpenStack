# Sovereign Cloud Compliance & Validation Engine

This document describes how the OpenStack Sizing, Compliance & Design Configurator enforces security guidelines and architecture limits.

---

## 1. Supported Security Frameworks

The configurator integrates Middle East sovereign cloud validation rules to ensure architectural configurations satisfy public sector and enterprise compliance baselines:

### A. NCA CSCC (Saudi Arabia)
Enforces the **National Cybersecurity Authority - Cybersecurity Controls for Cloud Service Providers**.
* **Tenant Isolation**: Validates private encapsulation boundaries (Geneve/VXLAN overlay networks) and tenant-dedicated network routing.
* **Control Path Segregation**: Requires isolation of administrative networks from public user API endpoints.
* **Encryption Key Management**: Warns if Barbican KMS (with HashiCorp Vault backend) is disabled when sensitive workloads are declared.

### B. DESC CSP (Dubai)
Enforces the **Dubai Electronic Security Center - Cloud Security Provider Regulation**.
* **High Availability Baselines**: Requires a minimum HA control plane buffer of `2` nodes for any medium or large enterprise scale profile.
* **Storage Encryption**: Enforces encryption at rest for Cinder storage pools and Ceph cluster OSDs.
* **Audit Trail Integration**: Validates SIEM IP forwarding targets to verify that security logging targets are defined.

---

## 2. Validation & Alert Pipeline

The validation engine processes sizing parameters dynamically via `runLiveValidation()` inside [js/app.js](file:///g:/My%20Drive/AntiGravity/Openstack/js/app.js). 

### A. Evaluated Constraints
The validator checks the following thresholds in real time:
1. **CPU Overcommit Bounds**: Triggers an alert if the virtual-to-physical core overcommit ratio exceeds `4.0` (standard) or `2.0` (strict regulatory profile).
2. **RAM Overcommit Bounds**: Triggers an alert if memory overcommit is set greater than `1.5`, or if memory is overallocated on small deployments.
3. **Controller Scale Limits**: Warns if controller replication is insufficient to satisfy the planned deployment scale.
4. **Compliance Violations**: Verifies that required regulatory checklists are checked for sovereign deployment vertical profiles.

### B. UI Alert States
* **Compliant State**: If all constraints are satisfied, the bottom warnings panel turns **emerald green** (`.compliant`) and displays `✓ Configuration Compliant`.
* **Warning State**: If any limits are breached, the panel instantly switches to a **warning red** border (`.has-warnings`), displays `⚠ Validation Alerts`, and renders a scrollable list of the detailed architectural warnings.
