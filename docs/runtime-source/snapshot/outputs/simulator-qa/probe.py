"""Real headless SITL smoke test. Never imports TerraSatch API/Edge or accepts an endpoint."""
import asyncio
import contextlib
import json
import math
import os
import socket
from pathlib import Path
import signal
import subprocess
import time
from datetime import datetime, timezone

PX4_ROOT = Path("/opt/px4")
OUT = Path("/evidence")
if os.environ.get("TERRASATCH_QA_NATIVE") == "1":
    native_root = Path("/var/tmp") / ("terrasatch-native-qa-" + str(os.getuid()))
    PX4_ROOT = Path(os.environ["TERRASATCH_QA_PX4_ROOT"]).resolve()
    OUT = Path(os.environ["TERRASATCH_QA_EVIDENCE"]).resolve()
    if PX4_ROOT != native_root / "PX4-Autopilot" or OUT.parent != native_root or not OUT.name.startswith("evidence-"):
        raise RuntimeError("Unexpected native QA paths")
    if os.getuid() == 0 or {name for _, name in socket.if_nameindex()} != {"lo"}:
        raise RuntimeError("Native QA requires a non-root process with loopback-only network isolation")
REVISION = "d6f12ad1c4f70ad3230afd7d86e971421e02fef4"
def utc():
    return datetime.now(timezone.utc).isoformat()
def finite(value):
    return value if isinstance(value, (int, float)) and math.isfinite(value) else None

def battery_fraction(percent):
    value = finite(percent)
    return value / 100 if value is not None and 0 <= value <= 100 else None

def telemetry_row(latest, process_alive):
    row = {key: value for key, value in latest.items() if key != "position_monotonic"}
    row["sampled_at"] = utc()
    row["stale"] = time.monotonic() - latest.get("position_monotonic", 0) > 3
    row["connected"] = bool(latest.get("connected")) and not row["stale"] and process_alive
    return row

