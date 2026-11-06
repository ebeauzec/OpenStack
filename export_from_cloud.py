#!/usr/bin/env python3
"""
export_from_cloud.py

Reads an EXISTING, LIVE OpenStack cloud's real inventory (compute hosts,
instances, Cinder/Manila backends and capacity, Neutron SDN driver) over its
REST APIs, and writes a JSON file in the exact shape this tool's own
"Save Config" button produces -- so it can be re-imported with the "Load
Config" button in the wizard for "as-built" modelling.

Why a separate script instead of a "log in" button in the wizard itself:
the wizard is a static, client-side, zero-backend page by design (see
README -- it's meant to run air-gapped, with no network dependency). Adding
live cloud login directly to that page would mean (a) typing real production
credentials into a page that today never talks to a network, and (b) relying
on every target cloud's Keystone/Nova/Cinder/Manila/Neutron endpoints having
CORS enabled for browser fetches, which production OpenStack deployments
essentially never do. This script keeps that boundary intact: it runs where
the user already has real admin/CLI access to the cloud (the same place
`openstack` CLI commands work), and only a plain JSON file -- no credentials,
no live connection -- ever reaches the browser page. Same pattern as
check_for_updates.py's "local helper does the networked part" split.

Auth: reuses the exact same environment variables as the official
`openstack` CLI / python-openstackclient (so `source openrc.sh` or your
existing clouds.yaml-sourced env is enough -- nothing OpenStack-specific to
set up just for this script):
    OS_AUTH_URL, OS_USERNAME, OS_PASSWORD, OS_PROJECT_NAME,
    OS_USER_DOMAIN_NAME (default "Default"), OS_PROJECT_DOMAIN_NAME (default
    "Default"), OS_REGION_NAME (optional), OS_INTERFACE (default "public"),
    OS_INSECURE ("1" to skip TLS verification, self-signed labs).
Application credential auth is also supported (preferred for anything but a
quick lab check) via OS_APPLICATION_CREDENTIAL_ID / OS_APPLICATION_CREDENTIAL_SECRET,
which does not require a password and is pre-scoped to one project.

What gets imported, and how confidently (see the generated *_import_report.md
for the per-field breakdown on your actual cloud):
  - RELIABLE  : compute node count/specs (Nova hypervisors), instance count
                and average flavor size (Nova servers+flavors), Cinder/Manila
                backend types and in-use capacity (volume/share types +
                volumes/shares), Neutron SDN driver (OVN vs ML2/OVS, from the
                agent list).
  - BEST-EFFORT: CPU/RAM overcommit ratio (Placement API resource provider
                inventories -- needs admin rights; silently skipped if not
                reachable), subnet role mapping (guessed from Neutron network
                names/external flag -- real clouds rarely name networks the
                way this wizard's fixed 6-VLAN convention expects).
  - NOT DETECTABLE AT ALL via OpenStack APIs, always left at the wizard's
    default/CLI-supplied value: openstackDistro, openstackVersion (no API
    reports a release codename -- pass --os-version if you know it),
    industry/compliance profile (business decision, not infra state), Ceph's
    *physical* OSD layout (disk size, OSDs/node, replica factor -- Ceph's own
    admin API, not an OpenStack one), Barbican/StorageGrid/K8s-overlay
    config (optional add-ons this script does not probe for).

Usage:
    # against your real, already openrc'd cloud
    python export_from_cloud.py --project-name "Acme Prod Cloud"

    # try the field-mapping logic with no cloud at all (built-in sample data)
    python export_from_cloud.py --mock --project-name "Mock Demo"

    # self-signed lab cert
    OS_INSECURE=1 python export_from_cloud.py

Output (next to this script, unless --out-dir is given):
    <slug>_imported_config.json   -- load this via the wizard's Load Config button
    <slug>_import_report.md       -- what was discovered vs. assumed, read this first

This script never writes to, or reads from, the wizard's own files. It only
produces input files for the existing Load Config mechanism.
"""

import argparse
import json
import re
import ssl
import statistics
import sys
import urllib.error
import urllib.request
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
REQUEST_TIMEOUT_SECONDS = 20

