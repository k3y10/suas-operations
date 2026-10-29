"""Isolated reusable PX4 worker. Start once per bounded lease; never invokes make."""
import asyncio
from collections import deque
import contextlib
import datetime as dt
import json
import math
import os
from pathlib import Path
import signal
import subprocess
import sys
import time
from mission_adapter import content_hash, distance, mission_items, validate, utc
from probe import REVISION, battery_fraction, finite

def atomic(path,value):
    temporary=path.with_suffix(".tmp")
    temporary.write_text(json.dumps(value,allow_nan=False))
    temporary.replace(path)

def freeze_mission(directory,mid):
    """Keep bounded genuine samples and coverage after the live ring buffer advances."""
    from uuid import UUID
    if str(UUID(mid))!=mid:raise ValueError('Invalid mission identity')
    destination=directory/('mission-'+mid+'.json')
    if destination.exists():return
    runtime=json.loads((directory/'state.json').read_text())
    if runtime['missions'][mid]['state'] not in {'completed','failed','unknown','canceled','superseded'}:
        raise ValueError('Only terminal mission evidence can be captured')
    snapshot={**runtime,'packet':{**runtime['packet'],'mode':'recorded','connected':False,'stale':True}}
    atomic(destination,snapshot)

def runtime_environment(px4,home,partition):
    build=px4/"build/px4_sitl_default"
    candidates=[build/"rootfs/gz_env.sh",build/"gz_env.sh"]
    script=next((p for p in candidates if p.is_file()),None)
    if script is None:raise RuntimeError("Built Gazebo runtime environment is missing; run one-time setup")
    output=subprocess.check_output(["bash","-c",'set -a; . "$1"; env -0',"terrasatch",str(script)])
    allowed={}
    for entry in output.split(b"\0"):
        key,_,value=entry.partition(b"=")
        name=key.decode(errors="ignore")
        if name.startswith(("GZ_","PX4_GZ_")) or name=="LD_LIBRARY_PATH":
            allowed[name]=value.decode()
    env={**os.environ,**allowed,"HEADLESS":"1","PX4_SIM_SPEED_FACTOR":"1",
         "PX4_SIM_MODEL":"gz_x500","PX4_SYS_AUTOSTART":"4001","PX4_GZ_STANDALONE":"1",
         "PX4_GZ_WORLD":"terrasatch","PX4_GZ_MODEL_POSE":"0,0,1.2,0,0,0","GZ_IP":"127.0.0.1","GZ_PARTITION":partition,
         "PX4_HOME_LAT":str(home["latitude"]),"PX4_HOME_LON":str(home["longitude"]),
         "PX4_HOME_ALT":str(home["home_elevation_m"])}
    return build,env

