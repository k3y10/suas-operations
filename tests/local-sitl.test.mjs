import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm,readFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {localSITLPlugin} from '../dev/local-sitl.js';
const packet=JSON.parse(await readFile(new URL('../src/evidence/native-flight.json',import.meta.url)));
test('native developer reader is loopback-only, read-only, bounded and scoped to the configured file',async()=>{
 const root=await mkdtemp(resolve('../test-tmp/native-reader-'));let handler;localSITLPlugin(root).configureServer({middlewares:{use:(_,h)=>handler=h}});
 const invoke=async(patch={})=>{const req={method:'GET',headers:{host:'127.0.0.1:3186'},socket:{remoteAddress:'127.0.0.1'},...patch};let body;const headers={};const res={statusCode:0,setHeader:(k,v)=>headers[k]=v,end:b=>body=b};await handler(req,res);return {status:res.statusCode,body:JSON.parse(body),headers};};
 try{assert.equal((await invoke()).status,404);await writeFile(join(root,'live-flight.json'),JSON.stringify(packet));let r=await invoke();assert.equal(r.status,200);assert.equal(r.body.samples.length,26);assert.equal(r.headers['Cache-Control'],'no-store');assert.equal((await invoke({method:'POST'})).status,405);assert.equal((await invoke({headers:{host:'evil.test:3186'}})).status,403);assert.equal((await invoke({socket:{remoteAddress:'192.168.1.1'}})).status,403);assert.equal((await invoke({headers:{host:'127.0.0.1:3186','sec-fetch-site':'cross-site'}})).status,403);await writeFile(join(root,'live-flight.json'),'x'.repeat(512*1024+1));assert.equal((await invoke()).status,502);}
 finally{await rm(root,{recursive:true,force:true});}
});
