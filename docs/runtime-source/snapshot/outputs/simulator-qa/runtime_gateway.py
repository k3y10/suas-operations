"""Loopback-only optional gateway. The canonical API remains the approval authority."""
import argparse
import contextlib
import datetime as dt
import hashlib
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import os
from pathlib import Path
import secrets
import shutil
import subprocess
import threading
import time
from urllib.parse import parse_qs, urlparse
from uuid import UUID, uuid4
from native_qa import check_host, properties, REVISION
from mission_adapter import content_hash, validate, utc
from runtime_worker import atomic

ROOT=Path(__file__).resolve().parent
PROFILE="px4-"+REVISION[:12]+"-h3-satellite-v1"
MODULES=("runtime_gateway.py","runtime_worker.py","runtime_supervisor.py","mission_adapter.py","terrain_world.py","terrain_mesh.py","coverage_model.py")
def profile_hash():
    h=hashlib.sha256()
    for name in MODULES:h.update(name.encode());h.update((ROOT/name).read_bytes())
    return h.hexdigest()
def read_json(path,limit=512*1024):
    if not path.is_file() or path.is_symlink() or path.stat().st_size>limit:raise ValueError("Invalid runtime file")
    return json.loads(path.read_text())
def checked_uuid(value):return str(UUID(str(value)))

class ManagedSupervisor:
    """Read-only observation of the existing isolated worker's managed unit."""
    def __init__(self):self.started=time.monotonic();self.checked=0;self.code=None
    def poll(self):
        if time.monotonic()-self.checked<1:return self.code
        self.checked=time.monotonic()
        result=subprocess.run(["systemctl","show","terrasatch-simulator-runtime.service","-p","ActiveState","--value"],capture_output=True,text=True,timeout=3)
        state=result.stdout.strip()
        self.code=None if state in {"active","activating"} or state=="inactive" and time.monotonic()-self.started<15 else 1
        return self.code
    def wait(self,timeout=40):
        until=time.monotonic()+timeout
        while self.poll() is None and time.monotonic()<until:time.sleep(.5)
        if self.poll() is None:raise subprocess.TimeoutExpired("managed supervisor",timeout)
        return self.code

