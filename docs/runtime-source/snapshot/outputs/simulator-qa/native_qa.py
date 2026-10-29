"""Docker-free local Ubuntu QA. Does not connect to TerraSatch or radio devices."""
import argparse
import datetime as dt
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import time

REVISION = "d6f12ad1c4f70ad3230afd7d86e971421e02fef4"
ROOT = Path(__file__).resolve().parent

def save(path, data):
    path.write_text(json.dumps(data, indent=2, allow_nan=False))

def check_host():
    if sys.platform != "linux" or os.getuid() == 0:
        raise RuntimeError("Run as your normal user in the local Ubuntu/WSL terminal, not Windows Git Bash or root.")
    release = {}
    for line in Path("/etc/os-release").read_text().splitlines():
        key, _, value = line.partition("=")
        release[key] = value.strip('"')
    if release.get("ID") != "ubuntu" or release.get("VERSION_ID") not in {"22.04", "24.04"}:
        raise RuntimeError("This launcher supports local Ubuntu 22.04 or 24.04 only.")
    if Path("/proc/1/comm").read_text().strip() != "systemd":
        raise RuntimeError("Ubuntu needs systemd as PID 1 for isolated networking/resource limits. No WSL settings were changed.")
    if not Path("/sys/fs/cgroup/cgroup.controllers").exists():
        raise RuntimeError("cgroup v2 is required for aggregate CPU/RAM limits.")
    for command in ("sudo", "systemd-run", "systemctl", "git", "python3"):
        if not shutil.which(command):
            raise RuntimeError("Missing local prerequisite: " + command)
    return release

def properties(work):
    return [
        "-p", "User=" + str(os.getuid()), "-p", "Group=" + str(os.getgid()),
        "-p", "PrivateNetwork=yes", "-p", "PrivateDevices=yes",
        "-p", "DevicePolicy=closed", "-p", "NoNewPrivileges=yes",
        "-p", "ProtectSystem=strict", "-p", "ProtectHome=yes",
        "-p", "ReadWritePaths=" + str(work),
        "-p", "TemporaryFileSystem=/tmp:rw,size=512M,mode=1777",
        "-p", "CPUQuota=400%", "-p", "MemoryMax=8G",
        "-p", "MemorySwapMax=0", "-p", "TasksMax=256",
        "-p", "RuntimeMaxSec=270", "-p", "TimeoutStopSec=10",
        "-p", "KillMode=control-group",
        "-p", "MemoryAccounting=yes", "-p", "CPUAccounting=yes",
    ]

def run_logged(command, evidence, name, env=None):
    print("Stage: " + name, flush=True)
    with (evidence / (name + ".log")).open("w") as log:
        process = subprocess.Popen(command, env=env, stdout=subprocess.PIPE,
                                   stderr=subprocess.STDOUT, text=True)
        try:
            for line in process.stdout:
                print(line, end="", flush=True)
                log.write(line)
                log.flush()
            code = process.wait()
        except BaseException:
            process.terminate()
            try:
                process.wait(timeout=10)
            except subprocess.TimeoutExpired:
                process.kill()
            raise
        if code:
            raise RuntimeError(name + " failed (exit " + str(code) + "); see " + str(log.name))

def verify_evidence(evidence):
    result = json.loads((evidence / "result.json").read_text())
    if result.get("status") != "passed" or result.get("px4_revision") != REVISION or result.get("source") != "PX4/Gazebo SITL":
        raise RuntimeError("No passing result from the pinned genuine simulator.")
    for flag in ("launch_accepted", "airborne_observed", "landing_observed", "disarmed_observed"):
        if result.get(flag) is not True:
            raise RuntimeError("Missing observed flight state: " + flag)
    rows = [json.loads(line) for line in (evidence / "telemetry.jsonl").read_text().splitlines()]
    if len(rows) < 3 or not any(row.get("connected") is True and row.get("stale") is False
                               and row.get("in_air") is True
                               and isinstance(row.get("relative_altitude_m"), (int, float))
                               and row["relative_altitude_m"] >= 3 for row in rows):
        raise RuntimeError("Retained telemetry does not verify airborne altitude.")