async def serve(directory):
    directory=Path(directory);config=json.loads((directory/"session.json").read_text())
    from runtime_supervisor import runnable_session
    if not runnable_session(config,directory):return
    from mavsdk import System
    from importlib.metadata import version
    if version("mavsdk")!="3.17.4":raise RuntimeError("Pinned MAVSDK version required")
    px4=Path(config["px4_root"]);actual=subprocess.check_output(
        ["git","-C",str(px4),"rev-parse","HEAD"],text=True).strip()
    if actual!=REVISION:raise RuntimeError("PX4 revision mismatch")
    home=json.loads((directory/"terrain/terrain.json").read_text())
    build,env=runtime_environment(px4,home,config["session_id"])
    log=(directory/"runtime.log").open("a")
    gz=subprocess.Popen(["gz","sim","-r","-s",str(directory/"terrain/terrasatch.sdf")],
        cwd=build/"rootfs",env=env,stdout=log,stderr=subprocess.STDOUT,start_new_session=True)
    process=None;drone=None;tasks=[];rows=deque(maxlen=300);latest={}
    missions={};healthy=False;closed=False;max_alt=None;active=None;active_plan=None;last_mission=None;last_plan=None;coverage=[];visited={};coverage_sequence=0
    def state():
        fresh=time.monotonic()-latest.get("position_monotonic",0)<=3
        return {"source":"PX4/Gazebo SITL","session_id":config["session_id"],
            "asset_id":config["asset_id"],"observed_at":latest.get("position_time",utc().isoformat()),
            "connected":bool(latest.get("connected")) and fresh and process is not None and process.poll() is None,
            "in_air":latest.get("in_air",False),"home_latitude":latest.get("home_latitude",home["latitude"]),
            "home_longitude":latest.get("home_longitude",home["longitude"]),
            "home_absolute_altitude_m":latest.get("home_absolute_altitude_m",home["home_elevation_m"]),
            "latitude":latest.get("latitude_deg",home["latitude"]),
            "longitude":latest.get("longitude_deg",home["longitude"]),
            "relative_altitude_m":latest.get("relative_altitude_m",0)}
    def save():
        packet={"schema":"terrasatch.native-flight.v1","source":"PX4/Gazebo SITL",
            "px4_revision":REVISION,"run_id":config["run_id"],"mode":"live","connected":state()["connected"],
            "stale":not state()["connected"],"samples":list(rows),"result":({**missions[last_mission["id"]],"status":"passed" if missions[last_mission["id"]]["state"]=="completed" else "failed"} if last_mission else None),
            "mission":active or last_mission,"terrain":home,"coverage":coverage,"mission_manifest":active_plan or last_plan,"qa_only":config.get("qa_only") is True}
        atomic(directory/"state.json",{"ready":healthy,"closed":closed,"state":state(),"packet":packet,
            "missions":missions,"active_plan":active_plan,"terrain":home,"profile_id":config["profile_id"]})
    async def watch(stream,consume):
        async for value in stream:consume(value)
    def position(p):
        latest.update(latitude_deg=finite(p.latitude_deg),longitude_deg=finite(p.longitude_deg),
            relative_altitude_m=finite(p.relative_altitude_m),position_monotonic=time.monotonic(),
            position_time=utc().isoformat())
    def velocity(v):
        n,e=finite(v.north_m_s),finite(v.east_m_s)
        latest["ground_speed_m_s"]=math.hypot(n,e) if n is not None and e is not None else None
    async def sample():
        nonlocal max_alt,coverage,coverage_sequence
        while True:
            row={k:latest.get(k) for k in ("latitude_deg","longitude_deg","relative_altitude_m",
                "ground_speed_m_s","battery_remaining_fraction","flight_mode","armed","in_air","roll_deg","pitch_deg","yaw_deg")}
            row.update(mission_id=active["id"] if active else None,sampled_at=utc().isoformat(),connected=state()["connected"],stale=not state()["connected"])
            rows.append(row)
            if active_plan:
                from coverage_model import update_coverage
                coverage_sequence+=1
                try:
                    values=update_coverage(active_plan,row,directory/"terrain",visited,coverage_sequence)
                    if values:coverage=values
                except (ValueError,OSError):
                    latest["coverage_error"]="Model footprint outside validated terrain; prior values retained"
            if row["connected"] and row["relative_altitude_m"] is not None:
                max_alt=max(row["relative_altitude_m"],max_alt if max_alt is not None else row["relative_altitude_m"])
            save()
            await asyncio.sleep(1)
    try:
        process=subprocess.Popen([str(build/"bin/px4")],cwd=build/"rootfs",env=env,
            stdout=log,stderr=subprocess.STDOUT,start_new_session=True)
        drone=System();await drone.connect(system_address="udpin://127.0.0.1:14540")
        def home_position(p):latest.update(home_latitude=p.latitude_deg,home_longitude=p.longitude_deg,
                                          home_absolute_altitude_m=p.absolute_altitude_m)
        def progress(p):
            if active is not None:active.update(current=p.current,total=p.total)
        streams=[
            (drone.core.connection_state(),lambda v:latest.update(connected=v.is_connected)),
            (drone.telemetry.position(),position),(drone.telemetry.home(),home_position),
            (drone.telemetry.velocity_ned(),velocity),
            (drone.telemetry.attitude_euler(),lambda v:latest.update(roll_deg=v.roll_deg,pitch_deg=v.pitch_deg,yaw_deg=v.yaw_deg)),
            (drone.telemetry.battery(),lambda v:latest.update(battery_remaining_fraction=battery_fraction(v.remaining_percent))),
            (drone.telemetry.flight_mode(),lambda v:latest.update(flight_mode=str(v))),
            (drone.telemetry.armed(),lambda v:latest.update(armed=v)),
            (drone.telemetry.in_air(),lambda v:latest.update(in_air=v)),
            (drone.mission.mission_progress(),progress)]
        tasks=[asyncio.create_task(watch(a,b)) for a,b in streams]
        tasks.append(asyncio.create_task(sample()))
        async def health():
            async for value in drone.telemetry.health():
                if value.is_global_position_ok and value.is_home_position_ok and value.is_armable:return
        await asyncio.wait_for(health(),100)
        if distance((state()["latitude"],state()["longitude"]),(home["latitude"],home["longitude"]))>5:
            raise RuntimeError("Observed GPS does not match the selected map world")
        healthy=True;save()
        expires=dt.datetime.fromisoformat(config["expires_at"])
        journal=directory/"consumed.json"
        consumed=set(json.loads(journal.read_text())) if journal.exists() else set()
        while utc()<expires and not (directory/"stop.json").exists():
            command=directory/"command.json"
            if not command.exists():await asyncio.sleep(.25);continue
            if command.stat().st_size>65536:raise ValueError("Mission command exceeds budget")
            envelope=json.loads(command.read_text());plan=envelope.get("plan",{});mid=plan.get("request_id")
            if mid in consumed:await asyncio.sleep(.25);continue
            now=utc();qa=config.get("qa_only") is True
            plan=validate(envelope,config,state(),qa=qa,now=now,current_plan=active_plan)
            from terrain_mesh import verify_clearance
            verify_clearance(plan,directory/"terrain",state()["home_absolute_altitude_m"],state=state())
            # Write the latch BEFORE any mission upload/start. An uncertain mission is never replayed.
            consumed.add(mid);atomic(journal,sorted(consumed))
            active_plan=plan;visited={};coverage=[]
            active={"id":mid,"plan_id":plan["id"],"revision":plan["revision"],
                    "content_hash":plan["content_hash"],"current":0,"total":len(plan["waypoints"])}
            receipt={"mission_id":mid,"content_hash":plan["content_hash"],"state":"accepted",
                     "action_id":envelope["authorization"]["action_id"],"started_at":None,"source":"PX4/Gazebo SITL","mission_finished":False,
                     "airborne_observed":False,"landing_observed":False,"disarmed_observed":False}
            missions[mid]=receipt;save()
            try:
                await drone.param.set_param_float("RTL_RETURN_ALT",float(plan["recovery_altitude_m"]))
                await drone.mission.set_return_to_launch_after_mission(True)
                await drone.mission.upload_mission(mission_items(plan))
                await drone.action.arm()
                await drone.mission.start_mission()
                receipt.update(state="running",started_at=utc().isoformat());save()
                deadline=time.monotonic()+min(1200,max(120,plan["estimated_route_m"]/plan["speed_m_s"]+120))
                airborne=False;violation_started=None
                while time.monotonic()<deadline and utc()<expires:
                    if not state()["connected"]:raise RuntimeError("Disconnected; flight outcome is unknown")
                    st=state()
                    excessive=(distance((st["latitude"],st["longitude"]),(st["home_latitude"],st["home_longitude"]))>300
                        or st.get("relative_altitude_m",0)>122
                        or latest.get("ground_speed_m_s",0)>max(7,plan["speed_m_s"]*1.75))
                    violation_started=violation_started or time.monotonic() if excessive else None
                    if violation_started and time.monotonic()-violation_started>2:
                        raise RuntimeError("Observed flight exceeded the approved operating envelope")
                    # A revision is a separately approved, exact plan. Stop and observe HOLD before upload.
                    if command.exists():
                        pending=json.loads(command.read_text())
                        candidate=pending.get("plan",{});next_id=candidate.get("request_id")
                        if next_id and next_id not in consumed:
                            candidate=validate(pending,config,state(),qa=qa,current_plan=active_plan)
                            await drone.mission.pause_mission()
                            hold_deadline=time.monotonic()+12
                            while time.monotonic()<hold_deadline:
                                if (state()["connected"] and "HOLD" in latest.get("flight_mode","").upper()
                                    and latest.get("ground_speed_m_s",100)<=.75):break
                                await asyncio.sleep(.25)
                            else:raise RuntimeError("Fresh stopped HOLD was not observed")
                            validate(pending,config,state(),qa=qa,current_plan=active_plan)
                            verify_clearance(candidate,directory/"terrain",state()["home_absolute_altitude_m"],state=state())
                            consumed.add(next_id);atomic(journal,sorted(consumed))
                            old_receipt=receipt
                            old_receipt.update(state="superseded",finished_at=utc().isoformat(),superseded_by=next_id)
                            missions[mid]=old_receipt
                            mid=next_id;plan=candidate;active_plan=plan;visited={};coverage=[]
                            active={"id":mid,"plan_id":plan["id"],"revision":plan["revision"],
                                "content_hash":plan["content_hash"],"current":0,"total":len(plan["waypoints"])}
                            receipt={"mission_id":mid,"content_hash":plan["content_hash"],"state":"accepted",
                                "action_id":pending["authorization"]["action_id"],"started_at":None,
                                "source":"PX4/Gazebo SITL","mission_finished":False,"airborne_observed":True,
                                "landing_observed":False,"disarmed_observed":False,"hold_observed":True,"plan_manifest":plan}
                            missions[mid]=receipt;save()
                            await drone.param.set_param_float("RTL_RETURN_ALT",float(plan["recovery_altitude_m"]))
                            await drone.mission.upload_mission(mission_items(plan))
                            await drone.mission.start_mission()
                            receipt.update(state="running",started_at=utc().isoformat())
                            deadline=time.monotonic()+min(1200,max(120,plan["estimated_route_m"]/plan["speed_m_s"]+120))
                            save()
                    if (directory/"stop.json").exists():raise RuntimeError("Session stop requested")
                    airborne=airborne or latest.get("in_air") is True
                    receipt["airborne_observed"]=airborne
                    finished=await drone.mission.is_mission_finished()
                    if finished and airborne:
                        receipt["mission_finished"]=True
                        if latest.get("in_air") is False and latest.get("armed") is False:
                            receipt.update(state="completed",landing_observed=True,disarmed_observed=True,
                                finished_at=utc().isoformat(),max_observed_relative_altitude_m=max_alt)
                            break
                    await asyncio.sleep(.5)
                else:raise TimeoutError("Mission lease or flight budget expired")
            except Exception as error:
                receipt.update(state="unknown" if not state()["connected"] else "failed",
                    error=type(error).__name__+": "+str(error)[:300],finished_at=utc().isoformat())
                if state()["connected"] and latest.get("armed"):
                    with contextlib.suppress(Exception):
                        await asyncio.wait_for(drone.action.land(),8)
                        recovery_deadline=time.monotonic()+50
                        while state()["connected"] and time.monotonic()<recovery_deadline:
                            if latest.get("in_air") is False and latest.get("armed") is False:
                                receipt.update(landing_observed=True,disarmed_observed=True);break
                            await asyncio.sleep(.5)
            finally:
                missions[mid]=receipt;last_mission=active;last_plan=plan;active=None;active_plan=None;save()
                freeze_mission(directory,mid)
            if qa:
                atomic(directory/"qa-result.json",receipt)
                if receipt["state"]!="completed":raise RuntimeError("Genuine adaptive mission QA failed")
                config["qa_only"]=False
                config["validated"]=True
                # Parent verifies result and retained observed telemetry before enrolling the profile.
    finally:
        healthy=False;closed=True
        if drone is not None and latest.get("connected") and latest.get("armed"):
            with contextlib.suppress(Exception):await asyncio.wait_for(drone.action.land(),10)
        for task in tasks:task.cancel()
        await asyncio.gather(*tasks,return_exceptions=True)
        for child in (process,gz):
            if child is not None and child.poll() is None:
                os.killpg(child.pid,signal.SIGTERM)
                try:await asyncio.to_thread(child.wait,8)
                except subprocess.TimeoutExpired:os.killpg(child.pid,signal.SIGKILL)
        save();log.close()

if __name__=="__main__":
    asyncio.run(serve(sys.argv[1]))
