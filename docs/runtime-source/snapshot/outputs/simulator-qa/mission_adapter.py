"""MAVSDK mission adapter; no endpoint supplied by a browser or a model."""
import datetime as dt
import hashlib
import json
import math
from uuid import UUID

def utc():return dt.datetime.now(dt.timezone.utc)
def content_hash(plan):
    return hashlib.sha256(json.dumps({k:v for k,v in plan.items() if k!="content_hash"},
        sort_keys=True,separators=(",",":"),allow_nan=False).encode()).hexdigest()
def distance(a,b):
    lat1,lon1,lat2,lon2=map(math.radians,[a[0],a[1],b[0],b[1]])
    return 6371000*2*math.asin(min(1,math.sqrt(math.sin((lat2-lat1)/2)**2+
        math.cos(lat1)*math.cos(lat2)*math.sin((lon2-lon1)/2)**2)))
def validate(envelope,session,state,*,qa=False,now=None,current_plan=None):
    now=now or utc()
    if envelope.get("schema")!="terrasatch.approved-simulation.v1":
        raise ValueError("Unknown approved mission contract")
    plan=envelope.get("plan",{});stamp=envelope.get("authorization",{})
    if (plan.get("schema")!="terrasatch.simulation-mission.v1" or plan.get("environment")!="simulation"
        or plan.get("content_hash")!=content_hash(plan) or plan.get("approval_required") is not True
        or plan.get("execution_authorized") is not False or plan.get("approval") is not None):
        raise ValueError("Mission plan is untrusted or changed")
    for key in ("id","request_id"):UUID(plan[key])
    if (dt.datetime.fromisoformat(plan["created_at"])>now
        or now>=dt.datetime.fromisoformat(plan["expires_at"])
        or plan["scope"]!={k:str(session[k]) for k in
            ("organization_id","site_id","asset_id","session_id")}
        or plan["adapter_profile_id"]!=session["profile_id"]):
        raise ValueError("Mission scope, profile or expiry differs")
    if (stamp.get("content_hash")!=plan["content_hash"] or stamp.get("revision")!=plan["revision"]
        or stamp.get("expires_at")!=plan["expires_at"]):
        raise ValueError("Human approval does not match the exact plan")
    if qa:
        if envelope.get("approval_source")!="isolated_qa_fixture":raise ValueError("QA fixture required")
    elif (envelope.get("approval_source") not in {"radio","console"} or not session.get("validated")):
        raise ValueError("Validated runtime and existing human approval required")
    UUID(stamp["approval_id"]);UUID(stamp["action_id"])
    observed=dt.datetime.fromisoformat(state["observed_at"])
    if (not state.get("connected") or not -1<=(now-observed).total_seconds()<=3):
        raise ValueError("Fresh connected vehicle state required")
    if plan.get("payload") not in {"none","modeled_rgb"}:
        raise ValueError("No actual sensor payload is validated for this adapter")
    if plan.get("execution_mode")=="replace_active":
        if (not state.get("in_air") or not current_plan
            or plan["id"]!=current_plan["id"] or plan["revision"]!=current_plan["revision"]+1
            or plan.get("supersedes_hash")!=current_plan["content_hash"]
            or plan["scope"]!=current_plan["scope"]):
            raise ValueError("Replacement must match the active mission, scope and next revision")
    elif plan.get("execution_mode")!="new_mission" or state.get("in_air") or current_plan:
        raise ValueError("New mission requires an idle grounded simulator")
    if plan.get("altitude",{}).get("reference") not in {"home_relative","per_waypoint_home_relative"}:
        raise ValueError("Explicit home-relative altitude required")
    if abs(plan["altitude"]["home_absolute_altitude_m"]-state["home_absolute_altitude_m"])>2:
        raise ValueError("Home altitude changed")
    speed=plan.get("speed_m_s")
    if type(speed) not in {int,float} or not math.isfinite(speed) or not 0<speed<=5:
        raise ValueError("Invalid speed")
    points=plan.get("waypoints")
    if not isinstance(points,list) or not 1<=len(points)<=100:raise ValueError("Waypoint budget exceeded")
    home=(state["home_latitude"],state["home_longitude"])
    route=[(state["latitude"],state["longitude"])]
    for p in points:
        values=[p.get("latitude_deg"),p.get("longitude_deg"),p.get("relative_altitude_m")]
        if not all(type(x) in {int,float} and math.isfinite(x) for x in values):
            raise ValueError("Non-finite waypoint")
        lat,lon,alt=values
        if not 18<=lat<=72 or not -179<=lon<=-64 or not 5<=alt<=120 or distance(home,(lat,lon))>300:
            raise ValueError("Waypoint leaves the local validated envelope")
        route.append((lat,lon))
    route.append(home)
    if sum(distance(a,b) for a,b in zip(route,route[1:]))>3000:
        raise ValueError("Route budget exceeded")
    return plan

def mission_items(plan):
    from mavsdk.mission import MissionItem, MissionPlan
    nan=float("nan")
    items=[MissionItem(latitude_deg=p["latitude_deg"],longitude_deg=p["longitude_deg"],
        relative_altitude_m=p["relative_altitude_m"],speed_m_s=plan["speed_m_s"],
        is_fly_through=False,gimbal_pitch_deg=nan,gimbal_yaw_deg=nan,
        camera_action=MissionItem.CameraAction.NONE,loiter_time_s=1,
        camera_photo_interval_s=nan,acceptance_radius_m=2,yaw_deg=nan,
        camera_photo_distance_m=nan,vehicle_action=MissionItem.VehicleAction.NONE)
        for p in plan["waypoints"]]
    return MissionPlan(items)
