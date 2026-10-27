import {readJSON,iso,publicHandler,pointParams} from '../lib/public-source.js';
export const RAIN='https://mapservices.weather.noaa.gov/raster/rest/services/obs/mrms_qpe/ImageServer';
export async function loadRain(lat,lon,fetcher=fetch){
 const q=new URLSearchParams({f:'json',where:"idp_subset='conus_QPE_24H'",outFields:'objectid,idp_filedate,idp_validendtime',returnGeometry:'false',resultRecordCount:'1',orderByFields:'idp_validendtime DESC'});
 const catalog=await readJSON(RAIN+'/query?'+q,fetcher),p=catalog.features?.[0]?.attributes;
 if(!p)throw Error('24-hour QPE catalog unavailable');
 const end=iso(p.idp_validendtime),fresh=end&&Date.now()-Date.parse(end)>=-300000&&Date.now()-Date.parse(end)<10800000;
 const rule={mosaicMethod:'esriMosaicLockRaster',lockRasterIds:[p.objectid]};
 const points=[];for(let y=-1;y<=1;y++)for(let x=-1;x<=1;x++)points.push([lon+x*.009/Math.cos(lat*Math.PI/180),lat+y*.009]);
 let samples=[],warning=null;
 if(fresh)try{
  const s=new URLSearchParams({f:'json',geometryType:'esriGeometryMultipoint',geometry:JSON.stringify({points,spatialReference:{wkid:4326}}),mosaicRule:JSON.stringify(rule),renderingRule:JSON.stringify({rasterFunction:'None'}),returnFirstValueOnly:'true',outFields:'idp_validendtime'});
  samples=(await readJSON(RAIN+'/getSamples?'+s,fetcher)).samples||[];
 }catch{warning='QPE point samples unavailable. Overlay remains source imagery only.';}
 return {sourceURL:RAIN,retrievedAt:new Date().toISOString(),endAt:end,startAt:end?new Date(Date.parse(end)-86400000).toISOString():null,fresh:!!fresh,
 tileURL:RAIN+'/exportImage?f=image&bbox={bbox-epsg-3857}&bboxSR=3857&imageSR=3857&size=256,256&format=png32&transparent=true&renderingRule='+encodeURIComponent(JSON.stringify({rasterFunction:'rft_24hr'}))+'&mosaicRule='+encodeURIComponent(JSON.stringify(rule)),
 samples:samples.slice(0,9).flatMap(s=>{const value=Number(s.value),x=s.location?.x,y=s.location?.y;return s.value!==''&&s.value!==null&&s.value!=='NoData'&&Number.isFinite(value)&&value>=0&&value<1000&&Number.isFinite(x)&&Number.isFinite(y)?[{point:[x,y],millimetres:value*25.4}]:[];}),warning};
}
export default publicHandler(params=>{const {lat,lon}=pointParams(params);return loadRain(lat,lon);},{ttl:300000});
