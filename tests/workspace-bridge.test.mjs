import test from 'node:test';
import assert from 'node:assert/strict';
import bridge from '../api/workspace.js';
const org='/api/v1/workspace/organizations/00000000-0000-0000-0000-000000000000';
async function invoke(path,patch={}){const req={url:'/?path='+encodeURIComponent(path),method:'GET',headers:{host:'sim.test'},...patch};const headers={};let body;const res={setHeader:(k,v)=>headers[k]=v,end:v=>body=v,statusCode:0};await bridge(req,res);return {status:res.statusCode,body:String(body),headers};}
test('chat forwards existing session/CSRF only, to the fixed API origin; preserves request identity',async()=>{
 const original=globalThis.fetch;let call;globalThis.fetch=async(url,init)=>{call={url,init};return new Response(JSON.stringify({run_id:'run',answer:'Actual backend contract'}),{status:200,headers:{'content-type':'application/json'}});};
 try{const result=await invoke(org+'/chat',{method:'POST',body:{request_id:'stable-request',message:'Review source'},headers:{host:'sim.test',origin:'https://sim.test',cookie:'other=private; session=existing',authorization:'Bearer do-not-forward','x-csrf-token':'existing-csrf'}});assert.equal(result.status,200);assert.equal(call.url,'https://api.terrasatch.com'+org+'/chat');assert.equal(call.init.headers.cookie,'session=existing');assert.equal(call.init.headers['x-csrf-token'],'existing-csrf');assert.equal(call.init.headers.authorization,undefined);assert.equal(JSON.parse(call.init.body).request_id,'stable-request');assert.equal(result.headers['Cache-Control'],'no-store');}
 finally{globalThis.fetch=original;}
});
test('cross-origin chat, mutations, traversal, arbitrary hosts and oversized requests never reach upstream',async()=>{
 const original=globalThis.fetch;let calls=0;globalThis.fetch=async()=>{calls++;throw Error('Unexpected upstream');};
 try{assert.equal((await invoke(org+'/chat',{method:'POST',body:'{}',headers:{host:'sim.test',origin:'https://evil.test'}})).status,403);assert.equal((await invoke(org+'/chat',{method:'POST',body:'x'.repeat(65537),headers:{host:'sim.test',origin:'https://sim.test'}})).status,413);for(const p of [org+'/actions/00000000-0000-0000-0000-000000000000','https://evil.test',org+'/../chat',org+'/simulations/missions'])assert.equal((await invoke(p,{method:'POST'})).status,403);assert.equal(calls,0);}
 finally{globalThis.fetch=original;}
});
test('upstream redirects and responses above 1 MiB fail closed',async()=>{
 const original=globalThis.fetch;
 try{globalThis.fetch=async()=>new Response(null,{status:302,headers:{location:'https://other.test'}});assert.equal((await invoke(org)).status,502);globalThis.fetch=async()=>new Response('x'.repeat(1024*1024+1));assert.equal((await invoke(org)).status,502);}
 finally{globalThis.fetch=original;}
});
