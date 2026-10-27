"""Generate an isolated Gazebo heightfield at the selected real coordinates."""
import io
import json
import math
from pathlib import Path
import struct
from urllib.parse import urlencode
from urllib.request import Request, urlopen
import xml.etree.ElementTree as ET
from PIL import Image

def fetch_bytes(url,limit=4*1024*1024):
    with urlopen(Request(url,headers={"User-Agent":"TerraSatch-sUAS-simulation"}),timeout=10) as response:
        data=response.read(limit+1)
    if len(data)>limit:
        raise ValueError("Terrain/imagery response exceeded budget")
    return data

def make_world(px4_root,directory,latitude,longitude,width=1000):
    if not (18<=latitude<=72 and -179<=longitude<=-64 and width==1000):
        raise ValueError("Selected home is outside the supported US terrain profile")
    directory=Path(directory);directory.mkdir(exist_ok=True)
    n,scale=2**12,2**12*256
    def pixel(lon,lat):
        return ((lon+180)/360*scale,
                (1-math.asinh(math.tan(math.radians(lat)))/math.pi)/2*scale)
    tiles={}
    def height(lon,lat):
        x,y=pixel(lon,lat);x,y=int(x),int(y);tx,ty=x//256,y//256
        key=(tx,ty)
        if key not in tiles:
            if len(tiles)>=12:raise ValueError("Terrain tile budget exceeded")
            data=fetch_bytes(f"https://elevation-tiles-prod.s3.amazonaws.com/terrarium/12/{tx}/{ty}.png")
            image=Image.open(io.BytesIO(data)).convert("RGB")
            if image.size!=(256,256):raise ValueError("Unexpected DEM tile dimensions")
            tiles[key]=image
        r,g,b=tiles[key].getpixel((x%256,y%256))
        z=r*256+g+b/256-32768
        if not -1000<z<9000:raise ValueError("Missing DEM elevation")
        return z
    spacing=width/256;values=[]
    for row in range(257):
        north=width/2-row*spacing
        lat=latitude+north/111320
        for col in range(257):
            east=-width/2+col*spacing
            lon=longitude+east/(111320*math.cos(math.radians(latitude)))
            values.append(height(lon,lat))
    low,high=min(values),max(values)
    vertical=max(1,high-low)
    pixels=b"".join(struct.pack("<H",round((z-low)/vertical*65535)) for z in values)
    image=Image.frombytes("I;16",(257,257),pixels)
    image.save(directory/"height.png")
    home=values[128*257+128]
    dx=width/2/(111320*math.cos(math.radians(latitude)));dy=width/2/111320
    bbox=f"{longitude-dx},{latitude-dy},{longitude+dx},{latitude+dy}"
    query=urlencode({"bbox":bbox,"bboxSR":4326,"imageSR":4326,"size":"1024,1024",
                     "format":"png","f":"image"})
    imagery=fetch_bytes("https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryOnly/MapServer/export?"+query)
    satellite=Image.open(io.BytesIO(imagery)).convert("RGB")
    satellite.save(directory/"satellite.png")
    Image.new("RGB",(2,2),(128,128,255)).save(directory/"normal.png")
    source=Path(px4_root)/"Tools/simulation/gz/worlds/default.sdf"
    tree=ET.parse(source);world=tree.getroot().find("world")
    if world is None:raise ValueError("Pinned Gazebo default world is unavailable")
    world.set("name","terrasatch")
    # Configure the frame before any sensor is spawned, rather than moving an active world.
    spherical=world.find("spherical_coordinates")
    for name,value in (("latitude_deg",latitude),("longitude_deg",longitude),("elevation",home)):
        entry=spherical.find(name)
        if entry is None:entry=ET.SubElement(spherical,name)
        entry.text=str(value)
    removed=False
    for model in list(world.findall("model")):
        if model.find(".//plane") is not None:
            world.remove(model);removed=True
    if not removed:raise ValueError("Default plane could not be replaced safely")
    model=ET.SubElement(world,"model",name="terrasatch_real_terrain")
    ET.SubElement(model,"static").text="true"
    ET.SubElement(model,"pose").text=f"0 0 {low-home} 0 0 0"
    link=ET.SubElement(model,"link",name="terrain")
    for kind in ("collision","visual"):
        part=ET.SubElement(link,kind,name=kind)
        geom=ET.SubElement(part,"geometry")
        hm=ET.SubElement(geom,"heightmap")
        ET.SubElement(hm,"uri").text=(directory/"height.png").as_uri()
        ET.SubElement(hm,"size").text=f"{width} {width} {vertical}"
        ET.SubElement(hm,"pos").text="0 0 0"
        ET.SubElement(hm,"sampling").text="1"
        if kind=="visual":
            texture=ET.SubElement(hm,"texture")
            ET.SubElement(texture,"diffuse").text=(directory/"satellite.png").as_uri()
            ET.SubElement(texture,"normal").text=(directory/"normal.png").as_uri()
            ET.SubElement(texture,"size").text=str(width)
    pad=ET.SubElement(world,"model",name="terrasatch_virtual_launch_pad")
    ET.SubElement(pad,"static").text="true"
    ET.SubElement(pad,"pose").text="0 0 0.9 0 0 0"
    padlink=ET.SubElement(pad,"link",name="launch_pad")
    for kind in ("collision","visual"):
        part=ET.SubElement(padlink,kind,name=kind)
        box=ET.SubElement(ET.SubElement(part,"geometry"),"box")
        ET.SubElement(box,"size").text="2 2 0.2"
    tree.write(directory/"terrasatch.sdf",encoding="utf-8",xml_declaration=True)
    metadata={"latitude":latitude,"longitude":longitude,"home_elevation_m":home,
        "width_m":width,"height_min_m":low,"height_max_m":high,
        "dem":"Terrarium DEM","dem_zoom":12,"dem_pixel_spacing_m":2*math.pi*6378137*math.cos(math.radians(latitude))/scale,
        "heightfield_grid_spacing_m":spacing,
        "imagery":"USGS / USDA historical imagery; not live camera output",
        "launch_surface":"Explicit virtual level 2 m pad, 1 m above DEM home; model spawn 1.2 m",
        "heightfield":"Actual DEM elevations; no buildings, vegetation or obstacle validation"}
    (directory/"terrain.json").write_text(json.dumps(metadata,indent=2,allow_nan=False))
    return metadata
