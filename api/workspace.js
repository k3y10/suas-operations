const ROOT = "https://api.terrasatch.com";
const UUID = "[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}";
const ORG = "^/api/v1/workspace/organizations/" + UUID;
const READ = new RegExp(ORG + "(?:$|/radio/events$|/runs(?:/" + UUID + ")?$|/modules/(?:catalog|environment)$|/simulations/(?:capabilities|sessions/" + UUID + "|plans/" + UUID + "|missions(?:/" + UUID + "(?:/telemetry|/track)?)?))$");
const CONTROL = new RegExp(ORG + "/simulations/(?:sessions|assets|plans(?:/" + UUID + "/(?:approve|dispatch))?)$");
const CHAT = new RegExp(ORG + "/chat$");
export function allowedPath(method, path) {
  if (typeof path !== 'string' || path.length>2048 || path.includes("..") || path.includes("\\") || /%(?:2e|2f|5c)/i.test(path) || path.includes('#')) return false;
  const pathname=path.split('?')[0];
  if(method==='GET') return pathname==='/api/v1/workspace/session'||READ.test(pathname);
  return method==='POST'&&(['/api/v1/workspace/login','/api/v1/workspace/logout'].includes(pathname)||CHAT.test(pathname)||CONTROL.test(pathname));
}
export default async function bridge(req,res) {
 res.setHeader('Cache-Control','no-store');res.setHeader('Pragma','no-cache');res.setHeader('X-Content-Type-Options','nosniff');
 const send=(s,b)=>{res.statusCode=s;res.setHeader('Content-Type','application/json');res.end(JSON.stringify(b));};
 let path;try{path=new URL(req.url,'http://localhost').searchParams.get('path');}catch{return send(400,{detail:'Invalid workspace path'});}
 if(!path||!allowedPath(req.method,path))return send(403,{detail:'This bridge permits audited workspace reads, Satchy chat and session login/logout. Aircraft control is unavailable.'});
 if(req.method==='POST'){
  let valid=false;try{valid=!!req.headers.origin&&new URL(req.headers.origin).host===req.headers.host;}catch{}
  if(!valid)return send(403,{detail:'Same-origin workspace request required'});
 }
 const headers={accept:'application/json'};
 const session=(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('session='));
 if(session)headers.cookie=session;
 if(req.headers['x-csrf-token'])headers['x-csrf-token']=req.headers['x-csrf-token'];
 let body;
 if(req.method==='POST'){
  headers['content-type']='application/json';
  if(req.body!==undefined)body=typeof req.body==='string'?req.body:JSON.stringify(req.body);
  else{const parts=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>65536)return send(413,{detail:'Workspace request too large'});parts.push(chunk);}body=Buffer.concat(parts).toString();}
  if(Buffer.byteLength(body||'')>65536)return send(413,{detail:'Workspace request too large'});
  try{JSON.parse(body);}catch{return send(400,{detail:'JSON body required'});}
 }
 try{
  const preview=process.env.TERRASATCH_PRIVATE_SIM_API==='1'&&
   /^(127\.0\.0\.1|localhost):\d+$/.test(req.headers.host||'')&&
   ['127.0.0.1','::1','::ffff:127.0.0.1'].includes(req.socket?.remoteAddress)&&
   new RegExp(ORG+'/simulations(?:/|$)').test(path.split('?')[0]);
  const upstream=await fetch((preview?'http://127.0.0.1:3188':ROOT)+path,{method:req.method,headers,body,redirect:'manual',signal:AbortSignal.timeout((CHAT.test(path.split('?')[0])||CONTROL.test(path.split('?')[0]))?60000:15000)});
  if(upstream.status>=300&&upstream.status<400)return send(502,{detail:'Unexpected workspace redirect'});
  const chunks=[];let size=0;
  for await(const chunk of upstream.body||[]){size+=chunk.length;if(size>1024*1024)return send(502,{detail:'Workspace response exceeded its 1 MiB limit'});chunks.push(chunk);}
  const cookies=upstream.headers.getSetCookie?.()||[];if(cookies.length)res.setHeader('Set-Cookie',cookies);
  res.statusCode=upstream.status;res.setHeader('Content-Type',upstream.headers.get('content-type')||'application/json');res.end(Buffer.concat(chunks));
 }catch{return send(502,{detail:'Workspace unavailable. Check connection before retrying the same request.'});}
}