# Mirrors state.inputs' defaults in js/app.js. Keep in sync if that schema
# changes -- there is no automated link between the two, by design (this
# script has no access to, and should not need to parse, the app's JS).
WIZARD_DEFAULT_INPUTS = {
    "projectName": "CSP Cloud Production-West",
    "openstackDistro": "kolla",
    "openstackVersion": "2026.2",
    "cspScale": "medium",
    "industry": "general",
    "compliance": [],

    "vmCount": 400,
    "vmVcpus": 4,
    "vmRam": 16,
    "vmDisk": 50,
    "cpuOvercommit": 3,
    "ramOvercommit": 1,
    "nodeCores": 64,
    "nodeRam": 256,
    "nodeDisk": 1000,
    "haBuffer": 2,
    "novaCpuMode": "host-model",
    "novaInstanceHa": False,
    "enableConfidentialComputing": False,
    "confidentialComputingTech": "sev-snp",
    "enableK8s": False,
    "k8sMasterCount": 3,
    "k8sMasterVcpus": 4,
    "k8sMasterRam": 16,
    "k8sWorkerCount": 10,
    "k8sWorkerVcpus": 8,
    "k8sWorkerRam": 32,
    "k8sWorkerDisk": 100,
    "k8sCni": "calico",
    "k8sCsi": "cinder",
    "enableVelero": False,

    "cinderCapacityTb": 150,
    "cinderBackends": ["ceph"],
    "netappIp": "10.10.30.50",
    "netappSvm": "svm_cinder_prod",
    "netappProto": "iscsi",
    "netappDedup": "true",
    "netappCompression": "true",
    "emcIp": "10.10.30.60",
    "emcPool": "sp_gold_cinder",
    "pureIp": "10.10.30.80",
    "pureProto": "iscsi",
    "hpeIp": "10.10.30.90",
    "hpePlatform": "primera_alletra",
    "hpeProto": "fc",
    "dellpsIp": "10.10.30.95",
    "dellpsPlatform": "powerstore",
    "dellpsProto": "iscsi",
    "vastIp": "10.10.30.110",
    "vastVippool": "cinder-vip-pool",
    "vastRootExport": "manila",
    "enableCinderBackup": "false",
    "cinderBackupTarget": "storagegrid",
    "enableBarbican": False,
    "barbicanBackend": "vault",
    "enableCinderReplication": False,
    "cinderReplTarget": "10.20.30.50",
    "cinderReplMode": "async",
    "cinderMultiAttach": False,
    "cinderQosEnable": False,
    "cinderQosMaxIops": 5000,
    "cinderQosMaxBps": 104857600,

    "manilaCapacityTb": 50,
    "manilaDhss": "false",
    "manilaBackends": ["cephfs_native"],
    "enableManilaReplication": "false",

    "osdSizeTb": 8,
    "osdPerNode": 12,
    "osdMedia": "ssd",
    "replicaFactor": 3,
    "glanceCapacityTb": 5,
    "glanceBackend": "rbd",
    "utilizationLimit": 0.75,
    "growthBuffer": 1.2,

    "mgmtSubnet": "10.10.10.0/24",
    "apiSubnet": "10.10.20.0/24",
    "storageFrontSubnet": "10.10.30.0/24",
    "storageBackSubnet": "10.10.40.0/24",
    "tenantSubnet": "10.10.50.0/24",
    "extSubnet": "10.10.100.0/24",
    "siemIp": "10.10.99.100",
    "siemPort": 514,
    "linkSpeedGbps": 10,
    "neutronDriver": "ovn",
    "tenantTunnelProto": "geneve",

    "mgmtCtrlStart": 11,
    "mgmtCtrlEnd": 20,
    "mgmtCompStart": 101,
    "mgmtCompEnd": 200,
    "mgmtCephStart": 201,
    "mgmtCephEnd": 250,

    "enableStoragegrid": False,
    "storagegridIp": "10.10.30.70",
    "storagegridPort": 10443,
    "storagegridAccessKey": "SG_ACCESS_KEY_ID",
    "storagegridSecretKey": "SG_SECRET_ACCESS_KEY",
    "storagegridBucket": "glance-images",
    "storagegridIlm": "2_Copies_Dual_Site",
    "storagegridCapacityTb": 50,
}

CINDER_BACKEND_PATTERNS = [
    ("ceph", re.compile(r"ceph|rbd", re.I)),
    ("netapp", re.compile(r"netapp|ontap", re.I)),
    ("emc", re.compile(r"powerflex|scaleio", re.I)),
    ("pure", re.compile(r"pure(storage)?|flasharray", re.I)),
    ("hpe", re.compile(r"hpe|3par|alletra|primera", re.I)),
    ("dellps", re.compile(r"powerstore|powermax", re.I)),
    ("vast", re.compile(r"vast", re.I)),
]

MANILA_BACKEND_PATTERNS = [
    ("cephfs_ganesha", re.compile(r"ganesha", re.I)),
    ("cephfs_native", re.compile(r"ceph|cephfs", re.I)),
    ("netapp", re.compile(r"netapp|ontap", re.I)),
    ("vast", re.compile(r"vast", re.I)),
]


class CloudApiError(RuntimeError):
    pass


