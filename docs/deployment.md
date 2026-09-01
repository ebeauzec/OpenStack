# Production Deployment & Installation Steps

This document expands on the step-by-step installation guides the configurator generates for Kolla-Ansible, Canonical Charmed OpenStack, and Red Hat OpenStack Services on OpenShift (RHOSO) / RHOSP platforms. The commands below match the tool's own Step 7 "Deployment Guide" output — this document adds prerequisites, context, and troubleshooting notes the generated guide keeps terse.

---

## 1. Kolla-Ansible (Vanilla / Containerized)

Containerized deployments utilize Docker/Podman container runtimes managed by Ansible automation. This is the tool's default distribution choice and the most portable of the three across on-prem hardware.

### Prerequisites
- A deployment host (Ansible control node) with Python 3.10+ and network reachability to every target node over the Management subnet configured in Step 6.
- Target nodes running a supported base OS (the generated inventory assumes `ubuntu` by default; adjust `kolla_base_distro` in `globals.yml` if targeting RHEL/Rocky instead).
- SSH key-based access from the deployment host to every controller, compute, and (if using Ceph) storage node.

### A. Environment Bootstrapping

Before deployment, configure access to the target physical nodes in your multinode inventory file (generated in the **Kolla-Ansible Configs** tab):

```bash
# Bootstrap servers (installs Docker, configures hostname resolution, sets up SSH keys)
kolla-ansible -i multinode bootstrap-servers
```

### B. Deployment Cycle

Run the checks and deploy the services:

```bash
# Verify system prerequisites (packages, network interfaces, kernel parameters)
kolla-ansible -i multinode prechecks

# Run deployment playbooks
kolla-ansible -i multinode deploy

# Generate admin configuration credentials
kolla-ansible -i multinode post-deploy
source /etc/kolla/admin-openrc.sh
```

### C. Common issues

- **`prechecks` fails on a storage backend port check** — if you selected a non-Ceph Cinder/Manila backend (Pure, HPE, Dell, VAST, NetApp, PowerFlex), Kolla-Ansible has no built-in role for most of these; the generated `globals.yml` flags them as sizing metadata only. Inject the actual driver stanza (from the **cinder.conf** / **manila.conf** tabs) via `/etc/kolla/config/cinder/cinder-volume.conf` config overrides, per Kolla-Ansible's [custom config documentation](https://docs.openstack.org/kolla-ansible/latest/admin/advanced-configuration.html).
- **`openstack_release` mismatch** — the generated `globals.yml` pins `openstack_release` to the exact OpenStack version selected in Step 1 (e.g. `2026.1`); make sure your `kolla-ansible` pip package version matches, since a mismatched control-plane/tooling version pairing is a common source of deploy failures.

---

## 2. Canonical Charmed OpenStack (Juju)

Charmed OpenStack uses the Juju model-driven controller to deploy and coordinate charms over a MAAS (Metal-as-a-Service) cloud fabric.

### Prerequisites
- A working MAAS deployment with target nodes already commissioned.
- The `juju` snap installed on your deployment client.
- MAAS credentials registered in `~/.config/juju/clouds.yaml`.

### A. Juju Bootstrap

Ensure your MAAS cloud is registered, then deploy the controller:

```bash
# Install Juju client via snap
snap install juju --channel=3.1/stable

# Bootstrap Juju controller onto MAAS (Metal-as-a-Service) cloud fabric
juju bootstrap maas-cloud openstack-controller

# Create target model
juju add-model openstack-prod
```

### B. Bundle Deployment

Deploy the generated `bundle.yaml` application stack (from the **Juju Bundle** tab):

```bash
juju deploy ./bundle.yaml

# Monitor deployment progress until all services are active/idle
juju status --watch 5s
```

### C. Storage backend charms

The generated bundle automatically includes `cinder-ceph` and/or `cinder-netapp` subordinate charms when those backends are selected, correctly related to `cinder:storage-backend` and (for Ceph) `ceph-mon:client`. For Pure Storage, HPE, Dell PowerStore/PowerMax, and VAST Data — none of which have an official Charmhub charm — the bundle includes an explicit comment marking where to inject the driver stanza (from the **cinder.conf** tab) via Juju's config overlay mechanism and relate it manually.

### D. Sunbeam note

