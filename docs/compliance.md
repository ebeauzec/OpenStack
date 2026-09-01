# Sovereign & Enterprise Compliance Validation Engine

This document describes how the OpenStack Sizing, Compliance & Design Configurator enforces security guidelines and architecture limits for every supported compliance standard, and shows real examples of the warnings the tool generates.

---

## 1. Supported Standards

Seven checkboxes in Step 1 map to seven distinct rule sets, each independently combinable (you can check any combination — the tool doesn't force you into a single-standard mode):

| Standard | Full name | Region / Sector |
|---|---|---|
| SOC 2 Type II | Service Organization Control 2 | General enterprise/CSP trust criteria |
| PCI-DSS v4.0.1 | Payment Card Industry Data Security Standard | Cardholder data environments |
| HIPAA | Health Insurance Portability and Accountability Act (Security Rule) | US healthcare / ePHI |
| GDPR | General Data Protection Regulation | EU data residency/processing |
| Saudi NCA CCC | National Cybersecurity Authority — Cloud Cybersecurity Controls (CCC-2:2024) | Saudi Arabia, cloud-specific |
| Dubai DESC CSP | Dubai Electronic Security Center — Cloud Security Provider Regulation, layered on ISR v3.0 | Dubai / UAE |
| UAE NESA IAS | Colloquial name; the current framework is UAE IAR/IAS v2 under TDRA / Cyber Security Council | UAE, national |

> **A note on precision:** where a standard's public documentation does not expose granular per-section control IDs, this tool cites control **domains** (e.g. "resource governance," "cryptography," "logging & monitoring") rather than fabricating specific section numbers. Saudi Arabia's National Cybersecurity Authority publishes two related but distinct frameworks — **CCC** (Cloud Cybersecurity Controls, the cloud-specific one this tool targets) and **CSCC** (Critical Systems Cybersecurity Controls, a different, non-cloud-specific extension) — and this tool is careful to cite the correct one.

---

## 2. What each standard actually checks

### A. SOC 2 Type II
No dedicated numbered requirements; triggers the general encryption-at-rest and log-auditing checks shared with GDPR (see §3 below), reflecting SOC 2's Trust Services Criteria around security and confidentiality.

### B. PCI-DSS v4.0.1
- **Requirement 3** (Protect Stored Account Data): flags Barbican encryption as `DISABLED (Non-Compliant)` if not enabled — cardholder data at rest must be unreadable.
- **Requirement 8** (Authentication & Access Control): notes MFA/Keystone password-complexity and token-duration restrictions.
- **Requirement 10** (Log and Monitor Access): confirms event logs are routed to the configured central SIEM host.

*(v4.0.1 superseded v4.0 in June 2024 with clarifications only — no requirement renumbering. All previously future-dated requirements became mandatory as of March 31, 2025. PCI-DSS v5.0 is in development as of this writing, with no published release date.)*

### C. HIPAA
Selecting HIPAA sets the Healthcare industry profile's compliance text: encryption-at-rest for Cinder/Manila and syslog forwarding of admin tokens. **Regulatory status worth knowing:** as of this tool's last data verification, the HIPAA Security Rule's mandate to make encryption and MFA *required* (rather than the current "addressable"/discretionary standard) exists only as a proposed rule (NPRM) — not yet finalized. Treat this tool's HIPAA-driven recommendations as *current best practice ahead of the likely regulatory direction*, not as an already-binding legal requirement.

### D. GDPR
Triggers the same general encryption-at-rest and log-auditing checks as SOC 2. For EU data-residency designs specifically, also consider the EU Data Act's Chapter VII (effective September 2025), which adds binding provisions on blocking unlawful non-EU government data access requests — a materially different, and more specific, requirement than GDPR's core text alone.

### E. Saudi NCA CCC (Cloud Cybersecurity Controls, CCC-2:2024)
- **Resource governance domain:** recommends capping CPU overcommit at **2:1** and enforcing 1:1 RAM allocation for critical/database workloads.
- **Cryptography domain:** flags Barbican encryption-at-rest status.
- **Backup & recovery domain:** flags whether both Cinder Backup *and* Cinder DR Replication are configured.
- **Data & information protection domain:** requires a Ceph replica factor of at least 3.
- **Logging & monitoring domain:** confirms SIEM log forwarding is targeted correctly.

### F. Dubai DESC CSP (Cloud Security Provider Regulation, ISR v3.0)
- Requires a minimum HA control-plane buffer of 2 nodes for medium/large deployment scales.
- Flags Barbican encryption status with an explicit FIPS 140-2 note.
- Flags whether off-site backups and DR replication are active.
- For Manila: requires DHSS=True share-server isolation for tenant data separation.
- Recommends CPU overcommit not exceed **3:1**.

### G. UAE NESA IAS (now IAR/IAS v2, TDRA / Cyber Security Council)
- Recommends capping CPU overcommit at **4:1** — the most permissive ceiling of any standard in this tool, reflecting NESA's framing around preventing denial-of-service via resource starvation rather than a strict no-overcommit posture.
- Flags Barbican encryption integration status alongside TLS endpoint validation and SIEM event auditing.

---

## 3. Live validation rules (apply across all standards)

The validation engine (`runLiveValidation()` in [js/app.js](../js/app.js)) re-evaluates every rule on every input change — there is no "submit" step, and no way to generate a document without seeing the current warning state first.

### A. Overcommit ceilings by active standard

| Standard | CPU Overcommit ceiling | RAM Overcommit ceiling |
|---|---|---|
| Saudi NCA CCC | 2:1 | 1:1 (no overcommit) |
| Dubai DESC CSP | 3:1 | 1:1 (no overcommit) |
| UAE NESA IAS | 4:1 | *(not restricted)* |

If more than one standard is checked simultaneously, the **tightest** applicable ceiling governs — e.g. checking both NCA CCC and DESC CSP together means the 2:1 CPU ceiling applies, not the looser 3:1.

### B. Compliance gaps (any standard checked)

If **any** compliance standard is checked and the corresponding control isn't configured, the tool raises a specific, actionable warning. Two real examples, captured from a default Financial Services (SOC2 + PCI-DSS) sizing session before remediation:

> **Compliance Gap (Encryption):** Standards (SOC2, PCI-DSS) require active encryption-at-rest. Enable Barbican in Step 3 to encrypt volumes, images, and ephemeral disks.

> **Compliance Gap (Disaster Recovery):** Standards (SOC2, PCI-DSS) mandate backup repositories. Enable Cinder Backup in Step 3.

Both clear immediately once Barbican and Cinder Backup are enabled — there's no need to regenerate anything or navigate away and back.

### C. Ceph replica-factor floor
If any compliance standard is active and the Ceph replica factor is set below 3, the tool raises:

> **Compliance Gap (Redundancy):** Ceph replica factor is *N*, violating the minimum floor of 3 required by *[active standards]*.

### D. Manila DHSS/backend compatibility
Independent of any compliance checkbox — this is a hard architectural constraint enforced whenever CephFS or VAST Data is selected as a Manila backend with DHSS=True:

> **Warning:** the CephFS backend does not support DHSS=True. You must configure DHSS to False for these shares, or switch to NetApp ONTAP.

This gate is deliberately scoped to Step 4, where the explanation is visible — see [docs/architecture.md](architecture.md#state-synchronization-flow) for why that scoping matters and how it's implemented.

### E. Hypervisor sizing sanity checks (not compliance-specific, but always active)
- **Hypervisor Core Overrun:** a sized VM's vCPU request exceeds a single physical node's core count.
- **Hypervisor RAM Overrun:** a sized VM's RAM request exceeds a single physical node's RAM capacity.
- **Storage Quorum Danger:** Ceph is sized below the 3-node minimum required for quorum.
- **Glance Pool Mismatch:** Glance is configured for S3/Swift but a nonzero Ceph RBD capacity is still allocated.

---

## 4. UI alert states

* **Compliant state:** when all active checks pass, the warnings panel turns **emerald green** and displays `✓ Configuration Compliant` with the message *"Sizing baseline satisfies target security controls and hypervisor limits."*
* **Warning state:** when any check fails, the panel switches to a **warning red** border, displays `⚠ Validation Alerts (N)`, and lists every specific, actionable warning — never a generic "something is wrong."

---

## 5. Worked examples per industry profile

See [docs/use_cases.md](use_cases.md) for five full worked scenarios (Financial Services, Healthcare, Telecom NFV, Sovereign Gov Cloud, and a multi-vendor storage design) showing exactly which compliance checkboxes, overcommit targets, and live warnings each industry profile produces in practice — including the Sovereign profile's DHSS/CephFS conflict, a real example of two compliance-adjacent settings clashing with each other.

---

## 6. Keeping this data current

Compliance frameworks change. Click **Check for Updates** in the running application's header to see exactly when this tool's compliance-standard data was last verified against public sources, and optionally pull a fresher manifest. See [docs/architecture.md](architecture.md#version--compliance-reference-manifest) for how that panel works, and the root [README](../README.md#4-check-for-updates) for the dark-site refresh workflow via `check_for_updates.py`.