class Gateway:
    def __init__(self,work,token):
        self.work=Path(work);self.token=token;self.lock=threading.RLock();self.session=None
        self.unit=None;self.process=None;self.stamp=None
    def validated(self):
        try:
            p=read_json(self.work/"validated-profile.json")
            return p.get("profile_hash")==profile_hash() and p.get("px4_revision")==REVISION and p.get("mission_verified") is True and p.get("active_replan_verified") is True and self.process is not None and self.process.poll() is None
        except (OSError,ValueError):return False
    def runtime(self,config=None,mission_id=None):
        config=config or self.session
        if not config:return None
        try:
            directory=Path(config['directory'])
            captured=directory/('mission-'+checked_uuid(mission_id)+'.json') if mission_id else None
            return read_json(captured if captured and captured.exists() else directory/'state.json')
        except (OSError,ValueError):return None
    def lease(self,config=None):
        config=config or self.session
        if not config:raise LookupError("No owned simulator session")
        r=self.runtime(config);connected=bool(r and r["ready"] and r["state"]["connected"] and
            (utc()-dt.datetime.fromisoformat(r["state"]["observed_at"])).total_seconds()<=3)
        status="ready" if connected else "starting"
        if utc()>=dt.datetime.fromisoformat(config["expires_at"]):status="expired";connected=False
        if not self.session or config["id"]!=self.session["id"]:status="closed";connected=False
        if (r and r.get("closed")) or self.process is not None and self.process.poll() is not None:status="closed";connected=False
        if (Path(config["directory"])/"preparation-error.json").exists():status="closed";connected=False
        return {k:config[k] for k in ("id","organization_id","owner_user_id","site_id","created_at","expires_at")} | {
            "status":status,"connected":connected,"aircraft_cancellation_verified":bool(r and not r["state"]["in_air"] and r["packet"]["samples"] and r["packet"]["samples"][-1].get("armed") is False)}
    def scope(self,scope,config=None):
        config=config or self.session
        if not config or any(config.get(k)!=scope.get(k) for k in ("organization_id","owner_user_id")):
            raise LookupError("Owned simulator session not found")
    def saved_session(self,scope,sid):
        sid=checked_uuid(sid)
        config=read_json(self.work/("session-"+sid)/"session.json")
        self.scope(scope,config)
        return config
    def mission_session(self,scope,mid):
        for directory in list(self.work.glob("session-*"))[:16]:
            try:
                config=read_json(directory/"session.json");self.scope(scope,config)
                runtime=self.runtime(config,mid)
                if runtime and mid in runtime["missions"]:return config
            except (OSError,ValueError,LookupError):pass
        raise LookupError("Owned mission not found")
    def create(self,scope,body,*,qa=False):
        with self.lock:
            previous=None
            if self.process is None or self.process.poll() is not None:raise RuntimeError("Runtime service stopped; restart the gateway. No rebuild required")
            if self.session and self.lease()["status"] not in {"closed","expired"}:
                if self.session["request_id"]==body["request_id"] and all(self.session[k]==v for k,v in scope.items()):return self.lease()
                runtime=self.runtime();samples=(runtime or {}).get("packet",{}).get("samples",[])
                receipts=(runtime or {}).get("missions",{})
                safely_finished=bool(receipts) and all(r.get("state") in {"completed","failed","canceled","superseded"} for r in receipts.values())
                if (not all(self.session[k]==v for k,v in scope.items()) or not runtime or not safely_finished
                    or runtime["state"]["in_air"] is not False or not samples or samples[-1].get("armed") is not False):
                    raise RuntimeError("One simulator lease is already active")
                atomic(Path(self.session["directory"])/"stop.json",{"requested_at":utc().isoformat()})
                previous=self.session
            if len(list(self.work.glob("session-*")))>=16:raise RuntimeError("Local evidence retention budget reached; archive old sessions before starting more")
            site,asset=checked_uuid(body["site_id"]),checked_uuid(body["asset_id"])
            home=body.get("home") or {}
            latitude,longitude=home.get("latitude"),home.get("longitude")
            if type(latitude) not in {int,float} or type(longitude) not in {int,float}:raise ValueError("Select a real map home coordinate")
            if not (18<=latitude<=72 and -179<=longitude<=-64):raise ValueError("Unsupported terrain home")
            sid=str(uuid4());directory=self.work/("session-"+sid);directory.mkdir(mode=0o700)
            now=utc();stamp=now.strftime("%Y%m%dT%H%M%S%fZ");self.stamp=stamp
            lifetime=body.get("lifetime_seconds",1800)
            if type(lifetime) is not int or not 60<=lifetime<=1800:raise ValueError("Invalid session lifetime")
            config={**scope,"id":sid,"session_id":sid,"site_id":site,"asset_id":asset,
                "request_id":checked_uuid(body["request_id"]),"created_at":now.isoformat(),
                "expires_at":(now+dt.timedelta(seconds=lifetime)).isoformat(),
                "directory":str(directory),"px4_root":str(self.work/"PX4-Autopilot"),
                "profile_id":PROFILE,"run_id":"native-evidence-"+stamp,
                "validated":self.validated(),"qa_only":qa,"home":{"latitude":latitude,"longitude":longitude}}
            atomic(directory/"session.json",config)
            self.session=config
            threading.Thread(target=self.prepare_session,args=(config,qa,previous),daemon=True).start()
            return self.lease()
    def prepare_session(self,config,qa,previous=None):
        try:
            if previous:
                until=time.monotonic()+35
                while not (self.runtime(previous) or {}).get("closed") and time.monotonic()<until:time.sleep(.2)
                if not (self.runtime(previous) or {}).get("closed"):raise RuntimeError("Previous grounded session is still closing")
            from terrain_world import make_world
            home=config["home"];directory=Path(config["directory"])
            make_world(self.work/"PX4-Autopilot",directory/"terrain",home["latitude"],home["longitude"])
            if self.session is not config or utc()>=dt.datetime.fromisoformat(config["expires_at"]) or (directory/"stop.json").exists():return
            atomic(self.work/"current-session.json",{"session_id":config["id"]})
            self.monitor(config,qa)
        except Exception as error:
            atomic(Path(config["directory"])/"preparation-error.json",{"error":type(error).__name__,"at":utc().isoformat()})
            print("Simulator terrain preparation failed: "+type(error).__name__,flush=True)
    def monitor(self,config,qa):
        directory=Path(config["directory"]);qa_sent=False;qa_revised=False;resources=[];last_resource=0
        try:
            while self.process and self.process.poll() is None:
                runtime=self.runtime(config)
                if time.monotonic()-last_resource>=5 and self.unit:
                    query=subprocess.run(["systemctl","show",self.unit,"-p","MemoryCurrent",
                        "-p","MemoryPeak","-p","CPUUsageNSec","-p","TasksCurrent"],
                        capture_output=True,text=True,timeout=3)
                    values={}
                    for line in query.stdout.splitlines():
                        key,_,value=line.partition("=")
                        values[key]=int(value) if value.isdigit() and value!="18446744073709551615" else None
                    if query.returncode==0:
                        resources=(resources+[{"sampled_at":utc().isoformat(),**values}])[-360:]
                        atomic(directory/"resources.json",resources)
                    last_resource=time.monotonic()
                if runtime:
                    atomic(ROOT/"live-flight.json",runtime["packet"])
                    if qa and runtime["ready"] and not qa_sent:
                        self.qa_command(config,runtime);qa_sent=True
                    if qa and qa_sent and not qa_revised and runtime["state"]["in_air"] and runtime["state"].get("relative_altitude_m",0)>35 and (runtime["packet"].get("mission") or {}).get("current",0)>=1 and runtime.get("active_plan"):
                        self.qa_command(config,runtime,previous=runtime["active_plan"]);qa_revised=True
                    result=directory/"qa-result.json"
                    if qa and result.exists():
                        receipt=read_json(result)
                        samples=runtime["packet"]["samples"]
                        if (receipt.get("state")=="completed" and all(receipt.get(k) is True for k in
                            ("mission_finished","airborne_observed","landing_observed","disarmed_observed"))
                            and receipt.get("hold_observed") is True and qa_revised
                            and len(samples)>=3 and any(p.get("in_air") and p.get("relative_altitude_m",0)>5 for p in samples)):
                            atomic(self.work/"validated-profile.json",{"profile_hash":profile_hash(),
                                "px4_revision":REVISION,"mission_verified":True,"active_replan_verified":True,"verified_at":utc().isoformat(),
                                "result":receipt,"session_id":config["session_id"]})
                            evidence=ROOT/("operations-evidence-"+self.stamp);evidence.mkdir(exist_ok=True)
                            atomic(evidence/"result.json",receipt);atomic(evidence/"telemetry.json",runtime["packet"])
                            atomic(evidence/"resources.json",resources)
                            atomic(evidence/"provenance.json",{"px4_revision":REVISION,"profile_hash":profile_hash(),"modules":{n:hashlib.sha256((ROOT/n).read_bytes()).hexdigest() for n in MODULES},"terrain":runtime["terrain"]})
                            print("Genuine mission QA PASSED. Profile enrolled for this runtime. The gateway stays available for new owned sessions.",flush=True)
                            atomic(directory/"stop.json",{"requested_at":utc().isoformat()})
                            qa=False
                        elif receipt.get("state")!="completed":
                            evidence=ROOT/("operations-evidence-"+self.stamp);evidence.mkdir(exist_ok=True)
                            atomic(evidence/"result.json",receipt);atomic(evidence/"telemetry.json",runtime["packet"])
                            atomic(evidence/"resources.json",resources)
                            for name in ("runtime.log",):
                                path=directory/name
                                if path.exists():(evidence/name).write_bytes(path.read_bytes()[-256000:])
                            log=self.work/"operations-service.log"
                            if log.exists():(evidence/"operations-service.log").write_bytes(log.read_bytes()[-256000:])
                            print("Mission QA failed; profile stays unavailable. "+str(receipt.get("error",""))+" Evidence: "+str(evidence),flush=True)
                            qa=False
                if runtime and runtime.get("closed"):break
                time.sleep(1)
        finally:
            runtime=self.runtime(config)
            if runtime:
                packet={**runtime["packet"],"connected":False,"stale":True,"mode":"recorded"}
                atomic(ROOT/"live-flight.json",packet)

    def qa_command(self,config,runtime,previous=None):
        from mission_adapter import utc
        state=runtime["state"];now=utc();rid=str(uuid4());home=runtime["terrain"]
        # Dynamic test path derives from the chosen real home, not an unrelated prerecorded world.
        lat,lon=state["home_latitude"],state["home_longitude"]
        import math
        import h3
        ids=sorted(h3.grid_disk(h3.latlng_to_cell(lat,lon,13),1))[3:6] if previous else sorted(h3.grid_disk(h3.latlng_to_cell(lat,lon,13),1))[:3]
        points=[{"cell_id":cell,"latitude_deg":h3.cell_to_latlng(cell)[0],
                 "longitude_deg":h3.cell_to_latlng(cell)[1],"relative_altitude_m":30} for cell in ids]
        plan={"schema":"terrasatch.simulation-mission.v1","environment":"simulation","id":previous["id"] if previous else rid,
            "request_id":rid,"revision":previous["revision"]+1 if previous else 1,
            "supersedes_hash":previous["content_hash"] if previous else None,"scope":{k:config[k] for k in ("organization_id","site_id","asset_id","session_id")},
            "created_at":now.isoformat(),"expires_at":(now+dt.timedelta(minutes=2)).isoformat(),
            "adapter_profile_id":PROFILE,"operation":"survey_area","execution_mode":"replace_active" if previous else "new_mission",
            "altitude":{"reference":"home_relative","metres":30,
                        "home_absolute_altitude_m":state["home_absolute_altitude_m"]},
            "speed_m_s":2,"payload":"modeled_rgb","waypoints":points,
            "cell_index":{"scheme":"H3","resolution":13,"cell_ids":ids},"estimated_route_m":30,
            "approval_required":True,"approval":None,"execution_authorized":False}
        from terrain_mesh import terrain_mesh
        start=[state["latitude"],state["longitude"]] if previous else None
        mesh=terrain_mesh(Path(config["directory"])/"terrain",[[p["latitude_deg"],p["longitude_deg"]] for p in points],start=start)
        for i,p in enumerate(points):p["relative_altitude_m"]=max(mesh["leg_max_elevations_m"][i:i+2])+40-state["home_absolute_altitude_m"]
        plan["recovery_altitude_m"]=max(60,*[p["relative_altitude_m"] for p in points])
        join={"latitude_deg":state["latitude"] if previous else lat,"longitude_deg":state["longitude"] if previous else lon,
              "relative_altitude_m":points[0]["relative_altitude_m"]}
        plan["waypoints"]=[join,*points,{"latitude_deg":lat,"longitude_deg":lon,"relative_altitude_m":plan["recovery_altitude_m"]}]
        plan["altitude"]["metres"]=40
        plan["altitude"]["requested_reference"]="AGL"
        plan["altitude"]["requested_metres"]=40
        plan["terrain_evidence_id"]=mesh["terrain_id"]
        plan["content_hash"]=content_hash(plan)
        stamp={"content_hash":plan["content_hash"],"revision":plan["revision"],"expires_at":plan["expires_at"],
               "approval_id":str(uuid4()),"action_id":str(uuid4())}
        envelope={"schema":"terrasatch.approved-simulation.v1","plan":plan,
                  "authorization":stamp,"approval_source":"isolated_qa_fixture"}
        atomic(Path(config["directory"])/"command.json",envelope)
    def adapter(self,config=None):
        config=config or self.session
        return {"provider":"px4_gazebo_sitl","asset_id":config["asset_id"],"profile_id":PROFILE,
            "validated":self.validated(),"simulation_only":True,"capabilities":["drone:mission","simulation:rgb_footprint"],
            "max_radius_m":300,"max_altitude_m":120,"max_speed_m_s":5,"max_route_m":3000,
            "max_waypoints":100,"line_spacing_m":25,"supports_active_replan":self.validated()}
    def accept(self,scope,envelope):
        with self.lock:
            self.scope(scope);runtime=self.runtime()
            if not runtime or not self.lease()["connected"]:raise RuntimeError("Simulator is not ready")
            config={**self.session,"validated":self.validated()}
            plan=validate(envelope,config,runtime["state"],current_plan=runtime.get("active_plan"));mid=plan["request_id"]
            from terrain_mesh import verify_clearance
            verify_clearance(plan,Path(self.session["directory"])/"terrain",runtime["state"]["home_absolute_altitude_m"],state=runtime["state"])
            old=runtime["missions"].get(mid)
            if old:
                if old["content_hash"]!=plan["content_hash"]:raise RuntimeError("Idempotency conflict")
                return old
            if runtime.get("active_plan") and plan["execution_mode"]!="replace_active":raise RuntimeError("Reconcile the active mission before another dispatch")
            if len(runtime["missions"])>=20:raise RuntimeError("Session mission budget reached")
            command=Path(self.session["directory"])/"command.json"
            if command.exists():
                pending=read_json(command);pid=pending.get("plan",{}).get("request_id")
                if pid==mid:return {"mission_id":mid,"content_hash":plan["content_hash"],"state":"accepted"}
                if pid not in runtime["missions"]:raise RuntimeError("Another command is awaiting reconciliation")
            atomic(command,envelope)
            return {"mission_id":mid,"content_hash":plan["content_hash"],"state":"accepted"}

