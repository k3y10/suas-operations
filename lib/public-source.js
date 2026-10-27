// Public, fixed-origin reads only. Never forward workspace credentials.
export async function readJSON(url,fetcher=fetch,maxBytes=3*1024*1024){
 const r=await fetcher(url,{headers:{Accept:'application/json, application/geo+json','User-Agent':'TerraSatch-SUAS/1.0 (https://terrasatch.com)'},signal:AbortSignal.timeout(12000),redirect:'error'});
 if(!r.ok)throw Error('Public source returned '+r.status);
 let size=0;const chunks=[];
 for await(const c of r.body){size+=c.byteLength;if(size>maxBytes)throw Error('Public source exceeds geometry budget');chunks.push(c);}
 const data=JSON.parse(Buffer.concat(chunks).toString());if(data.error)throw Error(data.error.message||'Source query failed');return data;
}
export const iso=x=>typeof x==='number'&&Number.isFinite(x)?new Date(x).toISOString():null;
export function safeGeometry(g){
 if(!['Polygon','MultiPolygon'].includes(g?.type))return false;
 const pairs=g.type==='Polygon'?g.coordinates.flat(1):g.coordinates.flat(2);
 return pairs.length>=4&&pairs.length<=24000&&pairs.every(p=>p.length>=2&&Number.isFinite(p[0])&&Number.isFinite(p[1])&&Math.abs(p[0])<=180&&Math.abs(p[1])<=90);
}
export function publicHandler(loader,{ttl=300000,maxEntries=24}={}){
 const cache=new Map();let active=0;
 return async(req,res)=>{
  const send=(status,value)=>{res.statusCode=status;res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.end(JSON.stringify(value));};
  if(req.method!=='GET')return send(405,{detail:'Public context reads only.'});
  const u=new URL(req.url,'http://localhost'),key=u.searchParams.toString();
  const old=cache.get(key);if(old&&Date.now()-old.at<ttl)return send(200,old.value);
  if(active>=3)return send(429,{detail:'Context capacity reached. Retry shortly.'});
  active++;try{const value=await loader(u.searchParams);if(cache.size>=maxEntries)cache.delete(cache.keys().next().value);cache.set(key,{value,at:Date.now()});return send(200,value);}
  catch(e){return send(e.name==='RangeError'?400:502,{detail:e.name==='RangeError'?e.message:'Public source unavailable. No replacement measurements were generated.'});}finally{active--;}
 };
}
export function pointParams(params){const lat=Number(params.get('lat')),lon=Number(params.get('lon'));if(!params.has('lat')||!params.has('lon')||!Number.isFinite(lat)||!Number.isFinite(lon)||lat<18||lat>72||lon< -179||lon> -64)throw new RangeError('Select a supported US location.');return {lat,lon};}
