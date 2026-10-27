import React,{useEffect,useState} from 'react';
import {computeCanonicalObjectProof} from '../vendor/quaksatch-object.mjs';
export function proofPayload(record){
 const canonical=value=>typeof value==='number'&&!Number.isSafeInteger(value)?String(value):Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).filter(([,v])=>v!==undefined).map(([k,v])=>[k,canonical(v)])):value;
 return canonical({objective:record.objective,plan:record.plan,target:record.target});
}
let statusRequest;
export default function IntegrityStatus({record}){
 const [digest,setDigest]=useState(''),[service,setService]=useState(null);
 const plan=record.runtime?.plan,registered=record.runtime?.integrity;
 const input=plan?{objectType:'terrasatch.simulation-mission',objectId:plan.request_id,payload:{content_hash:plan.content_hash,revision:plan.revision,environment:plan.environment,schema:plan.schema}}:{objectType:'terrasatch.suas-planning-record',objectId:record.id,payload:proofPayload(record)};
 useEffect(()=>{let active=true;setDigest('');computeCanonicalObjectProof(input).then(p=>{if(active)setDigest(p.commitment);}).catch(()=>{if(active)setDigest('unavailable');});return()=>{active=false;};},[plan?.content_hash,record.id,record.plan]);
 useEffect(()=>{let active=true;if(!statusRequest)statusRequest=fetch('/api/integrity',{cache:'no-store'}).then(r=>r.ok?r.json():null).catch(()=>null);statusRequest.then(v=>{if(active)setService(v);});return()=>{active=false;};},[]);
 const verified=registered?.status==='verified'&&digest===registered.commitment;
 const state=verified?'verified by QuakSatch':registered?.status==='verified'&&digest?'failed · record differs from proof':registered?.status==='failed'?'verification failed':registered?.status==='pending'?'proof pending':registered?.status==='unknown'?'registry result unknown':null;
 if(state)return <small className="integrity-status" title={registered?.proof_id?'Proof '+registered.proof_id+(registered.verified_at?' · checked '+registered.verified_at:''):undefined}>Integrity: {state}</small>;
 return <small className="integrity-status" title={digest&&digest!=='unavailable'?'Local QuakSatch v1 object commitment: '+digest:undefined}>Integrity: {digest&&digest!=='unavailable'?'record hashed':'hash pending'} → proof unregistered · {service?.reachable?'QuakSatch reachable':'QuakSatch not verified'}</small>;
}