def handler(gateway):
    class Handler(BaseHTTPRequestHandler):
        def log_message(self,*args):pass
        def do_GET(self):self.respond()
        def do_POST(self):self.respond()
        def do_DELETE(self):self.respond()
        def respond(self):
            def send(status,value):
                data=json.dumps(value,allow_nan=False).encode()
                self.send_response(status);self.send_header("Content-Type","application/json")
                self.send_header("Cache-Control","no-store");self.send_header("Content-Length",str(len(data)))
                self.end_headers();self.wfile.write(data)
            if self.headers.get("Authorization")!="Bearer "+gateway.token:return send(401,{"detail":"Gateway authentication required"})
            try:
                url=urlparse(self.path);query=parse_qs(url.query)
                scope={k:checked_uuid(query.get(k,[""])[0]) for k in ("organization_id","owner_user_id")}
                body={}
                if self.command=="POST":
                    length=int(self.headers.get("Content-Length","0"))
                    if not 0<length<=65536:raise ValueError("Bounded JSON body required")
                    body=json.loads(self.rfile.read(length))
                path=url.path
                if path=="/v1/capabilities" and self.command=="GET":
                    return send(200,{"enabled":True,"available":gateway.validated(),"provider":"px4_gazebo_sitl" if gateway.validated() else None,
                        "capabilities":["drone:mission","simulation:rgb_footprint"] if gateway.validated() else [],
                        "reason":None if gateway.validated() else "Genuine mission adapter QA has not passed for this runtime version"})
                if path=="/v1/sessions" and self.command=="POST":return send(200,gateway.create(scope,body))
                parts=path.split("/")
                if len(parts)>=4 and parts[2]=="sessions":
                    session=gateway.saved_session(scope,parts[3])
                elif len(parts)>=4 and parts[2]=="missions":
                    session=gateway.mission_session(scope,checked_uuid(parts[3]))
                else:
                    gateway.scope(scope);session=gateway.session
                sid=session["id"]
                if path=="/v1/sessions/"+sid:
                    if self.command=="DELETE":atomic(Path(session["directory"])/"stop.json",{"requested_at":utc().isoformat()})
                    return send(200,gateway.lease(session))
                runtime=gateway.runtime(session,parts[3] if len(parts)>=4 and parts[2]=='missions' and self.command=='GET' else None)
                if not runtime:raise RuntimeError("Simulator is starting")
                if path=="/v1/sessions/"+sid+"/missions" and self.command=="GET":
                    offset=max(0,int(query.get("offset",["0"])[0]));limit=max(1,min(50,int(query.get("limit",["20"])[0])))
                    entries=[{**r,"id":mid,"session_id":sid,"state":"queued" if r["state"]=="accepted" else "canceled" if r["state"]=="superseded" else r["state"],
                        "updated_at":r.get("finished_at") or r.get("started_at") or utc().isoformat()}
                        for mid,r in runtime["missions"].items()]
                    return send(200,{"items":entries[offset:offset+limit],"total":len(entries),"limit":limit,"offset":offset})
                if path=="/v1/sessions/"+sid+"/state" and self.command=="GET":
                    return send(200,{"state":runtime["state"],"adapter":gateway.adapter(session),"active_plan":runtime.get("active_plan")})
                if path=="/v1/sessions/"+sid+"/terrain" and self.command=="POST":
                    from terrain_mesh import terrain_mesh
                    return send(200,terrain_mesh(Path(session["directory"])/"terrain",body["points"],start=[runtime["state"]["latitude"],runtime["state"]["longitude"]] if runtime["state"]["in_air"] else None))
                if path=="/v1/missions" and self.command=="POST":return send(200,gateway.accept(scope,body))
                if path.startswith("/v1/missions/") and self.command=="GET":
                    pieces=path.split("/");mid=checked_uuid(pieces[3]);receipt=runtime["missions"].get(mid)
                    if not receipt:raise LookupError("Owned mission not found")
                    if len(pieces)==5 and pieces[4]=="telemetry":
                        limit=max(1,min(300,int(query.get("limit",["1"])[0])))
                        packet=runtime["packet"]
                        return send(200,{"connected":gateway.lease(session)["connected"],"stale":not gateway.lease(session)["connected"],"samples":[r for r in packet["samples"] if r.get("mission_id")==mid][-limit:],
                            "coverage":[r for r in packet.get("coverage",[])[:120] if r.get("planId")==mid],
                            "flight_result":{k:receipt.get(k) for k in ("content_hash","status","mission_finished","airborne_observed","landing_observed","disarmed_observed","started_at","finished_at")}})
                    if len(pieces)==5 and pieces[4]=="track":
                        limit=max(1,min(300,int(query.get("limit",["300"])[0])))
                        points=[{"latitude":r["latitude_deg"],"longitude":r["longitude_deg"],"observed_at":r["sampled_at"],
                            "relative_altitude_m":r.get("relative_altitude_m")} for r in runtime["packet"]["samples"]
                            if r.get("mission_id")==mid and r.get("connected") and r.get("latitude_deg") is not None and r.get("longitude_deg") is not None]
                        coords=[[r["longitude"],r["latitude"],r["relative_altitude_m"]] for r in points[-limit:] if r["relative_altitude_m"] is not None]
                        return send(200,{"type":"FeatureCollection","source":"PX4/Gazebo SITL",
                            "sampled_point_count":len(coords) if len(coords)>=2 else 0,
                            "features":[{"type":"Feature","properties":{"mission_id":mid},"geometry":{"type":"LineString","coordinates":coords}}] if len(coords)>=2 else []})
                    if len(pieces)==4:
                        action_id=receipt["action_id"]
                        return send(200,{**receipt,"id":mid,"session_id":sid,"action_id":action_id,
                            "state":"queued" if receipt["state"]=="accepted" else "canceled" if receipt["state"]=="superseded" else receipt["state"],
                            "updated_at":receipt.get("finished_at") or receipt.get("started_at") or utc().isoformat()})
                raise LookupError("Simulator resource not found")
            except LookupError as error:send(404,{"detail":str(error)})
            except (ValueError,KeyError,TypeError) as error:send(409,{"detail":str(error)[:200]})
            except Exception as error:send(503,{"detail":type(error).__name__+": simulator unavailable"})
    return Handler

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument("--prepare",action="store_true",help="Install Pillow into the existing native venv; no PX4 rebuild")
    parser.add_argument("--qa",action="store_true",help="Run an explicitly isolated mission test at the chosen real coordinates")
    parser.add_argument("--managed-unit",action="store_true",help="Use the installed isolated supervisor service without interactive sudo")
    parser.add_argument("--latitude",type=float)
    parser.add_argument("--longitude",type=float)
    args=parser.parse_args();check_host()
    work=Path("/var/tmp")/("terrasatch-native-qa-"+str(os.getuid()))
    if not work.is_dir() or work.is_symlink() or work.stat().st_uid!=os.getuid():raise RuntimeError("Use the existing owned native setup")
    if subprocess.check_output(["git","-C",str(work/"PX4-Autopilot"),"status","--porcelain","--untracked-files=no"],text=True).strip():
        raise RuntimeError("Tracked PX4 source changes found; nothing was reset")
    if args.prepare and sys_prefix()!=str(work/"venv"):
        version=json.loads(subprocess.check_output([str(work/"venv/bin/python"),"-c",
            "import sys,json;print(json.dumps(list(sys.version_info[:2])))"],text=True))
        if tuple(version)<(3,9):raise RuntimeError("The runtime requires Python 3.9 or newer; no system interpreter was changed")
        pins=["Pillow==11.3.0","h3==4.4.2"] if tuple(version)<(3,10) else ["Pillow==12.0.0","h3==4.5.0"]
        print("Installing compatible runtime dependencies for Python "+str(version[0])+"."+str(version[1])+": "+", ".join(pins),flush=True)
        subprocess.run([str(work/"venv/bin/python"),"-m","pip","install",*pins],check=True)
    if sys_prefix()!=str(work/"venv"):
        os.execv(str(work/"venv/bin/python"),[str(work/"venv/bin/python"),str(Path(__file__).resolve()),*__import__("sys").argv[1:].copy()])
    from PIL import Image
    import h3
    from importlib.metadata import version
    if version("mavsdk")!="3.17.4" or not h3.is_valid_cell("8b2696ac4c50fff"):
        raise RuntimeError("Runtime dependency preflight failed; the PX4 build is preserved")
    if not args.managed_unit:subprocess.run(["sudo","-v"],check=True)
    token_file=work/"gateway-token"
    if not token_file.exists():
        token_file.write_text(secrets.token_urlsafe(32));token_file.chmod(0o600)
    token=token_file.read_text().strip()
    gateway=Gateway(work,token)
    bridge=ROOT.parent.parent/"work/runtime-bridge"
    bridge.mkdir(parents=True,exist_ok=True,mode=0o700)
    atomic(bridge/"connection.json",{"url":"http://127.0.0.1:3187","token":token})
    (bridge/"connection.json").chmod(0o600)
    for name in ("runtime_worker.py","runtime_supervisor.py","mission_adapter.py","terrain_mesh.py","coverage_model.py","probe.py"):
        shutil.copyfile(ROOT/name,work/name)
    current_pointer=work/"current-session.json"
    if current_pointer.exists():current_pointer.unlink()  # Never restart a prior lease implicitly.
    shutdown=work/"gateway-shutdown.json"
    if shutdown.exists():shutdown.unlink()
    atomic(work/"gateway-heartbeat.json",{"at":utc().isoformat()})
    unit="terrasatch-runtime-"+str(uuid4())
    gateway.unit=unit
    props=[p.replace("RuntimeMaxSec=270","RuntimeMaxSec=28800") for p in properties(work)]
    envpath=str(work/"home/.local/bin")+os.pathsep+os.environ.get("PATH","")
    log=None
    if args.managed_unit:
        gateway.unit="terrasatch-simulator-runtime.service"
        gateway.process=ManagedSupervisor()
    else:
        log=(work/"operations-service.log").open("w")
        gateway.process=subprocess.Popen(["sudo","systemd-run","--unit="+unit,"--wait","--pipe","--collect",*props,
            "--setenv=HOME="+str(work/"home"),"--setenv=PATH="+envpath,
            str(work/"venv/bin/python"),str(work/"runtime_supervisor.py"),str(work)],stdout=log,stderr=subprocess.STDOUT)
    def heartbeat():
        while gateway.process.poll() is None and not shutdown.exists():
            atomic(work/"gateway-heartbeat.json",{"at":utc().isoformat()})
            time.sleep(2)
    threading.Thread(target=heartbeat,daemon=True).start()
    server=ThreadingHTTPServer(("127.0.0.1",3187),handler(gateway))
    print("Local gateway ready on 127.0.0.1:3187. Normal missions use the cached PX4 binary; keep this terminal open.",flush=True)
    print("Private API gateway token is stored at "+str(token_file)+". Do not paste it into chat.",flush=True)
    if args.qa:
        if args.latitude is None or args.longitude is None:raise ValueError("--qa requires the selected real --latitude and --longitude")
        scope={"organization_id":str(uuid4()),"owner_user_id":str(uuid4())}
        gateway.create(scope,{"request_id":str(uuid4()),"site_id":str(uuid4()),"asset_id":str(uuid4()),
            "home":{"latitude":args.latitude,"longitude":args.longitude},"lifetime_seconds":1800},qa=True)
    try:server.serve_forever(poll_interval=.5)
    finally:
        if gateway.session:atomic(Path(gateway.session["directory"])/"stop.json",{"requested_at":utc().isoformat()})
        atomic(work/"gateway-shutdown.json",{"at":utc().isoformat()})
        server.server_close()
        try:gateway.process.wait(timeout=40)
        except subprocess.TimeoutExpired:print("Owned isolated service is still stopping; its resource deadline remains active.",flush=True)
        if log:log.close()

def sys_prefix():return __import__("sys").prefix
if __name__=="__main__":main()
