#!/usr/bin/env python3
"""
check_for_updates.py

Refreshes data/versions.json -- the version/compliance/storage-driver reference
manifest read by the "Check for Updates" button in the OpenStack Sizing tool.

Why this exists: the tool itself is designed for dark-site/air-gapped use, so it
never makes background network calls. This script is the "local-helper" side of
that split (same pattern as NetAppModeler's Check for Updates helper) -- it does
the actual internet fetch on a machine that HAS connectivity, and drops the result
as a local file. Air-gapped environments can then have data/versions.json copied
in manually (sneakernet), or run the tool's in-app "Check for Updates" button
directly if that specific environment does have outbound access to MANIFEST_URL.

Usage (on demand):
    python check_for_updates.py

Usage (scheduled scan):
    Windows Task Scheduler (run daily at 6am, from this directory):
        schtasks /create /tn "OpenStackTool-CheckForUpdates" /tr "python \"%CD%\\check_for_updates.py\"" /sc daily /st 06:00

    cron (Linux/Mac, daily at 6am):
        0 6 * * *  cd /path/to/Openstack && python3 check_for_updates.py >> update_check.log 2>&1

After refreshing data/versions.json, re-run `python bundle.py` if you want the
change baked into openstack_design_tool_standalone.html as well (the modular
index.html build picks up data/versions.json directly on next page load, no
rebuild needed).
"""

import json
import sys
import urllib.request
import urllib.error
from pathlib import Path

MANIFEST_URL = "https://raw.githubusercontent.com/ebeauzec/OpenStack/main/data/versions.json"
LOCAL_MANIFEST_PATH = Path(__file__).resolve().parent / "data" / "versions.json"
REQUEST_TIMEOUT_SECONDS = 15


def load_local_manifest():
    if not LOCAL_MANIFEST_PATH.exists():
        return None
    try:
        with open(LOCAL_MANIFEST_PATH, "r", encoding="utf-8") as f:
            return json.load(f)
    except (OSError, json.JSONDecodeError):
        return None


def fetch_remote_manifest(url):
    req = urllib.request.Request(url, headers={"User-Agent": "openstack-sizing-tool-update-check"})
    with urllib.request.urlopen(req, timeout=REQUEST_TIMEOUT_SECONDS) as resp:
        if resp.status != 200:
            raise RuntimeError(f"HTTP {resp.status}")
        body = resp.read().decode("utf-8")
    data = json.loads(body)
    if not isinstance(data, dict) or "manifestVersion" not in data:
        raise ValueError("Fetched content does not look like a versions.json manifest (missing manifestVersion).")
    return data


def summarize_changes(old_manifest, new_manifest):
    changes = []
    old_latest = (old_manifest or {}).get("openstack", {}).get("latest")
    new_latest = new_manifest.get("openstack", {}).get("latest")
    if old_latest != new_latest:
        changes.append(f"OpenStack latest release: {old_latest or '(none)'} -> {new_latest}")

    old_rhosp = (old_manifest or {}).get("redhat", {}).get("current")
    new_rhosp = new_manifest.get("redhat", {}).get("current")
    if old_rhosp != new_rhosp:
        changes.append(f"Red Hat OpenStack current: {old_rhosp or '(none)'} -> {new_rhosp}")

    old_gen = (old_manifest or {}).get("generatedAt")
    new_gen = new_manifest.get("generatedAt")
    if old_gen != new_gen:
        changes.append(f"Manifest generatedAt: {old_gen or '(none)'} -> {new_gen}")

    return changes


def main():
    print(f"Fetching {MANIFEST_URL} ...")
    try:
        remote_manifest = fetch_remote_manifest(MANIFEST_URL)
    except urllib.error.URLError as e:
        print(f"ERROR: could not reach update source ({e}).")
        print("This is expected if this machine is offline/air-gapped. No local file was changed.")
        sys.exit(1)
    except (RuntimeError, ValueError, json.JSONDecodeError) as e:
        print(f"ERROR: fetched content was invalid ({e}). No local file was changed.")
        sys.exit(1)

    local_manifest = load_local_manifest()
    changes = summarize_changes(local_manifest, remote_manifest)

    LOCAL_MANIFEST_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(LOCAL_MANIFEST_PATH, "w", encoding="utf-8") as f:
        json.dump(remote_manifest, f, indent=2)
        f.write("\n")

    print(f"Wrote {LOCAL_MANIFEST_PATH}")
    if changes:
        print("Changes detected:")
        for c in changes:
            print(f"  - {c}")
        print("Run `python bundle.py` to bake this into the standalone build.")
    else:
        print("No changes from the previously stored local manifest.")


if __name__ == "__main__":
    main()
