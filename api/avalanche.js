// Reuses the UGRC source/region keys from uac-wasatch-relay and
// Avalanche.org product contract used by avyts-global. Ratings never derive from scans.
import {readJSON,safeGeometry,publicHandler} from '../lib/public-source.js';
export const ZONES='https://services1.arcgis.com/99lidPhWCzftIe9K/ArcGIS/rest/services/recreation_avalanche_center_forecast_zones/FeatureServer/0/query';
export const PRODUCTS='https://api.avalanche.org/v2/public/products/map-layer';
export const regionKey=x=>String(x||'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
export function providerTime(value,zone='America/Denver'){
 if(typeof value!=='string'||!value)return null;
 if(/(?:Z|[+-]\d\d:\d\d)$/.test(value))return Number.isFinite(Date.parse(value))?new Date(value).toISOString():null;
 const match=value.match(/^(\d{4})-(\d\d)-(\d\d)T(\d\d):(\d\d)(?::(\d\d))?$/);
 if(!match)return null;
 const parts=match.slice(1).map(Number),utc=Date.UTC(parts[0],parts[1]-1,parts[2],parts[3],parts[4],parts[5]||0);
 let result=utc;
 try{for(let i=0;i<3;i++){const p=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(new Date(result)).map(p=>[p.type,p.value]));const at=Date.UTC(+p.year,+p.month-1,+p.day,+p.hour,+p.minute,+p.second);result+=utc-at;}return new Date(result).toISOString();}catch{return null;}
}
export function normalizeZones(zones,products,now=Date.now()){
 const forecasts=(products.features||[]).filter(f=>f.properties?.center_id==='UAC');
 return (zones.features||[]).filter(f=>safeGeometry(f.geometry)).slice(0,12).map(f=>{
  const p=f.properties||{},id=regionKey(p.forecast_key),product=forecasts.find(x=>regionKey(x.properties?.link?.split('/').filter(Boolean).at(-1))===id||regionKey(x.properties?.name)===id),q=product?.properties||{};
  const from=providerTime(q.start_date,q.timezone),until=providerTime(q.end_date,q.timezone),level=Number.isInteger(q.danger_level)&&q.danger_level>=1&&q.danger_level<=5?q.danger_level:null;
  const status=level&&q.off_season!==true&&Date.parse(from)<=now&&now<Date.parse(until)?'current':level?'expired_or_undated':'unrated';
  return {id:'uac:'+id,name:String(p.name||id),geometry:f.geometry,source:'UGRC / Utah Avalanche Center',source_url:'https://utahavalanchecenter.org/forecast/'+id,geometry_source:ZONES,forecast_source:PRODUCTS,source_updated_at:from,avalanche_rating:{status,level:status==='current'?level:null,published_level:level,valid_from:from,valid_until:until},travel_advice:String(q.travel_advice||'').slice(0,1500)};
 });
}
export async function loadAvalanche(fetcher=fetch){
 const params=new URLSearchParams({f:'geojson',where:'1=1',outFields:'name,center,forecast_link,forecast_key',returnGeometry:'true',outSR:'4326',geometryPrecision:'6'});
 const [zones,products]=await Promise.allSettled([readJSON(ZONES+'?'+params,fetcher),readJSON(PRODUCTS,fetcher)]);
 if(zones.status!=='fulfilled')throw Error('UAC zone boundaries unavailable');
 return {regions:normalizeZones(zones.value,products.status==='fulfilled'?products.value:{features:[]}),retrievedAt:new Date().toISOString(),warnings:products.status==='rejected'?['Forecast product unavailable; region geometry remains available without danger ratings.']:[]};
}
export default publicHandler(()=>loadAvalanche());
