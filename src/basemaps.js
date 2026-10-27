export const MAX_MAP_ZOOM=17.5;
export const NAIP_SERVICE="https://apps.geo.fpac.usda.gov/geo-imagery/rest/services/naip/conus_naip/ImageServer";
export const NAIP_DETAIL={type:"raster",tiles:[NAIP_SERVICE+"/exportImage?f=image&bbox={bbox-epsg-3857}&bboxSR=3857&imageSR=3857&size=512,512&format=jpg&bandIds=0,1,2"],tileSize:512,minzoom:13,maxzoom:18,bounds:[-124.69214,24.43493,-66.83814,49.47199],attribution:'Aerial imagery: <a href="https://gis.utah.gov/products/sgid/aerial-photography/naip/">USDA NAIP</a> · archival, acquisition dates vary'};
export const BASEMAPS = {
  imagery: {
    label: "Satellite imagery",
    note: "USDA NAIP detail · USGS overview · archival",
    href: NAIP_SERVICE,
    source: {
      type: "raster",
      tiles: ["https://basemap.nationalmap.gov/arcgis/rest/services/USGSImageryOnly/MapServer/tile/{z}/{y}/{x}"],
      tileSize: 256,
      maxzoom: 16,
      attribution: 'Map services and data available from <a href="https://www.usgs.gov/programs/national-geospatial-program">U.S. Geological Survey, National Geospatial Program</a> · USDA/NAIP',
    },
    paint: {
      "raster-saturation": 0.05,
      "raster-brightness-max": 1,
      "raster-contrast": 0.05,
      "raster-fade-duration": 180,
    },
  },
};
export function mapStyle(basemap) {
  const value = BASEMAPS[basemap] || BASEMAPS.imagery;
  return {
    version: 8,
    sources: { basemap: value.source, "naip-detail":NAIP_DETAIL },
    layers: [
      { id: "background", type: "background", paint: { "background-color": "#142128" } },
      { id: "basemap", type: "raster", source: "basemap", paint: value.paint },
      { id:"naip-detail",type:"raster",source:"naip-detail",minzoom:13,paint:{"raster-opacity":["interpolate",["linear"],["zoom"],13,0,14,1],"raster-fade-duration":200} },
    ],
  };
}
export const BASEMAP_KEY = "terrasatch.sim.basemap.v1";
export function savedBasemap(storage) {
  try {
    const value = storage.getItem(BASEMAP_KEY);
    return Object.hasOwn(BASEMAPS, value) ? value : "imagery";
  } catch {
    return "imagery";
  }
}
