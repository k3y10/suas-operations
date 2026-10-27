// Public WFIGS perimeter context. Fixed source, bounded area/body/cache; no flight controls.
export const FIRE_SOURCE='https://services3.arcgis.com/T4QMspbfLg3qTGWY/ArcGIS/rest/services/WFIGS_Interagency_Perimeters_Current/FeatureServer/0';
const cache=new Map();let active=0;
const date=x=>typeof x==='number'&&Number.isFinite(x)?new Date(x).toISOString():null;
export function normalizeFire(data){
 if(data.error)throw Error('WFIGS source rejected the query.');
 let vertices=0;
 return (data.features||[]).slice(0,8).flatMap(f=>{
  const g=f.geometry,p=f.properties||{};
  if(!['Polygon','MultiPolygon'].includes(g?.type))return [];
  const pairs=g.type==='Polygon'?g.coordinates.flat(1):g.coordinates.flat(2);
  vertices+=pairs.length;
  if(pairs.length>12000||vertices>24000||pairs.some(x=>x.length<2||!x.slice(0,2).every(Number.isFinite)||Math.abs(x[0])>180||Math.abs(x[1])>90))throw Error('Perimeter exceeds geometry budget.');
  const contained=typeof p.attr_PercentContained==='number'&&p.attr_PercentContained>=0&&p.attr_PercentContained<=100?p.attr_PercentContained:null;
  return [{id:'wfigs:'+String(p.poly_IRWINID||p.OBJECTID),name:String(p.poly_IncidentName||'Published perimeter').slice(0,120),
   geometry:g,source_updated_at:date(p.poly_DateCurrent),source_url:FIRE_SOURCE,
   containment_percent:contained,containment_updated_at:date(p.attr_ModifiedOnDateTime_dt),source:'WFIGS interagency perimeter'}];
 });
}
export async function loadFire(lat,lon,fetcher=fetch){
 const d=.25,q=new URLSearchParams({f:'geojson',where:"attr_IncidentTypeCategory='WF'",outFields:'OBJECTID,poly_IRWINID,poly_IncidentName,poly_DateCurrent,attr_PercentContained,attr_ModifiedOnDateTime_dt',
  returnGeometry:'true',outSR:'4326',inSR:'4326',geometryType:'esriGeometryEnvelope',spatialRel:'esriSpatialRelIntersects',
  geometry:[lon-d,lat-d,lon+d,lat+d].join(','),geometryPrecision:'5',maxAllowableOffset:'0.00005',resultRecordCount:'8',orderByFields:'poly_DateCurrent DESC'});
 const r=await fetcher(FIRE_SOURCE+'/query?'+q,{signal:AbortSignal.timeout(10000),redirect:'error',headers:{Accept:'application/geo+json'}});
 if(!r.ok)throw Error('WFIGS unavailable.');
 const chunks=[];let size=0;for await(const c of r.body){size+=c.length;if(size>2*1024*1024)throw Error('Perimeter source exceeds 2 MiB.');chunks.push(c);}
 const data=JSON.parse(Buffer.concat(chunks).toString());
 return {source:'WFIGS',sourceURL:FIRE_SOURCE,retrievedAt:new Date().toISOString(),regions:normalizeFire(data),truncated:data.exceededTransferLimit===true||data.properties?.exceededTransferLimit===true};
}
export default async function handler(req,res){
 const send=(status,value)=>{res.statusCode=status;res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');res.end(JSON.stringify(value));};
 if(req.method!=='GET')return send(405,{detail:'Perimeter reads only.'});
 const u=new URL(req.url,'http://localhost'),lat=Number(u.searchParams.get('lat')),lon=Number(u.searchParams.get('lon'));
 if(!u.searchParams.has('lat')||!u.searchParams.has('lon')||!Number.isFinite(lat)||!Number.isFinite(lon)||lat<18||lat>72||lon< -179||lon> -64)return send(400,{detail:'Select a supported US location.'});
 const key=lat.toFixed(2)+','+lon.toFixed(2),old=cache.get(key);if(old&&Date.now()-old.at<300000)return send(200,old.value);
 if(active>=2)return send(429,{detail:'Perimeter request capacity reached.'});
 active++;try{const value=await loadFire(Number(lat.toFixed(2)),Number(lon.toFixed(2)));if(cache.size>=16)cache.delete(cache.keys().next().value);cache.set(key,{at:Date.now(),value});return send(200,value);}catch{return send(502,{detail:'WFIGS perimeters unavailable; no boundaries were estimated.'});}finally{active--;}
}