class OpenStackSession:
    """Minimal, stdlib-only Keystone v3 client: just enough to authenticate,
    read the service catalog, and make admin-token GET requests. Deliberately
    not using the `openstacksdk`/`python-openstackclient` libraries so this
    script has zero dependencies beyond the standard library -- matching
    check_for_updates.py's convention and keeping it runnable on a bare
    jump-host/bastion with just a system Python install."""

    def __init__(self, auth_url, insecure=False, timeout=REQUEST_TIMEOUT_SECONDS):
        self.auth_url = auth_url.rstrip("/")
        self.timeout = timeout
        self.token = None
        self.catalog = []
        self._ssl_context = ssl._create_unverified_context() if insecure else None

    def _request(self, url, headers=None, data=None, method="GET"):
        req = urllib.request.Request(url, data=data, method=method)
        req.add_header("Accept", "application/json")
        if data is not None:
            req.add_header("Content-Type", "application/json")
        for k, v in (headers or {}).items():
            req.add_header(k, v)
        try:
            resp = urllib.request.urlopen(req, timeout=self.timeout, context=self._ssl_context)
            body = resp.read().decode("utf-8") if resp.length != 0 else ""
            return resp, (json.loads(body) if body else {})
        except urllib.error.HTTPError as e:
            detail = ""
            try:
                detail = e.read().decode("utf-8", errors="replace")
            except Exception:
                pass
            raise CloudApiError(f"HTTP {e.code} for {url}: {detail[:300]}") from e
        except urllib.error.URLError as e:
            raise CloudApiError(f"Could not reach {url}: {e}") from e

    def authenticate_password(self, username, password, project_name, user_domain, project_domain):
        body = json.dumps({
            "auth": {
                "identity": {
                    "methods": ["password"],
                    "password": {
                        "user": {
                            "name": username,
                            "domain": {"name": user_domain},
                            "password": password,
                        }
                    },
                },
                "scope": {
                    "project": {
                        "name": project_name,
                        "domain": {"name": project_domain},
                    }
                },
            }
        }).encode("utf-8")
        self._do_auth(body)

    def authenticate_application_credential(self, app_cred_id, app_cred_secret):
        body = json.dumps({
            "auth": {
                "identity": {
                    "methods": ["application_credential"],
                    "application_credential": {
                        "id": app_cred_id,
                        "secret": app_cred_secret,
                    },
                },
            }
        }).encode("utf-8")
        self._do_auth(body)

    def _do_auth(self, body):
        req = urllib.request.Request(
            f"{self.auth_url}/v3/auth/tokens",
            data=body,
            method="POST",
            headers={"Content-Type": "application/json", "Accept": "application/json"},
        )
        try:
            resp = urllib.request.urlopen(req, timeout=self.timeout, context=self._ssl_context)
            token = resp.headers.get("X-Subject-Token")
            data = json.loads(resp.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            detail = ""
            try:
                detail = e.read().decode("utf-8", errors="replace")
            except Exception:
                pass
            raise CloudApiError(
                f"Keystone authentication failed (HTTP {e.code}): {detail[:300]}"
            ) from e
        except urllib.error.URLError as e:
            raise CloudApiError(f"Could not reach {self.auth_url}: {e}") from e
        if not token:
            raise CloudApiError("Keystone returned no X-Subject-Token header.")
        self.token = token
        self.catalog = data.get("token", {}).get("catalog", [])

    def endpoint(self, service_type, interface="public", region=None):
        for entry in self.catalog:
            if entry.get("type") != service_type:
                continue
            for ep in entry.get("endpoints", []):
                if ep.get("interface") != interface:
                    continue
                if region and ep.get("region") != region:
                    continue
                return ep.get("url", "").rstrip("/")
        return None

    def get(self, url, extra_headers=None):
        headers = {"X-Auth-Token": self.token}
        headers.update(extra_headers or {})
        _, data = self._request(url, headers=headers)
        return data

    def get_paginated(self, url, key, extra_headers=None, max_pages=20):
        """Follows Nova/Cinder/Manila/Neutron-style {"<key>_links": [...]}
        next-page pagination. Most catalogs return everything in one page
        for small-to-medium clouds; this just guards against truncation on
        larger ones."""
        items = []
        next_url = url
        pages = 0
        while next_url and pages < max_pages:
            data = self.get(next_url, extra_headers=extra_headers)
            items.extend(data.get(key, []))
            links = data.get(f"{key}_links", [])
            next_url = None
            for link in links:
                if link.get("rel") == "next":
                    next_url = link.get("href")
            pages += 1
        return items


def build_session(args):
    import os

    auth_url = args.os_auth_url or os.environ.get("OS_AUTH_URL")
    if not auth_url:
        raise CloudApiError(
            "No auth URL. Set OS_AUTH_URL (source your openrc.sh / clouds.yaml env) "
            "or pass --os-auth-url, or use --mock to test without a cloud."
        )
    insecure = args.insecure or os.environ.get("OS_INSECURE") in ("1", "true", "True")
    session = OpenStackSession(auth_url, insecure=insecure)

    app_cred_id = os.environ.get("OS_APPLICATION_CREDENTIAL_ID")
    app_cred_secret = os.environ.get("OS_APPLICATION_CREDENTIAL_SECRET")
    if app_cred_id and app_cred_secret:
        session.authenticate_application_credential(app_cred_id, app_cred_secret)
        return session

    username = os.environ.get("OS_USERNAME")
    password = os.environ.get("OS_PASSWORD")
    project_name = os.environ.get("OS_PROJECT_NAME")
    user_domain = os.environ.get("OS_USER_DOMAIN_NAME", "Default")
    project_domain = os.environ.get("OS_PROJECT_DOMAIN_NAME", "Default")
    if not (username and password and project_name):
        raise CloudApiError(
            "Incomplete credentials. Need either OS_APPLICATION_CREDENTIAL_ID/SECRET, "
            "or OS_USERNAME + OS_PASSWORD + OS_PROJECT_NAME (same as the `openstack` CLI). "
            "Source your openrc.sh / clouds.yaml env first, or use --mock."
        )
    session.authenticate_password(username, password, project_name, user_domain, project_domain)
    return session


# --------------------------------------------------------------------------
# Discovery: each function returns (values: dict, notes: list[str], warnings: list[str])
# `values` keys are wizard input field names (or None if nothing usable found).
# --------------------------------------------------------------------------

def discover_compute(session, interface, region, warnings):
    values, notes = {}, []
    try:
        compute_url = session.endpoint("compute", interface, region)
        if not compute_url:
            warnings.append("Compute (Nova) endpoint not found in service catalog -- skipped.")
            return values, notes
        hypervisors = session.get(f"{compute_url}/os-hypervisors/detail").get("hypervisors", [])
        if hypervisors:
            vcpus = [h.get("vcpus") for h in hypervisors if h.get("vcpus")]
            mem_mb = [h.get("memory_mb") for h in hypervisors if h.get("memory_mb")]
            local_gb = [h.get("local_gb") for h in hypervisors if h.get("local_gb")]
            if vcpus:
                values["nodeCores"] = int(round(statistics.median(vcpus)))
            if mem_mb:
                values["nodeRam"] = int(round(statistics.median(mem_mb) / 1024))
            if local_gb:
                values["nodeDisk"] = int(round(statistics.median(local_gb)))
            notes.append(f"nodeCores/nodeRam/nodeDisk: median across {len(hypervisors)} hypervisor(s) "
                          f"from Nova os-hypervisors/detail.")
            if vcpus and (max(vcpus) - min(vcpus) > 0 or max(mem_mb) - min(mem_mb) > 0):
                warnings.append(
                    f"Compute hosts are heterogeneous (vcpus range {min(vcpus)}-{max(vcpus)}, "
                    f"RAM range {min(mem_mb)}-{max(mem_mb)} MB) -- the wizard models one uniform "
                    f"node spec, so the median was used. Review nodeCores/nodeRam/nodeDisk by hand."
                )
        else:
            warnings.append("Nova returned zero hypervisors (or caller lacks admin rights for os-hypervisors) -- "
                             "nodeCores/nodeRam/nodeDisk left at defaults.")

        servers = session.get_paginated(
            f"{compute_url}/servers/detail?all_tenants=1&limit=1000", "servers",
            extra_headers={"X-OpenStack-Nova-API-Version": "2.47"},
        )
        used_all_tenants = True
        if not servers:
            # Fall back to the caller's own project if all_tenants was refused (non-admin).
            servers = session.get_paginated(
                f"{compute_url}/servers/detail?limit=1000", "servers",
                extra_headers={"X-OpenStack-Nova-API-Version": "2.47"},
            )
            used_all_tenants = False

        if servers:
            values["vmCount"] = len(servers)
            vcpus_list, ram_list, disk_list = [], [], []
            flavor_cache = {}
            for s in servers:
                flavor = s.get("flavor") or {}
                if "vcpus" in flavor and "ram" in flavor:
                    f = flavor
                else:
                    fid = flavor.get("id")
                    if fid:
                        if fid not in flavor_cache:
                            try:
                                flavor_cache[fid] = session.get(f"{compute_url}/flavors/{fid}").get("flavor", {})
                            except CloudApiError:
                                flavor_cache[fid] = {}
                        f = flavor_cache[fid]
                    else:
                        f = {}
                if f.get("vcpus"):
                    vcpus_list.append(f["vcpus"])
                if f.get("ram"):
                    ram_list.append(f["ram"] / 1024.0)
                if f.get("disk"):
                    disk_list.append(f["disk"])
            if vcpus_list:
                values["vmVcpus"] = int(round(statistics.mean(vcpus_list)))
            if ram_list:
                values["vmRam"] = int(round(statistics.mean(ram_list)))
            if disk_list:
                values["vmDisk"] = int(round(statistics.mean(disk_list)))
            scope_note = "across all projects" if used_all_tenants else \
                "in the authenticated project only (all_tenants was refused -- not an admin credential)"
            notes.append(
                f"vmCount={values.get('vmCount')} and vmVcpus/vmRam/vmDisk (mean of in-use flavors) "
                f"from {len(servers)} Nova server(s) {scope_note}."
            )
            if not used_all_tenants:
                warnings.append(
                    "Could not list servers cloud-wide (all_tenants=1 was refused) -- vmCount and the "
                    "average flavor size reflect only the authenticated project, not the whole cloud."
                )
            total = len(servers)
            size = max(50, min(400, int(total * 0.25) or 50))
            values["cspScale"] = "small" if total < 50 else ("large" if total > 800 else "medium")
        else:
            warnings.append("Nova returned zero servers -- vmCount/vmVcpus/vmRam/vmDisk left at defaults.")
    except CloudApiError as e:
        warnings.append(f"Compute (Nova) discovery failed: {e}")
    return values, notes


def discover_overcommit(session, interface, region, warnings):
    """Best-effort: Placement API resource provider inventories carry the
    actual allocation_ratio the scheduler applies, which is the real source
    of truth for cpu/ram overcommit (nova.conf's own default is not queryable
    directly). Needs admin rights; any failure here is silently non-fatal."""
    values, notes = {}, []
    try:
        placement_url = session.endpoint("placement", interface, region)
        if not placement_url:
            return values, notes
        headers = {"OpenStack-API-Version": "placement 1.14"}
        rps = session.get(f"{placement_url}/resource_providers", extra_headers=headers).get(
            "resource_providers", [])
        cpu_ratios, ram_ratios = [], []
        for rp in rps[:50]:  # cap: avoid hammering very large clouds
            try:
                inv = session.get(
                    f"{placement_url}/resource_providers/{rp['uuid']}/inventories",
                    extra_headers=headers,
                ).get("inventories", {})
            except CloudApiError:
                continue
            if "VCPU" in inv and inv["VCPU"].get("allocation_ratio"):
                cpu_ratios.append(inv["VCPU"]["allocation_ratio"])
            if "MEMORY_MB" in inv and inv["MEMORY_MB"].get("allocation_ratio"):
                ram_ratios.append(inv["MEMORY_MB"]["allocation_ratio"])
        if cpu_ratios:
            values["cpuOvercommit"] = round(statistics.median(cpu_ratios), 1)
        if ram_ratios:
            values["ramOvercommit"] = round(statistics.median(ram_ratios), 1)
        if cpu_ratios or ram_ratios:
            notes.append("cpuOvercommit/ramOvercommit: median allocation_ratio across Placement "
                          "resource provider inventories.")
    except CloudApiError as e:
        warnings.append(f"Overcommit ratio discovery via Placement skipped (needs admin rights): {e}")
    return values, notes


def _match_backend(name, patterns):
    if not name:
        return None
    for key, pattern in patterns:
        if pattern.search(name):
            return key
    return None


def discover_cinder(session, interface, region, warnings):
    values, notes = {}, []
    try:
        volume_url = session.endpoint("volumev3", interface, region) or session.endpoint("block-storage", interface, region)
        if not volume_url:
            warnings.append("Block Storage (Cinder) endpoint not found in service catalog -- skipped.")
            return values, notes

        backends = set()
        types_data = session.get(f"{volume_url}/types").get("volume_types", [])
        for t in types_data:
            backend_name = (t.get("extra_specs") or {}).get("volume_backend_name", "") or t.get("name", "")
            matched = _match_backend(backend_name, CINDER_BACKEND_PATTERNS)
            if matched:
                backends.add(matched)
        if backends:
            values["cinderBackends"] = sorted(backends)
            notes.append(f"cinderBackends={sorted(backends)} matched from Cinder volume-type "
                          f"extra_specs/names (pattern match -- verify against your actual vendor).")
        elif types_data:
            warnings.append(
                f"Found {len(types_data)} Cinder volume type(s) but none matched a known vendor "
                f"name pattern -- cinderBackends left at default. Check them manually: "
                f"{[t.get('name') for t in types_data]}"
            )

        volumes = session.get_paginated(f"{volume_url}/volumes/detail?all_tenants=1&limit=1000", "volumes")
        used_all_tenants = True
        if not volumes:
            volumes = session.get_paginated(f"{volume_url}/volumes/detail?limit=1000", "volumes")
            used_all_tenants = False
        if volumes:
            total_gb = sum(v.get("size", 0) for v in volumes)
            values["cinderCapacityTb"] = round(total_gb / 1024.0, 1)
            scope_note = "cloud-wide" if used_all_tenants else "authenticated project only (all_tenants refused)"
            notes.append(f"cinderCapacityTb={values['cinderCapacityTb']} TB: sum of {len(volumes)} "
                          f"Cinder volume size(s), {scope_note}. This is IN-USE capacity today, not a "
                          f"growth target -- raise it deliberately for forward modelling.")
            if not used_all_tenants:
                warnings.append("Cinder capacity reflects only the authenticated project (all_tenants=1 refused).")
    except CloudApiError as e:
        warnings.append(f"Block Storage (Cinder) discovery failed: {e}")
    return values, notes


def discover_manila(session, interface, region, warnings):
    values, notes = {}, []
    try:
        share_url = session.endpoint("sharev2", interface, region) or session.endpoint("share", interface, region)
        if not share_url:
            warnings.append("Shared File System (Manila) endpoint not found in service catalog -- "
                             "this is normal if Manila isn't deployed. manilaCapacityTb/manilaBackends left at defaults.")
            return values, notes

        backends = set()
        dhss_votes = []
        types_data = session.get(f"{share_url}/types").get("share_types", [])
        for t in types_data:
            specs = t.get("extra_specs") or {}
            backend_name = specs.get("share_backend_name", "") or t.get("name", "")
            matched = _match_backend(backend_name, MANILA_BACKEND_PATTERNS)
            if matched:
                backends.add(matched)
            dhss = specs.get("driver_handles_share_servers")
            if dhss is not None:
                dhss_votes.append(str(dhss).lower())
        if backends:
            values["manilaBackends"] = sorted(backends)
            notes.append(f"manilaBackends={sorted(backends)} matched from Manila share-type "
                         f"extra_specs/names (pattern match -- verify against your actual vendor).")
        if dhss_votes:
            values["manilaDhss"] = "true" if dhss_votes.count("true") >= dhss_votes.count("false") else "false"
            notes.append(f"manilaDhss={values['manilaDhss']}: majority value across {len(dhss_votes)} "
                         f"share type(s)' driver_handles_share_servers extra_spec.")

        shares = session.get_paginated(f"{share_url}/shares/detail?all_tenants=1&limit=1000", "shares")
        used_all_tenants = True
        if not shares:
            shares = session.get_paginated(f"{share_url}/shares/detail?limit=1000", "shares")
            used_all_tenants = False
        if shares:
            total_gb = sum(s.get("size", 0) for s in shares)
            values["manilaCapacityTb"] = round(total_gb / 1024.0, 1)
            scope_note = "cloud-wide" if used_all_tenants else "authenticated project only (all_tenants refused)"
            notes.append(f"manilaCapacityTb={values['manilaCapacityTb']} TB: sum of {len(shares)} "
                         f"Manila share size(s), {scope_note}.")
    except CloudApiError as e:
        warnings.append(f"Shared File System (Manila) discovery failed: {e}")
    return values, notes


def discover_network(session, interface, region, warnings):
    values, notes = {}, []
    try:
        network_url = session.endpoint("network", interface, region)
        if not network_url:
            warnings.append("Networking (Neutron) endpoint not found in service catalog -- skipped.")
            return values, notes

        agents = session.get(f"{network_url}/v2.0/agents").get("agents", [])
        agent_types = " ".join((a.get("agent_type") or "") for a in agents).lower()
        if "ovn" in agent_types:
            values["neutronDriver"] = "ovn"
            values["tenantTunnelProto"] = "geneve"
            notes.append("neutronDriver=ovn: an OVN agent is present in Neutron's agent list.")
        elif "open vswitch" in agent_types:
            values["neutronDriver"] = "ml2ovs"
            values["tenantTunnelProto"] = "vxlan"
            notes.append("neutronDriver=ml2ovs: Open vSwitch agents present, no OVN agent found.")
        else:
            warnings.append("Could not identify ML2/OVN vs ML2/OVS from Neutron's agent list "
                             "(caller may lack rights to list agents) -- neutronDriver left at default.")

        networks = session.get(f"{network_url}/v2.0/networks").get("networks", [])
        subnets = session.get(f"{network_url}/v2.0/subnets").get("subnets", [])
        subnets_by_network = {}
        for sn in subnets:
            subnets_by_network.setdefault(sn.get("network_id"), []).append(sn)

        ext_net = next((n for n in networks if n.get("router:external")), None)
        if ext_net:
            ext_subnets = subnets_by_network.get(ext_net.get("id"), [])
            if ext_subnets and ext_subnets[0].get("cidr"):
                values["extSubnet"] = ext_subnets[0]["cidr"]
                notes.append(f"extSubnet={values['extSubnet']}: subnet of the network flagged "
                             f"router:external=true ('{ext_net.get('name')}').")

        name_hints = {
            "mgmtSubnet": re.compile(r"mgmt|management|admin", re.I),
            "storageFrontSubnet": re.compile(r"storage|ceph|san", re.I),
            "tenantSubnet": re.compile(r"tenant|overlay|project", re.I),
        }
        matched_any = False
        for field, pattern in name_hints.items():
            for net in networks:
                if net.get("router:external"):
                    continue
                if pattern.search(net.get("name") or ""):
                    net_subnets = subnets_by_network.get(net.get("id"), [])
                    if net_subnets and net_subnets[0].get("cidr"):
                        values[field] = net_subnets[0]["cidr"]
                        matched_any = True
                        break
        if matched_any:
            notes.append("Some internal subnet roles (management/storage/tenant) were guessed from "
                         "Neutron network naming -- this is a weak heuristic, verify every subnet by hand.")
        warnings.append(
            "Internal subnet-to-role mapping (API/internal/storage-backend VLANs) is NOT attempted: "
            "this wizard's fixed 6-VLAN convention is its own design, not a naming standard real "
            "clouds follow. Only the external network (if flagged router:external) and loosely "
            "name-matched management/storage/tenant networks were guessed. Review every *Subnet "
            "field against your actual network layout before treating the output as authoritative."
        )
    except CloudApiError as e:
        warnings.append(f"Networking (Neutron) discovery failed: {e}")
    return values, notes


# --------------------------------------------------------------------------
# --mock: synthetic discovery output with no network calls at all, so the
# field-mapping/report logic can be exercised without a live cloud.
# --------------------------------------------------------------------------

def build_mock_discovery():
    values = {
        "nodeCores": 64, "nodeRam": 512, "nodeDisk": 2000,
        "vmCount": 187, "vmVcpus": 6, "vmRam": 24, "vmDisk": 80, "cspScale": "medium",
        "cpuOvercommit": 4.0, "ramOvercommit": 1.0,
        "cinderBackends": ["ceph", "netapp"], "cinderCapacityTb": 84.5,
        "manilaBackends": ["cephfs_native"], "manilaDhss": "false", "manilaCapacityTb": 12.0,
        "neutronDriver": "ovn", "tenantTunnelProto": "geneve",
        "extSubnet": "198.51.100.0/24",
    }
    notes = [
        "[MOCK] nodeCores/nodeRam/nodeDisk: median across 14 synthetic hypervisors.",
        "[MOCK] vmCount=187, vmVcpus/vmRam/vmDisk: mean of synthetic in-use flavors, cloud-wide.",
        "[MOCK] cpuOvercommit/ramOvercommit: median allocation_ratio across synthetic Placement RPs.",
        "[MOCK] cinderBackends=['ceph', 'netapp'] matched from synthetic volume-type extra_specs.",
        "[MOCK] cinderCapacityTb=84.5 TB: sum of synthetic volume sizes, cloud-wide.",
        "[MOCK] manilaBackends=['cephfs_native'], manilaDhss=false, manilaCapacityTb=12.0 TB (synthetic).",
        "[MOCK] neutronDriver=ovn: synthetic OVN agent present.",
        "[MOCK] extSubnet=198.51.100.0/24: synthetic router:external network's subnet.",
    ]
    warnings = [
        "[MOCK MODE] No cloud was actually contacted -- this is built-in sample data, "
        "only useful for checking this script's own field-mapping logic.",
        "Internal subnet-to-role mapping was not attempted (see script docstring) -- "
        "mgmt/API/storage-backend/tenant subnets left at wizard defaults.",
    ]
    return values, notes, warnings


# --------------------------------------------------------------------------
# Merge + output
# --------------------------------------------------------------------------

def merge_and_build(discovered, cli_overrides):
    inputs = json.loads(json.dumps(WIZARD_DEFAULT_INPUTS))  # deep copy
    inputs.update(discovered)
    inputs.update({k: v for k, v in cli_overrides.items() if v is not None})
    return inputs


def slugify(name):
    return re.sub(r"[^a-z0-9_-]", "_", name.lower()) or "openstack"


def write_outputs(inputs, all_notes, all_warnings, out_dir, slug):
    out_dir.mkdir(parents=True, exist_ok=True)
    json_path = out_dir / f"{slug}_imported_config.json"
    report_path = out_dir / f"{slug}_import_report.md"

    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(inputs, f, indent=2)
        f.write("\n")

    lines = [
        f"# Import report: {inputs.get('projectName')}",
        "",
        "Generated by `export_from_cloud.py`. Read this before trusting the imported "
        "config -- it lists exactly what was discovered from the live API vs. what was "
        "left at the wizard's own defaults (or a CLI override).",
        "",
        "## Fields populated from live discovery",
        "",
    ]
    lines += [f"- {n}" for n in all_notes] if all_notes else ["- (none -- nothing could be discovered; see warnings)"]
    lines += [
        "",
        "## Always manual (not detectable via any OpenStack API)",
        "",
        "- `openstackDistro`, `openstackVersion` -- no API reports a deployment's release "
        "codename or orchestration tooling; pass `--os-distro` / `--os-version` if known.",
        "- `industry`, `compliance` -- business/regulatory decisions, not infrastructure state.",
        "- Ceph's physical OSD layout (`osdSizeTb`, `osdPerNode`, `osdMedia`, `replicaFactor`) -- "
        "this is Ceph's own admin API/CLI territory, not an OpenStack API.",
        "- Barbican, StorageGrid, and the Kubernetes-overlay sizing block -- optional add-ons "
        "this script does not probe for.",
        "",
        "## Warnings / things to verify by hand",
        "",
    ]
    lines += [f"- {w}" for w in all_warnings] if all_warnings else ["- (none)"]
    lines += [
        "",
        "## Next step",
        "",
        f"Open the wizard, go to Step 1, click **Load Config**, and select "
        f"`{json_path.name}`. Everything not listed above as discovered keeps the "
        f"wizard's normal default -- this is a starting point for modelling changes "
        f"against the as-built cloud, not a certified as-built record.",
        "",
    ]
    with open(report_path, "w", encoding="utf-8") as f:
        f.write("\n".join(lines) + "\n")

    return json_path, report_path


def main():
    parser = argparse.ArgumentParser(
        description="Export a live OpenStack cloud's inventory into this tool's Load-Config JSON format.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    parser.add_argument("--project-name", default=None, help="projectName to stamp into the output (default: derived from the cloud).")
    parser.add_argument("--os-auth-url", default=None, help="Override OS_AUTH_URL.")
    parser.add_argument("--os-interface", default=None, help="Catalog interface to use: public (default), internal, or admin.")
    parser.add_argument("--os-region", default=None, help="Catalog region, if the cloud has more than one.")
    parser.add_argument("--os-distro", default=None, choices=["kolla", "juju", "rhosp"], help="Not auto-detectable -- set it if known.")
    parser.add_argument("--os-version", default=None, help="Not auto-detectable -- set it if known, e.g. 2026.2.")
    parser.add_argument("--industry", default=None, choices=["general", "financial", "healthcare", "telecom", "sovereign"])
    parser.add_argument("--insecure", action="store_true", help="Skip TLS certificate verification (self-signed lab clouds). Same as OS_INSECURE=1.")
    parser.add_argument("--out-dir", default=str(SCRIPT_DIR), help="Where to write the output files (default: this script's directory).")
    parser.add_argument("--mock", action="store_true", help="Skip all network calls; use built-in sample data to test the field mapping.")
    args = parser.parse_args()

    interface = args.os_interface or "public"
    warnings = []
    notes = []
    discovered = {}

    if args.mock:
        print("Running in --mock mode: no cloud will be contacted.")
        discovered, notes, warnings = build_mock_discovery()
        project_name = args.project_name or "Mock Demo Cloud"
    else:
        try:
            session = build_session(args)
        except CloudApiError as e:
            print(f"ERROR: {e}")
            sys.exit(1)
        print(f"Authenticated against {args.os_auth_url or '(OS_AUTH_URL)'}. Discovering inventory...")

        for label, fn in (
            ("compute", lambda: discover_compute(session, interface, args.os_region, warnings)),
            ("overcommit", lambda: discover_overcommit(session, interface, args.os_region, warnings)),
            ("cinder", lambda: discover_cinder(session, interface, args.os_region, warnings)),
            ("manila", lambda: discover_manila(session, interface, args.os_region, warnings)),
            ("network", lambda: discover_network(session, interface, args.os_region, warnings)),
        ):
            print(f"  - {label} ...")
            values, these_notes = fn()
            discovered.update(values)
            notes.extend(these_notes)

        project_name = args.project_name or "Imported OpenStack Cloud"

    cli_overrides = {
        "projectName": project_name,
        "openstackDistro": args.os_distro,
        "openstackVersion": args.os_version,
        "industry": args.industry,
    }
    inputs = merge_and_build(discovered, cli_overrides)

    out_dir = Path(args.out_dir)
    slug = slugify(project_name)
    json_path, report_path = write_outputs(inputs, notes, warnings, out_dir, slug)

    print(f"\nWrote {json_path}")
    print(f"Wrote {report_path}")
    print(f"\n{len(notes)} field group(s) populated from discovery, {len(warnings)} warning(s) -- read the report before trusting this.")
    print("Load it into the wizard via Step 1's \"Load Config\" button.")


if __name__ == "__main__":
    main()