def main():
    from publish_live import publish_live
    parser = argparse.ArgumentParser()
    parser.add_argument("--setup", action="store_true", help="Install official Ubuntu dependencies and build the pinned simulator before QA.")
    args = parser.parse_args()
    stamp = dt.datetime.now(dt.timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
    evidence = ROOT / ("native-evidence-" + stamp)
    evidence.mkdir()
    state = {"status": "running", "stage": "preflight", "runtime": "native Ubuntu/systemd; no Docker",
             "px4_revision": REVISION, "flight_verified": False}
    active_unit = None
    work = Path("/var/tmp") / ("terrasatch-native-qa-" + str(os.getuid()))
    try:
        save(evidence / "launcher-status.json", state)
        release = check_host()
        if work.is_symlink():
            raise RuntimeError("Workspace must not be a symlink.")
        work.mkdir(mode=0o700, exist_ok=True)
        if work.stat().st_uid != os.getuid():
            raise RuntimeError("Workspace must be owned by this user.")
        work.chmod(0o700)
        host = {"distribution": release["ID"], "version": release["VERSION_ID"],
                "workspace": str(work), "cpu_count": os.cpu_count(),
                "memory_total_bytes": os.sysconf("SC_PAGE_SIZE") * os.sysconf("SC_PHYS_PAGES"),
                "free_disk_bytes": shutil.disk_usage(work).free}
        save(evidence / "host.json", host)
        if host["memory_total_bytes"] < 6 * 1024**3:
            raise RuntimeError("This conservative QA profile requires at least 6 GiB visible memory; no settings changed.")
        if host["free_disk_bytes"] < 12 * 1024**3:
            raise RuntimeError("This build profile requires 12 GiB free disk headroom; actual usage is measured separately.")
        print("Local development Ubuntu only. sudo authorizes an isolated transient service"
              + (" and official PX4 dependency installation." if args.setup else "."), flush=True)
        subprocess.run(["sudo", "-v"], check=True)
        # Verify isolation before downloading/building a large toolchain. No fallback to an unisolated runtime.
        preflight_unit = "terrasatch-preflight-" + stamp.lower()
        run_logged(["sudo", "systemd-run", "--unit=" + preflight_unit, "--wait", "--pipe", "--collect"]
                   + properties(work) + ["/usr/bin/true"], evidence, "isolation-preflight")
        px4 = work / "PX4-Autopilot"
        env = {**os.environ, "HOME": str(work / "home")}
        env["PATH"] = str(work / "home/.local/bin") + os.pathsep + os.environ.get("PATH", "")
        Path(env["HOME"]).mkdir(exist_ok=True)
        if args.setup:
            state["stage"] = "setup"
            save(evidence / "launcher-status.json", state)
            run_logged(["sudo", "apt-get", "update"], evidence, "apt-update")
            run_logged(["sudo", "apt-get", "install", "-y", "python3-venv", "ca-certificates", "lsb-release", "wget", "gnupg"], evidence, "apt-prerequisites")
            if not px4.exists():
                run_logged(["git", "clone", "--filter=blob:none", "--no-checkout",
                            "https://github.com/PX4/PX4-Autopilot.git", str(px4)], evidence, "clone", env)
                run_logged(["git", "-C", str(px4), "checkout", "--detach", REVISION], evidence, "checkout", env)
            actual = subprocess.check_output(["git", "-C", str(px4), "rev-parse", "HEAD"], text=True).strip()
            if actual != REVISION:
                raise RuntimeError("Existing workspace has a different checkout; it was not reset.")
            if subprocess.check_output(["git", "-C", str(px4), "status", "--porcelain", "--untracked-files=no"], text=True).strip():
                raise RuntimeError("Existing checkout has tracked edits; it was not reset.")
            run_logged(["git", "-C", str(px4), "submodule", "update", "--init", "--recursive", "--depth", "1"], evidence, "submodules", env)
            run_logged(["bash", str(px4 / "Tools/setup/ubuntu.sh"), "--no-nuttx"], evidence, "official-ubuntu-setup", env)
            run_logged(["make", "-C", str(px4), "-j2", "px4_sitl_default"], evidence, "build", env)
            run_logged(["python3", "-m", "venv", str(work / "venv")], evidence, "venv", env)
            run_logged([str(work / "venv/bin/pip"), "install", "mavsdk==3.17.4"], evidence, "mavsdk", env)
        if not (px4 / "build/px4_sitl_default/bin/px4").exists() or not (work / "venv/bin/python").exists():
            raise RuntimeError("Simulator not installed. Run this launcher once with --setup.")
        if subprocess.check_output(["git", "-C", str(px4), "rev-parse", "HEAD"], text=True).strip() != REVISION:
            raise RuntimeError("Runtime checkout differs from the pinned revision.")
        if subprocess.check_output(["git", "-C", str(px4), "status", "--porcelain", "--untracked-files=no"], text=True).strip():
            raise RuntimeError("Runtime checkout has tracked changes; it was not reset.")
        # Copy only reviewed local QA source; native paths are fixed by this wrapper.
        shutil.copyfile(ROOT / "probe.py", work / "probe.py")
        run_evidence = work / ("evidence-" + stamp)
        run_evidence.mkdir()
        print("Live flight view: http://127.0.0.1:3186/ → Drones & payloads → Watch local PX4", flush=True)
        state["stage"] = "flight"
        save(evidence / "launcher-status.json", state)
        active_unit = "terrasatch-sitl-" + stamp.lower()
        command = ["sudo", "systemd-run", "--unit=" + active_unit, "--wait", "--pipe", "--collect"]
        command += properties(work)
        command += ["--setenv=HOME=" + env["HOME"], "--setenv=PATH=" + env["PATH"],
                    "--setenv=TERRASATCH_QA_NATIVE=1",
                    "--setenv=TERRASATCH_QA_PX4_ROOT=" + str(px4),
                    "--setenv=TERRASATCH_QA_EVIDENCE=" + str(run_evidence),
                    str(work / "venv/bin/python"), str(work / "probe.py")]
        with (evidence / "runner.log").open("w") as log, (evidence / "resources.jsonl").open("w") as samples:
            process = subprocess.Popen(command, stdout=log, stderr=subprocess.STDOUT)
            try:
                while process.poll() is None:
                    publish_live(ROOT / "live-flight.json", evidence, run_evidence, live=True)
                    query = subprocess.run(["systemctl", "show", active_unit,
                                            "-p", "MemoryCurrent", "-p", "MemoryPeak",
                                            "-p", "CPUUsageNSec", "-p", "TasksCurrent"],
                                           capture_output=True, text=True, timeout=5)
                    values = {}
                    for line in query.stdout.splitlines():
                        key, _, value = line.partition("=")
                        values[key] = int(value) if value.isdigit() and value != "18446744073709551615" else None
                    if query.returncode == 0 and any(value is not None for value in values.values()):
                        samples.write(json.dumps({"sampled_at": dt.datetime.now(dt.timezone.utc).isoformat(), **values}) + "\n")
                        samples.flush()
                    time.sleep(1)
                code = process.wait()
            finally:
                subprocess.run(["sudo", "-n", "systemctl", "stop", active_unit],
                               stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=20, check=False)
                active_unit = None
                for source in run_evidence.iterdir():
                    if source.is_file():
                        shutil.copyfile(source, evidence / source.name)
            publish_live(ROOT / "live-flight.json", evidence, run_evidence, live=False)
            if code:
                raise RuntimeError("Native SITL exited " + str(code) + "; see runner.log and sitl.log.")
        verify_evidence(evidence)
        state.update(status="passed", flight_verified=True)
    except BaseException as error:
        state.update(status="failed", error=type(error).__name__ + ": " + str(error))
        print(state["error"], file=sys.stderr, flush=True)
    finally:
        if active_unit:
            subprocess.run(["sudo", "-n", "systemctl", "stop", active_unit], check=False, timeout=20)
        state["finished_at"] = dt.datetime.now(dt.timezone.utc).isoformat()
        save(evidence / "launcher-status.json", state)
        print("Evidence: " + str(evidence), flush=True)
    return 0 if state["flight_verified"] else 1

if __name__ == "__main__":
    raise SystemExit(main())
