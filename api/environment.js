// Bounded public NWS context. No workspace cookies, keys, or aircraft control.
const cache=new Map();let active=0;
const ROOT='https://api.weather.gov';
export function nwsURL(value){const u=new URL(value,ROOT);if(u.origin!==ROOT)throw Error('Unexpected weather source.');return u.href;}
async function read(url,fetcher){const r=await fetcher(nwsURL(url),{headers:{Accept:'application/geo+json','User-Agent':'TerraSatch-sUAS-weather (terrasatch.com)'},signal:AbortSignal.timeout(6000),redirect:'error'});if(!r.ok)throw Error('NWS source unavailable ('+r.status+').');let n=0;const chunks=[];for await(const c of r.body){n+=c.byteLength;if(n>1024*1024)throw Error('Weather source exceeds budget.');chunks.push(c);}return JSON.parse(Buffer.concat(chunks).toString());}
const q=(x)=>typeof x?.value==='number'&&Number.isFinite(x.value)?{value:x.value,unit:x.unitCode}:null;
export async function loadWeather(lat,lon,fetcher=fetch){
 const point=(await read('/points/'+lat+','+lon,fetcher)).properties;
 const tasks=await Promise.allSettled([
  read(point.observationStations,fetcher).then(async x=>{const ids=(x.features||[]).slice(0,3).map(s=>s.id).filter(Boolean);if(!ids.length)throw Error('No observation station.');const results=await Promise.allSettled(ids.map(id=>read(id+'/observations/latest',fetcher)));const values=results.flatMap((r,i)=>r.status==='fulfilled'?[{...r.value,stationOrder:i}]:[]);if(!values.length)throw Error('Station observations unavailable.');return values.sort((a,b)=>{const ta=Date.parse(a.properties?.timestamp),tb=Date.parse(b.properties?.timestamp),freshA=Number.isFinite(ta)&&Date.now()-ta<3600000&&ta<=Date.now()+5000,freshB=Number.isFinite(tb)&&Date.now()-tb<3600000&&tb<=Date.now()+5000;return Number(freshB)-Number(freshA)||(freshA?a.stationOrder-b.stationOrder:tb-ta);})[0];}),
  read(point.forecastHourly,fetcher),
  read('/alerts/active?point='+lat+','+lon,fetcher)
 ]);
 const [obs,forecast,alerts]=tasks.map(r=>r.status==='fulfilled'?r.value:null),o=obs?.properties;
 return {source:'National Weather Service',sourceURL:'https://forecast.weather.gov/MapClick.php?lat='+lat+'&lon='+lon,retrievedAt:new Date().toISOString(),point:[lon,lat],state:point.relativeLocation?.properties?.state||null,
 observation:o?{station:o.station,observedAt:o.timestamp,description:o.textDescription,temperature:q(o.temperature),relativeHumidity:q(o.relativeHumidity),windSpeed:q(o.windSpeed),windGust:q(o.windGust),windDirection:q(o.windDirection)}:null,
 forecastUpdatedAt:forecast?.properties?.updateTime||forecast?.properties?.updated||forecast?.properties?.generatedAt||null,forecast:(forecast?.properties?.periods||[]).slice(0,6).map(x=>({startTime:x.startTime,temperature:x.temperature,temperatureUnit:x.temperatureUnit,windSpeed:x.windSpeed,windDirection:x.windDirection,shortForecast:x.shortForecast})),
 alerts:(alerts?.features||[]).slice(0,10).map(x=>({id:x.id,event:x.properties.event,headline:x.properties.headline,severity:x.properties.severity,onset:x.properties.onset,expires:x.properties.expires,description:String(x.properties.description||'').slice(0,2500)})),
 warnings:tasks.flatMap((r,i)=>r.status==='rejected'?[['Station observations unavailable.','Hourly forecast unavailable.','Active alerts unavailable.'][i]]:[])};
}
export default async function handler(req,res){
 const send=(status,data)=>{res.statusCode=status;res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.end(JSON.stringify(data));};
 if(req.method!=='GET')return send(405,{detail:'Weather reads only.'});
 const u=new URL(req.url,'http://localhost'),lat=Number(u.searchParams.get('lat')),lon=Number(u.searchParams.get('lon'));
 if(!u.searchParams.has('lat')||!u.searchParams.has('lon')||!Number.isFinite(lat)||!Number.isFinite(lon)||lat<18||lat>72||lon< -179||lon> -64)return send(400,{detail:'Select a supported US weather location.'});
 const key=lat.toFixed(3)+','+lon.toFixed(3),old=cache.get(key);if(old&&Date.now()-old.time<300000)return send(200,old.data);
 if(active>=4)return send(429,{detail:'Weather request capacity reached. Retry shortly.'});
 active++;try{const data=await loadWeather(Number(lat.toFixed(3)),Number(lon.toFixed(3)));if(cache.size>=32)cache.delete(cache.keys().next().value);cache.set(key,{time:Date.now(),data});return send(200,data);}catch{return send(502,{detail:'NWS weather is unavailable. No replacement readings were generated.'});}finally{active--;}
}