This tool targets the classic Juju machine-charm bundle above. Canonical also ships **Sunbeam** — a Kubernetes-native, Juju-orchestrated deployment model (marketed as "Canonical OpenStack") it now recommends as the default path for new small/edge-scale clouds (`sunbeam cluster bootstrap`, no `bundle.yaml`). Sunbeam is not yet at full outcome parity with classic Charmed OpenStack for large multi-site CSP builds, which is why this tool's generator still targets the classic bundle. If you're scoping a new small/edge deployment rather than a large multi-site CSP build, evaluate Sunbeam directly — classic Charmed OpenStack (Juju/MAAS) remains fully supported and is not being deprecated.

---

## 3. Red Hat OpenStack Services on OpenShift (RHOSO) 18.0

RHOSO 18.0 deploys the OpenStack control plane as native pods inside a Red Hat OpenShift Container Platform (RHOCP) cluster, utilizing the OpenStack Operator. This is Red Hat's current OpenStack product line — the classic director-based RHOSP (17.1, 16.2) remains supported through 2027 but is positioned as the legacy path.

### Prerequisites
- A running Red Hat OpenShift Container Platform cluster with sufficient worker-node capacity for the OpenStack control plane pods.
- Cluster-admin access via `oc login`.
- The OpenStack Operator available via OperatorHub or a configured `redhat-operators` catalog source.

### A. Namespace & Secret Creation

Log in to OpenShift and prepare the namespace and encryption secret containing target MySQL, RabbitMQ, and administration credentials:

```bash
oc login https://api.openshift.example.com:6443
oc new-project openstack

# Create OSP admin and database secret
oc create secret generic osp-secret \
  --from-literal=AdminPassword=admin_secure_pass \
  --from-literal=DatabasePassword=db_secure_pass \
  --from-literal=RabbitMqPassword=mq_secure_pass
```

### B. Apply Control Plane CR

Deploy the OpenStack Control Plane Custom Resource using the OpenStack Operator (generated in the **RHOSP Templates** tab):

```bash
oc apply -f openstack-control-plane.yaml

# Track service pods initialization
oc get openstackcontrolplane -n openstack -w
```

Once deployed, the operator reconciles the state and deploys all OpenStack services (Glance, Nova, Cinder, Keystone, Neutron) as microservices on OpenShift compute worker nodes.

### C. Cinder backend coverage

The generated Control Plane CR's `cinderVolumes` block includes a `customServiceConfig` stanza for **every** Cinder backend selected in Step 3 — Ceph, NetApp, PowerFlex, Pure, HPE, and Dell PowerStore/PowerMax all get their own named entry (`ceph-backend`, `netapp-backend`, `pure-backend`, etc.), not just Ceph.

---

## 4. Distribution comparison

| | Kolla-Ansible | Charmed OpenStack (Juju) | RHOSO 18.0 |
|---|---|---|---|
| Deployment model | Containerized (Docker/Podman) via Ansible | Model-driven charms over MAAS | Operator-managed pods on OpenShift |
| Best fit | Portable, distro-agnostic on-prem builds | Existing MAAS/Juju estates, or evaluating Sunbeam next | Existing OpenShift estates, Red Hat support contracts |
| Non-Ceph 3rd-party storage | Config-override injection (no native role) | Config-overlay injection (no official charm) | Native — one `customServiceConfig` block per backend |
| Generated by this tool | Inventory + `globals.yml` | `bundle.yaml` | `openstack-control-plane.yaml` (18.0) or `network-environment.yaml` (classic) |

---

## 5. After deployment

Regardless of distribution, once the control plane is up:
1. Source the generated admin credentials (`admin-openrc.sh` for Kolla, `juju run keystone/leader get-admin-credentials` for Juju, or the OpenShift secret for RHOSO) and confirm with `openstack service list`.
2. Cross-check the deployed Cinder/Manila/Ceph capacity against the numbers in this tool's Proposal & Design Document — see [docs/sizing_engine.md](sizing_engine.md) for how those numbers were derived.
3. Re-run the compliance checklist in this tool against your *actual* deployed configuration (Barbican status, backup status, replica factor) to confirm the live design still matches what was signed off — configurations drift during real deployments, and this tool's live-validation engine is cheap to re-check against.
