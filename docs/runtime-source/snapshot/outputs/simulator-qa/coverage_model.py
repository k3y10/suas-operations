"""Modelled nadir footprint from actual telemetry. Does not create images or sensor measurements."""
import math
from mission_adapter import distance

def update_coverage(plan, row, terrain_directory, visited, sequence):
    if plan.get("payload")!="modeled_rgb" or not row.get("connected") or row.get("in_air") is not True:
        return []
    import h3
    from terrain_mesh import terrain_mesh
    lat,lon,rel=row["latitude_deg"],row["longitude_deg"],row["relative_altitude_m"]
    if any(v is None for v in (lat,lon,rel)):return []
    mesh=terrain_mesh(terrain_directory,[[lat,lon]])
    agl=mesh["home_elevation_m"]+rel-mesh["point_elevations_m"][0]
    if not 5<=agl<=120:return []
    radius=agl*math.tan(math.radians(30))
    records=[]
    for cell in plan.get("cell_index",{}).get("cell_ids",[])[:120]:
        points=sorted(h3.cell_to_children(cell,min(15,h3.get_resolution(cell)+1)))
        seen=visited.setdefault(cell,set())
        for child in points:
            if distance((lat,lon),h3.cell_to_latlng(child))<=radius:seen.add(child)
        pct=round(100*len(seen)/len(points),3)
        records.append({"schema":"terrasatch.cell-coverage.v1","planId":plan["request_id"],
            "revision":plan["revision"],"cellId":cell,"sequence":sequence,"observedAt":row["sampled_at"],
            "coveragePct":pct,"quality":"accepted","sourceId":"modeled:60deg-nadir-telemetry",
            "evidenceId":plan["content_hash"]+":"+str(sequence),"measurements":{},
            "model":{"kind":"modeled_rgb","sampleCount":len(points),"fieldOfViewDegrees":60,
                "basis":"union of H3 child-centre samples inside modelled footprint; no images"}})
    return records
