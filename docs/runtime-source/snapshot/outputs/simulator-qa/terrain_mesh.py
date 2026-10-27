"""Bounded queries against the exact DEM heightfield loaded into this simulator."""
import hashlib
import json
import math
from pathlib import Path
from PIL import Image
from mission_adapter import distance

def evidence_id(directory):
    directory=Path(directory);h=hashlib.sha256()
    for name in ("height.png","terrain.json"):h.update((directory/name).read_bytes())
    return h.hexdigest()

def terrain_mesh(directory,points,*,start=None):
    directory=Path(directory)
    if not isinstance(points,list) or not 1<=len(points)<=100:raise ValueError("Bounded terrain route required")
    meta=json.loads((directory/"terrain.json").read_text())
    image=Image.open(directory/"height.png")
    if image.size!=(257,257):raise ValueError("Unexpected terrain grid")
    home=[meta["latitude"],meta["longitude"]];width=meta["width_m"]
    def elevation(p):
        if not all(type(v) in {int,float} and math.isfinite(v) for v in p):raise ValueError("Invalid route coordinate")
        north=(p[0]-home[0])*111320;east=(p[1]-home[1])*111320*math.cos(math.radians(home[0]))
        x=(east+width/2)/width*256;y=(width/2-north)/width*256
        if not 1<=x<255 or not 1<=y<255:raise ValueError("Route leaves the loaded terrain")
        i,j=int(x),int(y);u,v=x-i,y-j
        z=(image.getpixel((i,j))*(1-u)*(1-v)+image.getpixel((i+1,j))*u*(1-v)
           +image.getpixel((i,j+1))*(1-u)*v+image.getpixel((i+1,j+1))*u*v)
        return meta["height_min_m"]+z/65535*max(1,meta["height_max_m"]-meta["height_min_m"])
    path=[start or home,*points,home];maxima=[]
    for a,b in zip(path,path[1:]):
        count=max(1,math.ceil(distance(a,b)/5))
        if count>300:raise ValueError("Terrain leg sample budget exceeded")
        maxima.append(max(elevation([a[0]+(b[0]-a[0])*i/count,a[1]+(b[1]-a[1])*i/count]) for i in range(count+1)))
    return {"terrain_id":evidence_id(directory),"home_elevation_m":meta["home_elevation_m"],
        "home_latitude":home[0],"home_longitude":home[1],"start":start or home,
        "point_elevations_m":[elevation(p) for p in points],"leg_max_elevations_m":maxima,
        "sample_step_m":5,"dem_pixel_spacing_m":meta["dem_pixel_spacing_m"],
        "source":"Exact Terrarium-derived Gazebo heightfield","vertical_reference":"configured_simulation_DEM"}

def verify_clearance(plan,directory,home_absolute_altitude_m,*,state=None):
    points=[[p["latitude_deg"],p["longitude_deg"]] for p in plan["waypoints"]]
    start=[state["latitude"],state["longitude"]] if state and plan.get("execution_mode")=="replace_active" else None
    mesh=terrain_mesh(directory,points,start=start)
    if plan.get("terrain_evidence_id")!=mesh["terrain_id"]:raise ValueError("Plan terrain evidence differs from the loaded world")
    # Both endpoint altitudes must clear each sampled leg maximum. This conservative bound
    # rejects uncertain routes rather than interpolating through an unseen terrain crest.
    altitudes=[state["relative_altitude_m"] if start else plan["waypoints"][0]["relative_altitude_m"],
               *[p["relative_altitude_m"] for p in plan["waypoints"]],
               plan["recovery_altitude_m"]]
    for i,ground in enumerate(mesh["leg_max_elevations_m"]):
        if min(altitudes[i],altitudes[i+1])+home_absolute_altitude_m-ground<10:
            raise ValueError("Route does not maintain 10 m clearance over the loaded DEM")
    return mesh