async def run():
    from mavsdk import System
    OUT.mkdir(exist_ok=True)
    result = {"status": "failed", "source": "PX4/Gazebo SITL", "started_at": utc(),
              "px4_revision": REVISION, "telemetry_sample_hz": 1,
              "launch_accepted": False, "airborne_observed": False,
              "landing_observed": False, "disarmed_observed": False}
    actual = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=PX4_ROOT, text=True).strip()
    if actual != REVISION:
        raise RuntimeError("PX4 checkout does not match the pinned revision")
    log = (OUT / "sitl.log").open("w")
    env = {**os.environ, "HEADLESS": "1", "PX4_SIM_SPEED_FACTOR": "1",
           "GZ_PARTITION": "terrasatch-isolated-qa"}
    process = subprocess.Popen(["make", "px4_sitl", "gz_x500"], cwd=PX4_ROOT,
                               env=env, stdout=log, stderr=subprocess.STDOUT,
                               start_new_session=True)
    tasks = []
    latest = {}
    observed = {"airborne": False, "landed": False, "armed": None}
    maximum_altitude = None
    drone = None
    try:
        # The only transport is this isolated runtime's loopback; no caller endpoint.
        drone = System()
        await drone.connect(system_address="udpin://127.0.0.1:14540")
        async def connection():
            async for value in drone.core.connection_state():
                latest["connected"] = value.is_connected
        async def position():
            async for value in drone.telemetry.position():
                latest.update(latitude_deg=finite(value.latitude_deg),
                              longitude_deg=finite(value.longitude_deg),
                              relative_altitude_m=finite(value.relative_altitude_m),
                              position_monotonic=time.monotonic())
        async def velocity():
            async for value in drone.telemetry.velocity_ned():
                north, east = finite(value.north_m_s), finite(value.east_m_s)
                latest["ground_speed_m_s"] = math.hypot(north, east) if north is not None and east is not None else None
        async def battery():
            async for value in drone.telemetry.battery():
                latest["battery_remaining_fraction"] = battery_fraction(value.remaining_percent)
        async def flight():
            async for value in drone.telemetry.flight_mode():
                latest["flight_mode"] = str(value)
        async def in_air():
            async for value in drone.telemetry.in_air():
                latest["in_air"] = value
                if value:
                    observed["airborne"] = True
                elif observed["airborne"]:
                    observed["landed"] = True
        async def armed():
            async for value in drone.telemetry.armed():
                observed["armed"] = value
                latest["armed"] = value
        async def sample():
            nonlocal maximum_altitude
            with (OUT / "telemetry.jsonl").open("w") as stream:
                for _ in range(240):
                    row = telemetry_row(latest, process.poll() is None)
                    altitude = row.get("relative_altitude_m")
                    if altitude is not None:
                        maximum_altitude = max(altitude, maximum_altitude if maximum_altitude is not None else altitude)
                    stream.write(json.dumps(row, allow_nan=False) + "\n")
                    stream.flush()
                    await asyncio.sleep(1)
        tasks = [asyncio.create_task(fn()) for fn in [connection, position, velocity, battery, flight, in_air, armed, sample]]
        async def healthy():
            async for value in drone.telemetry.health():
                if process.poll() is not None:
                    raise RuntimeError("Owned PX4 process exited")
                if value.is_global_position_ok and value.is_home_position_ok and value.is_armable:
                    return
        await asyncio.wait_for(healthy(), 100)
        await drone.telemetry.set_rate_position(1)
        await drone.telemetry.set_rate_velocity_ned(1)
        await drone.telemetry.set_rate_battery(1)
        await drone.action.set_takeoff_altitude(5)
        await drone.action.arm()
        await drone.action.takeoff()
        result["launch_accepted"] = True
        async def wait_for(predicate, seconds):
            async def observe():
                while not predicate():
                    if process.poll() is not None or not latest.get("connected"):
                        raise RuntimeError("SITL disconnected; result is unknown")
                    await asyncio.sleep(0.25)
            await asyncio.wait_for(observe(), seconds)
        await wait_for(lambda: observed["airborne"] and latest.get("relative_altitude_m", -1) >= 3, 45)
        await asyncio.sleep(5)
        await drone.action.land()
        await wait_for(lambda: observed["landed"] and observed["armed"] is False, 70)
        result["status"] = "passed"
    except Exception as error:
        result["error"] = type(error).__name__ + ": " + str(error)[:500]
        if drone is not None and latest.get("connected") and observed["armed"]:
            with contextlib.suppress(Exception):
                await asyncio.wait_for(drone.action.land(), 5)
    finally:
        result.update(finished_at=utc(), airborne_observed=observed["airborne"],
                      landing_observed=observed["landed"], disarmed_observed=observed["armed"] is False,
                      max_observed_relative_altitude_m=maximum_altitude)
        for task in tasks:
            task.cancel()
        await asyncio.gather(*tasks, return_exceptions=True)
        # Retain the terminal observed state even if it falls between 1 Hz samples.
        if latest:
            with (OUT / "telemetry.jsonl").open("a") as stream:
                stream.write(json.dumps(telemetry_row(latest, process.poll() is None), allow_nan=False) + "\n")
        (OUT / "result.json").write_text(json.dumps(result, indent=2, allow_nan=False))
        if process.poll() is None:
            os.killpg(process.pid, signal.SIGTERM)
            try:
                await asyncio.to_thread(process.wait, 8)
            except subprocess.TimeoutExpired:
                os.killpg(process.pid, signal.SIGKILL)
        log.close()
    return result["status"] == "passed"

if __name__ == "__main__":
    passed = False
    try:
        passed = asyncio.run(asyncio.wait_for(run(), 240))
    finally:
        print("SITL QA " + ("PASSED" if passed else "FAILED"), flush=True)
    raise SystemExit(0 if passed else 1)
