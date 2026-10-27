// Developer-only reader. Never deployed as a Vercel function; has no control endpoint.
import {readFile,lstat,realpath} from 'node:fs/promises';
import {resolve,dirname,join} from 'node:path';
import {decodeNativePacket} from '../src/flight-data.js';
export function localSITLPlugin(qaRoot){
 const middleware=async(req,res)=>{
  const send=(s,b)=>{res.statusCode=s;res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.end(JSON.stringify(b));};
  const host=req.headers.host||'';
  if(!/^(127\.0\.0\.1|localhost):\d+$/.test(host)||!['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress)||req.headers['sec-fetch-site']==='cross-site')return send(403,{detail:'Local simulator reader requires loopback.'});
  if(req.method!=='GET')return send(405,{detail:'Read-only simulator telemetry.'});
  if(req.headers.origin&&req.headers.origin!=='http://'+host)return send(403,{detail:'Same-origin read required.'});
  if(!qaRoot)return send(503,{detail:'Local simulator reader is not configured.'});
  try{
   const root=resolve(qaRoot);if(await realpath(root)!==root||(await lstat(root)).isSymbolicLink())throw Error('Unexpected QA root.');
   const file=join(root,'live-flight.json');const stat=await lstat(file);
   if(stat.isSymbolicLink()||!stat.isFile()||stat.size>512*1024||dirname(await realpath(file))!==root)throw Error('Invalid telemetry file.');
   const packet=JSON.parse(await readFile(file,'utf8'));decodeNativePacket(packet);
   return send(200,packet);
  }catch(e){return send(e.code==='ENOENT'?404:502,{detail:e.code==='ENOENT'?'No local flight is running. Start the native QA launcher in Ubuntu.':'Local telemetry is invalid or unavailable.'});}
 };
 return {name:'loopback-native-sitl-reader',configureServer(s){s.middlewares.use('/api/local-sitl',middleware);},configurePreviewServer(s){s.middlewares.use('/api/local-sitl',middleware);}};
}
